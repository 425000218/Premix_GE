import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ProcedureService } from '../../database/procedure.service.js';
import { PositionsService } from '../positions/positions.service.js';
import {
  CreatePurchaseRequestDto,
  ExportPurchaseRequestDto,
  PurchaseRequestQueryDto,
  PurchaseSuggestionsQueryDto,
  UpdatePurchaseRequestStatusDto,
} from './dto/purchase-requests.dto.js';

@Injectable()
export class PurchaseRequestsService {
  constructor(
    private readonly procedureService: ProcedureService,
    private readonly positionsService: PositionsService,
  ) {}

  private handleSqlError(err: any): never {
    const msg: string = err?.message || '';
    const number: number = err?.number || 0;
    const cleanMsg = msg.replace(/^\[50\d{3}\]\s*/, '');

    if (number === 50409 || msg.includes('[50409]')) {
      throw new ConflictException(cleanMsg || 'Xung đột trạng thái bản ghi.');
    }
    if (number === 50403 || msg.includes('[50403]')) {
      throw new ForbiddenException(cleanMsg || 'Bạn không có quyền thao tác trên nhà máy này.');
    }
    if (number === 50404 || msg.includes('[50404]')) {
      throw new NotFoundException(cleanMsg || 'Không tìm thấy dữ liệu yêu cầu.');
    }
    if (number === 50400 || msg.includes('[50400]')) {
      throw new BadRequestException(cleanMsg || 'Dữ liệu đầu vào không hợp lệ.');
    }
    throw err;
  }

  private toIsoDate(val: unknown): string {
    if (!val) return '';
    if (val instanceof Date) {
      return val.toISOString().slice(0, 10);
    }
    const str = String(val);
    return str.length >= 10 ? str.slice(0, 10) : str;
  }

  private mapPrRow(r: any) {
    return {
      requestId: Number(r.RequestID),
      requestCode: r.RequestCode,
      factoryId: Number(r.FactoryID),
      factoryCode: r.FactoryCode,
      factoryName: r.FactoryName,
      materialId: Number(r.MaterialID),
      materialCode: r.MaterialCode,
      materialName: r.MaterialName,
      category: r.Category ?? null,
      itemGroup: r.ItemGroup ?? null,
      bagKg: r.BagKg != null ? Number(r.BagKg) : null,
      displayDecimals: r.DisplayDecimals != null ? Number(r.DisplayDecimals) : 2,
      supplierId: Number(r.SupplierID),
      supplierCode: r.SupplierCode,
      supplierName: r.SupplierName,
      requestedQtyKg: Number(r.RequestedQtyKg),
      requestedQtyTons: Number(r.RequestedQtyTons),
      needByDate: this.toIsoDate(r.NeedByDate),
      status: r.Status as 'SENT' | 'MATCHED' | 'EXPIRED' | 'CANCELLED',
      poNumber: r.PONumber ?? null,
      note: r.Note ?? null,
      createdAt: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : null,
      createdBy: r.CreatedBy,
      updatedAt: r.UpdatedAt ? new Date(r.UpdatedAt).toISOString() : null,
      updatedBy: r.UpdatedBy,
    };
  }

  /**
   * Thuật toán Gợi ý Mua hàng (Purchase Suggestions - BR-25, BR-25a)
   * Định mức thô theo DOI (7 ngày & 15 ngày), khấu trừ PO đang về và PR đang SENT
   */
  async getSuggestions(userId: number, query: PurchaseSuggestionsQueryDto) {
    try {
      // 1. Tải toàn bộ vị thế tồn kho đã tính toán từ Pure Domain Engine (DEC-04)
      const snapshot = await this.positionsService.loadSnapshotData(
        query.snapshotDate,
        userId,
        query.factoryId,
      );

      const { positions, systemConfig, snapshotDate, todayVn } = snapshot;

      // 2. Lấy dữ liệu PR đang ở trạng thái SENT và thông tin NCC mặc định từ Stored Procedures
      const sentPrRows = await this.procedureService.executeProcedure(
        'dbo.usp_PurchaseRequest_GetSentPrTotals',
        { FactoryID: query.factoryId ?? null },
      );

      const supplierRows = await this.procedureService.executeProcedure(
        'dbo.usp_PurchaseRequest_GetPairSuppliers',
        { FactoryID: query.factoryId ?? null },
      );

      const sentPrMap = new Map<string, number>();
      for (const r of sentPrRows) {
        sentPrMap.set(`${r.FactoryID}-${r.MaterialID}`, Number(r.SentPrKg || 0));
      }

      const supplierMap = new Map<string, any>();
      for (const r of supplierRows) {
        supplierMap.set(`${r.FactoryID}-${r.MaterialID}`, {
          supplierId: Number(r.SupplierID),
          supplierCode: r.SupplierCode,
          supplierName: r.SupplierName,
          leadTimeDays: Number(r.LeadTimeDays || 7),
        });
      }

      const criticalDays = systemConfig.criticalDays; // Mặc định 7
      const warningDays = systemConfig.warningDays; // Mặc định 15

      const suggestions: any[] = [];

      // 3. Quét từng cặp NM-NL và áp dụng công thức BR-25 & BR-25a
      for (const pos of positions) {
        if (query.factoryId && pos.factoryId !== query.factoryId) continue;
        if (query.materialId && pos.materialId !== query.materialId) continue;

        // Chỉ xét cặp có tiêu hao ngày d > 0 và có DOI hợp lệ
        if (!pos.dailyKg || pos.dailyKg <= 0 || pos.doi === null) {
          continue;
        }

        const d = pos.dailyKg;
        const doi = pos.doi; // Dùng DOI nguyên bản chưa làm tròn (BR-25)

        // Định mức gợi ý thô theo DOI (BR-25)
        let rawQtyKg = 0;
        let suggestionLevel: string | null = null;

        if (doi < criticalDays) {
          rawQtyKg = 10 * d;
          suggestionLevel = 'CRITICAL';
        } else if (doi <= warningDays) {
          rawQtyKg = 8 * d;
          suggestionLevel = 'WARNING';
        }

        if (rawQtyKg <= 0) continue;

        // Khấu trừ PO đang về và PR đang SENT (BR-25a)
        const pairKey = `${pos.factoryId}-${pos.materialId}`;
        const openPoKg = Number(pos.poPendingKg || 0);
        const sentPrKg = sentPrMap.get(pairKey) || 0;

        const netQtyKg = Math.max(0, rawQtyKg - openPoKg - sentPrKg);

        // Quy tắc hiển thị: Chỉ những cặp có lượng gợi ý ròng > 0 mới xuất hiện
        if (netQtyKg <= 0) continue;

        // Làm tròn lên theo quy cách bao nếu có (BR-25a, BR-33)
        let finalQtyKg: number;
        if (pos.bagKg && pos.bagKg > 0) {
          finalQtyKg = Math.ceil(netQtyKg / pos.bagKg) * pos.bagKg;
        } else {
          finalQtyKg = Math.round(netQtyKg);
        }

        const finalQtyTons = +(finalQtyKg / 1000).toFixed(3);

        const supplierInfo = supplierMap.get(pairKey) || {
          supplierId: 14,
          supplierCode: 'VEND001',
          supplierName: 'Công ty Cung ứng Premix',
          leadTimeDays: 7,
        };

        const leadTimeDays = supplierInfo.leadTimeDays || 7;

        // Ngày cần hàng về: ưu tiên ngày hết hàng dự kiến, tối thiểu là hôm nay
        let needByDate = pos.stockoutDate || snapshotDate || todayVn;
        if (needByDate < todayVn) {
          needByDate = todayVn;
        }

        // Ngày đặt hàng muộn nhất = needByDate - leadTimeDays
        const needByTime = new Date(needByDate + 'T00:00:00Z').getTime();
        const orderTime = needByTime - leadTimeDays * 86400000;
        const suggestedOrderDate = new Date(orderTime).toISOString().slice(0, 10);

        suggestions.push({
          factoryId: pos.factoryId,
          factoryCode: pos.factoryCode,
          factoryName: pos.factoryName,
          materialId: pos.materialId,
          materialCode: pos.materialCode,
          materialName: pos.materialName,
          category: pos.category,
          itemGroup: pos.itemGroup,
          bagKg: pos.bagKg,
          displayDecimals: pos.displayDecimals,
          supplierId: supplierInfo.supplierId,
          supplierCode: supplierInfo.supplierCode,
          supplierName: supplierInfo.supplierName,
          leadTimeDays,
          doi: pos.doiDisplay,
          warningLevel: pos.warningLevel,
          suggestionLevel,
          dailyUsageKg: pos.dailyKg,
          dailyUsageTons: +(pos.dailyKg / 1000).toFixed(3),
          rawQtyKg: Math.round(rawQtyKg),
          rawQtyTons: +(rawQtyKg / 1000).toFixed(3),
          openPoKg,
          openPoTons: +(openPoKg / 1000).toFixed(3),
          sentPrKg,
          sentPrTons: +(sentPrKg / 1000).toFixed(3),
          netQtyKg: Math.round(netQtyKg),
          netQtyTons: +(netQtyKg / 1000).toFixed(3),
          suggestedQtyKg: finalQtyKg,
          suggestedQtyTons: finalQtyTons,
          stockoutDate: pos.stockoutDate,
          needByDate,
          suggestedOrderDate,
        });
      }

      // Sắp xếp ưu tiên: DOI tăng dần (nguy cấp nhất lên đầu)
      suggestions.sort((a, b) => (a.doi ?? 9999) - (b.doi ?? 9999));

      return {
        snapshotDate,
        todayVn,
        totalSuggestions: suggestions.length,
        items: suggestions,
      };
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  /**
   * Tạo mới phiếu đề nghị mua hàng (PR) với mã PR-YYYYMMDD-XXXX (BR-27)
   */
  async create(
    userId: number,
    username: string,
    dto: CreatePurchaseRequestDto,
    ipAddress?: string,
  ) {
    try {
      let qtyKg: number;
      if (dto.requestedQtyKg != null && dto.requestedQtyKg > 0) {
        qtyKg = Math.round(dto.requestedQtyKg);
      } else if (dto.requestedQtyTons != null && dto.requestedQtyTons > 0) {
        qtyKg = Math.round(dto.requestedQtyTons * 1000);
      } else {
        throw new BadRequestException('Khối lượng đặt mua phải lớn hơn 0 (kg hoặc tấn).');
      }

      const rows = await this.procedureService.executeProcedure(
        'dbo.usp_PurchaseRequest_Create',
        {
          UserID: userId,
          Username: username,
          FactoryID: dto.factoryId,
          MaterialID: dto.materialId,
          SupplierID: dto.supplierId,
          RequestedQtyKg: qtyKg,
          NeedByDate: dto.needByDate,
          Note: dto.note ?? null,
          IPAddress: ipAddress ?? null,
        },
      );

      const created = (rows && rows[0]) || {};
      return this.mapPrRow(created);
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  /**
   * Danh sách phiếu đề nghị mua hàng phân trang, lọc và tìm kiếm
   */
  async findAll(userId: number, query: PurchaseRequestQueryDto) {
    try {
      const rows = await this.procedureService.executeProcedure(
        'dbo.usp_PurchaseRequest_List',
        {
          UserID: userId,
          Search: query.search ?? null,
          FactoryID: query.factoryId ?? null,
          MaterialID: query.materialId ?? null,
          SupplierID: query.supplierId ?? null,
          Status: query.status ?? null,
          FromDate: query.fromDate ?? null,
          ToDate: query.toDate ?? null,
          Page: query.page ?? 1,
          PageSize: query.pageSize ?? 20,
          SortBy: query.sortBy ?? 'CreatedAt',
          SortOrder: query.sortOrder ?? 'DESC',
        },
      );

      const total = rows.length > 0 ? Number(rows[0].TotalCount || 0) : 0;
      const pageSize = query.pageSize ?? 20;
      const page = query.page ?? 1;
      const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 1;

      const items = rows.map((r: any) => this.mapPrRow(r));

      return {
        items,
        meta: {
          total,
          page,
          pageSize,
          totalPages,
        },
      };
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  /**
   * Cập nhật trạng thái phiếu PR (BR-27, BR-27a)
   * SENT -> MATCHED (bắt buộc số PO), EXPIRED, CANCELLED
   */
  async updateStatus(
    userId: number,
    username: string,
    requestId: number,
    dto: UpdatePurchaseRequestStatusDto,
    ipAddress?: string,
  ) {
    try {
      const rows = await this.procedureService.executeProcedure(
        'dbo.usp_PurchaseRequest_ChangeStatus',
        {
          UserID: userId,
          Username: username,
          RequestID: requestId,
          NewStatus: dto.status,
          PONumber: dto.poNumber ?? null,
          CancelReason: dto.cancelReason ?? null,
          IPAddress: ipAddress ?? null,
        },
      );

      const updated = (rows && rows[0]) || {};
      return this.mapPrRow(updated);
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  /**
   * Xuất danh sách các phiếu PR ra file Excel định dạng chuẩn ERP
   */
  async exportExcel(
    userId: number,
    username: string,
    dto: ExportPurchaseRequestDto,
    ipAddress?: string,
  ) {
    try {
      const requestIdsJson =
        dto.requestIds && dto.requestIds.length > 0
          ? JSON.stringify(dto.requestIds)
          : null;

      const rows = await this.procedureService.executeProcedure(
        'dbo.usp_PurchaseRequest_GetExportData',
        {
          UserID: userId,
          RequestIdsJson: requestIdsJson,
          FactoryID: dto.factoryId ?? null,
          Status: dto.status ?? null,
        },
      );

      // Tạo bảng dữ liệu Excel chuẩn
      const excelRows = rows.map((r: any, idx: number) => ({
        STT: idx + 1,
        'Mã Đề Nghị': r.RequestCode,
        'Mã Nhà Máy': r.FactoryCode,
        'Tên Nhà Máy': r.FactoryName,
        'Mã Nguyên Liệu': r.MaterialCode,
        'Tên Nguyên Liệu': r.MaterialName,
        'Nhóm Mặt Hàng': r.ItemGroup || '',
        'Mã NCC': r.SupplierCode,
        'Tên Nhà Cung Cấp': r.SupplierName,
        'Số Lượng (Tấn)': Number(r.RequestedQtyTons),
        'Số Lượng (Kg)': Number(r.RequestedQtyKg),
        'Ngày Cần Hàng': r.NeedByDate,
        'Trạng Thái': r.Status,
        'Số PO': r.PONumber || '',
        'Ghi Chú': r.Note || '',
        'Ngày Tạo': r.CreatedAt,
        'Người Tạo': r.CreatedBy,
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelRows);

      // Tùy chỉnh độ rộng các cột
      worksheet['!cols'] = [
        { wch: 6 }, // STT
        { wch: 20 }, // Mã Đề Nghị
        { wch: 12 }, // Mã Nhà Máy
        { wch: 24 }, // Tên Nhà Máy
        { wch: 16 }, // Mã Nguyên Liệu
        { wch: 30 }, // Tên Nguyên Liệu
        { wch: 16 }, // Nhóm Mặt Hàng
        { wch: 14 }, // Mã NCC
        { wch: 32 }, // Tên Nhà Cung Cấp
        { wch: 15 }, // Số Lượng (Tấn)
        { wch: 15 }, // Số Lượng (Kg)
        { wch: 14 }, // Ngày Cần Hàng
        { wch: 14 }, // Trạng Thái
        { wch: 18 }, // Số PO
        { wch: 30 }, // Ghi Chú
        { wch: 20 }, // Ngày Tạo
        { wch: 16 }, // Người Tạo
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase_Requests');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      // Ghi nhận nhật ký kiểm toán (PURCHASE_REQUEST_EXPORT)
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const filename = `PR_Export_${todayStr}.xlsx`;

      await this.procedureService.executeProcedure('dbo.usp_Audit_Write', {
        UserID: userId,
        Username: username,
        ActionCode: 'PURCHASE_REQUEST_EXPORT',
        TargetEntity: 'fact_Purchase_Request',
        TargetID: filename,
        IPAddress: ipAddress ?? null,
        OldValues: null,
        NewValues: JSON.stringify({
          exportedCount: rows.length,
          factoryId: dto.factoryId ?? null,
          status: dto.status ?? null,
        }),
        Status: 'SUCCESS',
        ErrorMessage: null,
      });

      return {
        buffer,
        filename,
        count: rows.length,
      };
    } catch (err) {
      this.handleSqlError(err);
    }
  }
}
