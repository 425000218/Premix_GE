import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import 'multer';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PaginationMeta } from '../../common/dto/pagination.dto.js';
import { ProcedureService } from '../../database/procedure.service.js';
import { ImportForecastQueryDto } from './dto/import-forecast-query.dto.js';
import { ImportHistoryQueryDto } from './dto/import-history-query.dto.js';
import { ExcelParserService } from './excel-parser.service.js';

export interface DailySetFiles {
  onHand?: Express.Multer.File[];
  movement?: Express.Multer.File[];
  poPending?: Express.Multer.File[];
  poReceipt?: Express.Multer.File[];
  transfer?: Express.Multer.File[];
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly procedureService: ProcedureService,
    private readonly excelParserService: ExcelParserService,
  ) {}

  /**
   * Nạp Master Data (5 sheets) nguyên tử (F03a)
   */
  async importMasterData(
    file: Express.Multer.File,
    importedBy: string,
    dryRun: boolean = false,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file Excel Master Data để tải lên.');
    }

    const originalName = file.originalname || 'Master Data.xlsx';
    if (!originalName.match(/\.(xlsx|xls)$/i)) {
      throw new BadRequestException('Chỉ chấp nhận file định dạng Excel (.xlsx, .xls).');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File tải lên bị rỗng (0 bytes).');
    }

    const parsed = this.excelParserService.parseMasterData(file.buffer);
    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    const plantsJson = JSON.stringify(parsed.plants);
    const materialsJson = JSON.stringify(parsed.materials);
    const suppliersJson = JSON.stringify(parsed.suppliers);
    const plantItemsJson = JSON.stringify(parsed.plantItems);
    const substitutionsJson =
      parsed.substitutions && parsed.substitutions.length > 0
        ? JSON.stringify(parsed.substitutions)
        : null;

    try {
      const rows = await this.procedureService.executeProcedure('dbo.usp_Import_MasterData', {
        PlantsJson: plantsJson,
        MaterialsJson: materialsJson,
        SuppliersJson: suppliersJson,
        PlantItemsJson: plantItemsJson,
        SubstitutionsJson: substitutionsJson,
        OriginalFileName: originalName,
        FileHash: fileHash,
        ImportedBy: importedBy,
        DryRun: dryRun ? 1 : 0,
      });

      if (!rows || rows.length === 0) {
        throw new InternalServerErrorException('Không nhận được phản hồi từ thủ tục nạp Master Data.');
      }

      const res = rows[0];
      return {
        batchId: Number(res.BatchID),
        totalRows: Number(res.TotalRows),
        plantsCount: Number(res.PlantsCount),
        materialsCount: Number(res.MaterialsCount),
        suppliersCount: Number(res.SuppliersCount),
        plantItemsCount: Number(res.PlantItemsCount),
        substitutionsCount: Number(res.SubstitutionsCount),
        vendorItemsCount: parsed.vendorItems?.length || 0,
        status: res.Status,
        fileHash,
        fileName: originalName,
        isDryRun: dryRun,
      };
    } catch (err: any) {
      this.logger.error(`Error executing dbo.usp_Import_MasterData: ${err.message}`, err.stack);
      throw new BadRequestException(`Lỗi nạp Master Data: ${err.message || 'Lỗi không xác định'}`);
    }
  }

  /**
   * Nạp Bộ 5 File ERP Ngày Chốt trong 1 Transaction nguyên tử duy nhất (F03b - BR-17)
   * Gồm: On Hand (SOH), Movement (INV46), PO Pending (FINISH PENDING), PO Receipt (POR), Transfer Order (Sheet1)
   */
  async importDailySet(
    files: DailySetFiles,
    importedBy: string,
    dryRun: boolean = false,
    explicitSnapshotDate?: string,
  ) {
    const onHandFile = files?.onHand?.[0];
    const movementFile = files?.movement?.[0];
    const poPendingFile = files?.poPending?.[0];
    const poReceiptFile = files?.poReceipt?.[0];
    const transferFile = files?.transfer?.[0];

    // BR-17: Bắt buộc đủ trọn bộ 5 file
    const missingFiles: string[] = [];
    if (!onHandFile) missingFiles.push('onHand (On Hand - SOH)');
    if (!movementFile) missingFiles.push('movement (Inventory Movement - INV46)');
    if (!poPendingFile) missingFiles.push('poPending (PO Pending - FINISH PENDING)');
    if (!poReceiptFile) missingFiles.push('poReceipt (PO Receipt - POR)');
    if (!transferFile) missingFiles.push('transfer (Transfer Order - Sheet1)');

    if (missingFiles.length > 0) {
      throw new BadRequestException(
        `Vi phạm BR-17: Bắt buộc tải lên đủ trọn bộ 5 file ERP cùng lúc. Thiếu: ${missingFiles.join(', ')}.`,
      );
    }

    const allFiles = [onHandFile!, movementFile!, poPendingFile!, poReceiptFile!, transferFile!];
    for (const f of allFiles) {
      if (!f.originalname?.match(/\.(xlsx|xls)$/i)) {
        throw new BadRequestException(`File "${f.originalname}" không đúng định dạng Excel (.xlsx, .xls).`);
      }
      if (!f.buffer || f.buffer.length === 0) {
        throw new BadRequestException(`File "${f.originalname}" bị rỗng (0 bytes).`);
      }
    }

    // 1. Trích xuất ngày cắt D và ngày chốt C = D - 1 (BR-15e)
    const fileNames = allFiles.map((f) => f.originalname);
    const { snapshotDate, cutoffDate } = this.excelParserService.extractCutoffAndSnapshotDate(
      fileNames,
      explicitSnapshotDate,
    );

    // 2. Trích xuất khoảng ngày nhận hàng trên tên file POR (BR-18)
    const { porStartDate, porEndDate } = this.excelParserService.extractPorDateRange(
      poReceiptFile!.originalname,
    );

    // 3. Phân tích từng file Excel
    const onHandRows = this.excelParserService.parseOnHand(onHandFile!.buffer);
    const movementRows = this.excelParserService.parseMovement(movementFile!.buffer);
    const poPendingRows = this.excelParserService.parsePoPending(poPendingFile!.buffer);
    const poReceiptRows = this.excelParserService.parsePoReceipt(poReceiptFile!.buffer);
    const transferRows = this.excelParserService.parseTransferOrder(transferFile!.buffer);

    // 4. Tính mã băm SHA-256 tổng hợp của cả 5 file
    const hashSum = crypto.createHash('sha256');
    for (const f of allFiles) {
      hashSum.update(f.buffer);
    }
    const combinedFileHash = hashSum.digest('hex');
    const combinedFileName = fileNames.join(' | ').slice(0, 250);

    // 5. Thực thi Stored Procedure nguyên tử dbo.usp_Import_DailySet
    try {
      const datasets = await this.procedureService.executeMultiSetProcedure('dbo.usp_Import_DailySet', {
        SnapshotDate: snapshotDate,
        CutoffDate: cutoffDate,
        PorStartDate: porStartDate,
        PorEndDate: porEndDate,
        OnHandJson: JSON.stringify(onHandRows),
        MovementJson: JSON.stringify(movementRows),
        PoPendingJson: JSON.stringify(poPendingRows),
        PoReceiptJson: JSON.stringify(poReceiptRows),
        TransferJson: JSON.stringify(transferRows),
        OriginalFileName: combinedFileName,
        FileHash: combinedFileHash,
        ImportedBy: importedBy,
        DryRun: dryRun ? 1 : 0,
      });

      const summaryRow = datasets[0]?.[0];
      if (!summaryRow) {
        throw new InternalServerErrorException('Không nhận được phản hồi từ thủ tục dbo.usp_Import_DailySet.');
      }

      const issues = (datasets[1] || []).map((i: any) => ({
        issueId: i.IssueID || null,
        factoryId: i.FactoryID,
        factoryCode: i.FactoryCode,
        materialId: i.MaterialID,
        materialCode: i.MaterialCode,
        materialName: i.MaterialName,
        issueType: i.IssueType,
        severity: i.Severity,
        description: i.Description,
      }));

      return {
        batchId: Number(summaryRow.BatchID),
        snapshotDate,
        cutoffDate,
        porStartDate,
        porEndDate,
        totalRows: Number(summaryRow.TotalRows),
        onHandRows: Number(summaryRow.OnHandRows),
        movementRows: Number(summaryRow.MovementRows),
        poPendingRows: Number(summaryRow.PoPendingRows),
        poReceiptRows: Number(summaryRow.PoReceiptRows),
        transferRows: Number(summaryRow.TransferRows),
        issueCount: Number(summaryRow.IssueCount),
        qualityIssues: issues,
        status: summaryRow.Status,
        fileHash: combinedFileHash,
        files: fileNames,
        isDryRun: dryRun,
      };
    } catch (err: any) {
      this.logger.error(`Error executing dbo.usp_Import_DailySet: ${err.message}`, err.stack);
      throw new BadRequestException(`Lỗi nạp bộ 5 file ERP: ${err.message || 'Giao dịch đã được ROLLBACK'}`);
    }
  }

  /**
   * Nạp file Dự báo nhu cầu (Forecast RM Usage) theo tháng và version (F03b - BR-15b)
   */
  async importForecast(
    file: Express.Multer.File,
    importedBy: string,
    query: ImportForecastQueryDto,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file Excel Forecast (RM Usage) để tải lên.');
    }

    const originalName = file.originalname || 'Forecast_RM_Usage.xlsx';
    if (!originalName.match(/\.(xlsx|xls)$/i)) {
      throw new BadRequestException('Chỉ chấp nhận file định dạng Excel (.xlsx, .xls).');
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('File tải lên bị rỗng (0 bytes).');
    }

    const parsed = this.excelParserService.parseForecast(
      file.buffer,
      query.periodMonth,
      query.versionDate,
    );

    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const dryRun = Boolean(query.dryRun);

    try {
      const rows = await this.procedureService.executeProcedure('dbo.usp_Import_Forecast', {
        PeriodMonth: parsed.periodMonth,
        VersionDate: new Date(parsed.versionDate),
        ForecastJson: JSON.stringify(parsed.cells),
        OriginalFileName: originalName,
        FileHash: fileHash,
        ImportedBy: importedBy,
        DryRun: dryRun ? 1 : 0,
      });

      if (!rows || rows.length === 0) {
        throw new InternalServerErrorException('Không nhận được phản hồi từ thủ tục dbo.usp_Import_Forecast.');
      }

      const res = rows[0];
      return {
        batchId: Number(res.BatchID),
        periodMonth: parsed.periodMonth,
        versionDate: parsed.versionDate,
        totalRows: Number(res.TotalRows),
        totalForecastKg: Number(res.TotalForecastKg),
        status: res.Status,
        fileHash,
        fileName: originalName,
        isDryRun: dryRun,
      };
    } catch (err: any) {
      this.logger.error(`Error executing dbo.usp_Import_Forecast: ${err.message}`, err.stack);
      throw new BadRequestException(`Lỗi nạp Forecast: ${err.message || 'Lỗi không xác định'}`);
    }
  }

  /**
   * Lấy lịch sử nạp các lô dữ liệu có phân trang
   */
  async getImportHistory(
    query: ImportHistoryQueryDto,
  ): Promise<{ items: any[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const pageSize = query.parsedPageSize;

    const datasets = await this.procedureService.executeMultiSetProcedure('dbo.usp_Import_History', {
      BatchType: query.batchType || null,
      Search: query.search || null,
      PageNumber: page,
      PageSize: pageSize,
    });

    const rows = datasets[0] || [];
    const metaRow = datasets[1] && datasets[1][0] ? datasets[1][0] : null;

    const totalItems = metaRow ? Number(metaRow.TotalRecords) : 0;
    const totalPages = metaRow ? Number(metaRow.TotalPages) : 1;

    return {
      items: rows.map((r: any) => ({
        batchId: r.BatchID,
        batchType: r.BatchType,
        snapshotDate: r.SnapshotDate,
        cutoffDate: r.CutoffDate,
        periodMonth: r.PeriodMonth,
        versionDate: r.VersionDate,
        originalFileName: r.OriginalFileName,
        fileHash: r.FileHash,
        totalRows: Number(r.TotalRows),
        validRows: Number(r.ValidRows),
        errorRows: Number(r.ErrorRows),
        status: r.Status,
        importedAt: r.ImportedAt,
        importedBy: r.ImportedBy,
        issueCount: Number(r.IssueCount || 0),
      })),
      meta: {
        page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Lấy thông tin chi tiết một batch và các issues
   */
  async getBatchById(batchId: number) {
    const datasets = await this.procedureService.executeMultiSetProcedure('dbo.usp_Import_GetBatchById', {
      BatchID: batchId,
    });

    const batchRows = datasets[0] || [];
    if (batchRows.length === 0) {
      throw new NotFoundException(`Không tìm thấy lô nạp với mã ID: ${batchId}`);
    }

    const b = batchRows[0];
    const issues = (datasets[1] || []).map((i: any) => ({
      issueId: i.IssueID,
      batchId: i.BatchID,
      snapshotDate: i.SnapshotDate,
      factoryId: i.FactoryID,
      materialId: i.MaterialID,
      issueType: i.IssueType,
      severity: i.Severity,
      description: i.Description,
      createdAt: i.CreatedAt,
    }));

    return {
      batchId: b.BatchID,
      batchType: b.BatchType,
      snapshotDate: b.SnapshotDate,
      cutoffDate: b.CutoffDate,
      periodMonth: b.PeriodMonth,
      versionDate: b.VersionDate,
      originalFileName: b.OriginalFileName,
      fileHash: b.FileHash,
      totalRows: Number(b.TotalRows),
      validRows: Number(b.ValidRows),
      errorRows: Number(b.ErrorRows),
      status: b.Status,
      importedAt: b.ImportedAt,
      importedBy: b.ImportedBy,
      issues,
    };
  }

  /**
   * Quét thư mục chứa các folder ngày chốt ERP theo quy tắc ddmmyy
   */
  async scanDirectory(targetDir?: string) {
    let resolvedDir = '';
    const possiblePaths = [
      targetDir,
      targetDir ? path.resolve(process.cwd(), targetDir) : null,
      'c:\\Premix_GE\\Mock_Export_Data',
      path.resolve(process.cwd(), 'Mock_Export_Data'),
      path.resolve(process.cwd(), '../Mock_Export_Data'),
    ].filter(Boolean) as string[];

    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        resolvedDir = p;
        break;
      }
    }

    if (!resolvedDir) {
      throw new BadRequestException(
        `Không tìm thấy thư mục nguồn dữ liệu. Đã thử: ${possiblePaths.join(', ')}`,
      );
    }

    const entries = fs.readdirSync(resolvedDir);
    const ddmmyyFolders = entries.filter((e) => {
      const fullSub = path.join(resolvedDir, e);
      return /^\d{6}$/.test(e) && fs.statSync(fullSub).isDirectory();
    });

    // Lấy lịch sử các batch DAILY_SET từ DB để so khớp trạng thái
    const historyRows = await this.procedureService
      .executeProcedure<any>('dbo.usp_Import_GetHistory', {
        BatchType: 'DAILY_SET',
        Status: 'COMPLETED',
        Page: 1,
        PageSize: 1000,
      })
      .catch(() => []);

    const importedMap = new Map<string, any>();
    for (const h of historyRows || []) {
      const snap = h.SnapshotDate ? String(h.SnapshotDate).slice(0, 10) : '';
      const cutoff = h.CutoffDate ? String(h.CutoffDate).slice(0, 10) : '';
      if (snap) importedMap.set(snap, h);
      if (cutoff) importedMap.set(cutoff, h);
    }

    const folders = ddmmyyFolders.map((fName) => {
      const subPath = path.join(resolvedDir, fName);
      const day = parseInt(fName.slice(0, 2), 10);
      const month = parseInt(fName.slice(2, 4), 10);
      const year = 2000 + parseInt(fName.slice(4, 6), 10);
      const cutoffDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      const cD = new Date(Date.UTC(year, month - 1, day));
      const sD = new Date(cD.getTime() - 86400000);
      const snapshotDate = sD.toISOString().slice(0, 10);

      const files = fs.readdirSync(subPath).filter((fn) => fn.match(/\.(xlsx|xls)$/i));
      const onHand = files.find((x) => /on\s*hand/i.test(x)) || null;
      const movement = files.find((x) => /movement/i.test(x)) || null;
      const poPending = files.find((x) => /po\s*pending/i.test(x)) || null;
      const poReceipt = files.find((x) => /po\s*receipt/i.test(x)) || null;
      const transfer = files.find((x) => /transfer/i.test(x)) || null;

      const missingFiles: string[] = [];
      if (!onHand) missingFiles.push('On Hand (SOH)');
      if (!movement) missingFiles.push('Inventory Movement');
      if (!poPending) missingFiles.push('PO Pending');
      if (!poReceipt) missingFiles.push('PO Receipt');
      if (!transfer) missingFiles.push('Transfer Order');

      const isComplete = missingFiles.length === 0;

      // So khớp xem ngày này đã nạp chưa
      const importedRecord = importedMap.get(snapshotDate) || importedMap.get(cutoffDate);

      return {
        folderName: fName,
        folderPath: subPath,
        cutoffDate,
        snapshotDate,
        isComplete,
        files: {
          onHand,
          movement,
          poPending,
          poReceipt,
          transfer,
        },
        missingFiles,
        importStatus: importedRecord ? ('IMPORTED' as const) : ('NOT_IMPORTED' as const),
        importedBatchId: importedRecord ? Number(importedRecord.BatchID) : null,
        importedAt: importedRecord ? importedRecord.ImportedAt : null,
        totalRows: importedRecord ? Number(importedRecord.TotalRows) : 0,
      };
    });

    // Sắp xếp theo ngày Cutoff tăng dần
    folders.sort((a, b) => a.cutoffDate.localeCompare(b.cutoffDate));

    return {
      baseDir: resolvedDir,
      totalFolders: folders.length,
      completeFolders: folders.filter((f) => f.isComplete).length,
      importedFolders: folders.filter((f) => f.importStatus === 'IMPORTED').length,
      pendingFolders: folders.filter((f) => f.importStatus === 'NOT_IMPORTED' && f.isComplete).length,
      folders,
    };
  }

  /**
   * Nạp trực tiếp một folder đã quét từ ổ đĩa máy chủ/local
   */
  async importScannedFolder(
    folderPath: string,
    importedBy: string,
    dryRun: boolean = false,
    explicitSnapshotDate?: string,
  ) {
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      throw new BadRequestException(`Thư mục "${folderPath}" không tồn tại.`);
    }

    const files = fs.readdirSync(folderPath).filter((fn) => fn.match(/\.(xlsx|xls)$/i));
    const onHandName = files.find((x) => /on\s*hand/i.test(x));
    const movementName = files.find((x) => /movement/i.test(x));
    const poPendingName = files.find((x) => /po\s*pending/i.test(x));
    const poReceiptName = files.find((x) => /po\s*receipt/i.test(x));
    const transferName = files.find((x) => /transfer/i.test(x));

    if (!onHandName || !movementName || !poPendingName || !poReceiptName || !transferName) {
      throw new BadRequestException(`Thư mục "${folderPath}" thiếu file ERP bắt buộc.`);
    }

    const createMulterFile = (fileName: string): Express.Multer.File => {
      const fullPath = path.join(folderPath, fileName);
      const buffer = fs.readFileSync(fullPath);
      return {
        fieldname: '',
        originalname: fileName,
        encoding: '7bit',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        buffer,
        stream: null as any,
        destination: '',
        filename: fileName,
        path: fullPath,
      };
    };

    const dailyFiles: DailySetFiles = {
      onHand: [createMulterFile(onHandName)],
      movement: [createMulterFile(movementName)],
      poPending: [createMulterFile(poPendingName)],
      poReceipt: [createMulterFile(poReceiptName)],
      transfer: [createMulterFile(transferName)],
    };

    return await this.importDailySet(dailyFiles, importedBy, dryRun, explicitSnapshotDate);
  }

  /**
   * Nạp hàng loạt nhiều folder đã quét theo thứ tự thời gian
   */
  async batchImportScannedFolders(
    folderPaths: string[],
    importedBy: string,
    dryRun: boolean = false,
  ) {
    if (!folderPaths || folderPaths.length === 0) {
      throw new BadRequestException('Danh sách thư mục cần nạp không được để trống.');
    }

    const results: any[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const fPath of folderPaths) {
      try {
        const res = await this.importScannedFolder(fPath, importedBy, dryRun);
        results.push({
          folderPath: fPath,
          status: 'SUCCESS',
          batchId: res.batchId,
          snapshotDate: res.snapshotDate,
          cutoffDate: res.cutoffDate,
          totalRows: res.totalRows,
          issueCount: res.issueCount,
        });
        successCount++;
      } catch (err: any) {
        failedCount++;
        results.push({
          folderPath: fPath,
          status: 'FAILED',
          error: err.message,
        });
        // Dừng lại nếu lỗi để đảm bảo tính toàn vẹn chuỗi dữ liệu tồn kho lũy kế
        break;
      }
    }

    return {
      total: folderPaths.length,
      successCount,
      failedCount,
      isDryRun: dryRun,
      items: results,
    };
  }
}
