import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import 'multer';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ImportDailySetQueryDto } from './dto/import-daily-set-query.dto.js';
import { ImportForecastQueryDto } from './dto/import-forecast-query.dto.js';
import { ImportHistoryQueryDto } from './dto/import-history-query.dto.js';
import { ImportMasterQueryDto } from './dto/import-master-query.dto.js';
import {
  BatchImportScannedDto,
  ImportScannedFolderDto,
  ScanDirectoryQueryDto,
} from './dto/scan-directory.dto.js';
import { type DailySetFiles, ImportService } from './import.service.js';

@ApiTags('Data Ingestion (Import)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('master-data')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('import.run')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: 'Nạp file Master Data (5 sheets) vào CSDL (F03a)',
    description:
      'Nhận file Excel Master Data gồm 5 sheets (Plants, Items, Plant Items, Vendors, Vendor Items/Substitutions), upsert vào dim_* và áp dụng BR-31a.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File Excel Master Data (.xlsx, .xls) tối đa 20MB',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Nạp Master Data thành công' })
  @ApiResponse({ status: 400, description: 'File không hợp lệ hoặc thiếu sheet/cột bắt buộc' })
  async importMasterData(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: ImportMasterQueryDto,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file Excel Master Data để tải lên.');
    }
    const username = req.user?.username || 'ADMIN';
    const result = await this.importService.importMasterData(file, username, query.dryRun);
    return {
      message: query.dryRun
        ? 'Kiểm tra file Master Data hoàn tất (Chế độ xem trước - Dry-run)'
        : 'Nạp Master Data vào CSDL thành công',
      data: result,
    };
  }

  @Post('preview/daily-set')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('import.run')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'onHand', maxCount: 1 },
        { name: 'movement', maxCount: 1 },
        { name: 'poPending', maxCount: 1 },
        { name: 'poReceipt', maxCount: 1 },
        { name: 'transfer', maxCount: 1 },
      ],
      { limits: { fileSize: 20 * 1024 * 1024 } },
    ),
  )
  @ApiOperation({
    summary: 'Xem trước (Dry-run) Bộ 5 file ERP Ngày chốt (F03b)',
    description:
      'Kiểm tra cấu trúc 5 file ERP (On Hand, Movement, PO Pending, PO Receipt, Transfer Order), kiểm tra mã lạ BR-21 và chạy thử 5 bài kiểm chéo BR-15d mà không ghi vào CSDL.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['onHand', 'movement', 'poPending', 'poReceipt', 'transfer'],
      properties: {
        onHand: { type: 'string', format: 'binary', description: 'File 1: On Hand (Sheet SOH)' },
        movement: { type: 'string', format: 'binary', description: 'File 2: Inventory Movement (Sheet INV46)' },
        poPending: { type: 'string', format: 'binary', description: 'File 3: PO Pending (Sheet FINISH PENDING)' },
        poReceipt: { type: 'string', format: 'binary', description: 'File 4: PO Receipt (Sheet POR)' },
        transfer: { type: 'string', format: 'binary', description: 'File 5: Transfer Order (Sheet1)' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Thẩm định bộ 5 file thành công (Chế độ xem trước)' })
  @ApiResponse({ status: 400, description: 'Thiếu file, sai cấu trúc cột hoặc có lỗi chặn dòng' })
  async previewDailySet(
    @UploadedFiles() files: DailySetFiles,
    @Query() query: ImportDailySetQueryDto,
    @Req() req: any,
  ) {
    const username = req.user?.username || 'ADMIN';
    const result = await this.importService.importDailySet(files, username, true, query.snapshotDate);
    return {
      message: 'Kiểm tra bộ 5 file ERP hoàn tất (Chế độ xem trước - Dry-run)',
      data: result,
    };
  }

  @Post('execute/daily-set')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('import.run')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'onHand', maxCount: 1 },
        { name: 'movement', maxCount: 1 },
        { name: 'poPending', maxCount: 1 },
        { name: 'poReceipt', maxCount: 1 },
        { name: 'transfer', maxCount: 1 },
      ],
      { limits: { fileSize: 20 * 1024 * 1024 } },
    ),
  )
  @ApiOperation({
    summary: 'Thực thi nạp chính thức Bộ 5 file ERP Ngày chốt trong 1 Transaction (F03b - BR-17)',
    description:
      'Nạp đồng thời 5 file ERP trong một giao dịch nguyên tử duy nhất, tự động chạy 5 bài kiểm tra chéo BR-15d và lưu cảnh báo vào sys_Data_Quality_Issue.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['onHand', 'movement', 'poPending', 'poReceipt', 'transfer'],
      properties: {
        onHand: { type: 'string', format: 'binary', description: 'File 1: On Hand (Sheet SOH)' },
        movement: { type: 'string', format: 'binary', description: 'File 2: Inventory Movement (Sheet INV46)' },
        poPending: { type: 'string', format: 'binary', description: 'File 3: PO Pending (Sheet FINISH PENDING)' },
        poReceipt: { type: 'string', format: 'binary', description: 'File 4: PO Receipt (Sheet POR)' },
        transfer: { type: 'string', format: 'binary', description: 'File 5: Transfer Order (Sheet1)' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Nạp bộ 5 file ERP vào CSDL thành công' })
  @ApiResponse({ status: 400, description: 'Lỗi dữ liệu, toàn bộ giao dịch được ROLLBACK nguyên tử' })
  async executeDailySet(
    @UploadedFiles() files: DailySetFiles,
    @Query() query: ImportDailySetQueryDto,
    @Req() req: any,
  ) {
    const username = req.user?.username || 'ADMIN';
    const result = await this.importService.importDailySet(files, username, false, query.snapshotDate);
    return {
      message: 'Nạp bộ 5 file ERP vào CSDL thành công',
      data: result,
    };
  }

  @Post('forecast')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('import.run')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  @ApiOperation({
    summary: 'Nạp file Dự báo nhu cầu Forecast (Sheet RM Usage) theo tháng/version (F03b - BR-15b)',
    description:
      'Đọc ma trận nhu cầu nguyên liệu theo nhà máy từ sheet RM Usage, xoay ma trận và lưu vào fact_Demand_Forecast.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'File Excel Forecast RM Usage (.xlsx, .xls)',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Nạp Forecast thành công' })
  @ApiResponse({ status: 400, description: 'File Forecast không hợp lệ hoặc chứa mã lạ' })
  async importForecast(
    @UploadedFile() file: Express.Multer.File,
    @Query() query: ImportForecastQueryDto,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file Excel Forecast (RM Usage) để tải lên.');
    }
    const username = req.user?.username || 'ADMIN';
    const result = await this.importService.importForecast(file, username, query);
    return {
      message: query.dryRun
        ? 'Kiểm tra file Forecast hoàn tất (Chế độ xem trước - Dry-run)'
        : 'Nạp dữ liệu Forecast vào CSDL thành công',
      data: result,
    };
  }

  @Get('history')
  @RequirePermissions('import.view')
  @ApiOperation({ summary: 'Lịch sử các lần nạp file có phân trang (F03a/F03b)' })
  @ApiResponse({ status: 200, description: 'Lấy lịch sử nạp thành công' })
  async getHistory(@Query() query: ImportHistoryQueryDto) {
    const result = await this.importService.getImportHistory(query);
    return {
      message: 'Lấy lịch sử nạp thành công',
      data: result.items,
      meta: result.meta,
    };
  }

  @Get('batches/:id')
  @RequirePermissions('import.view')
  @ApiOperation({ summary: 'Xem chi tiết lô nạp và cảnh báo chất lượng dữ liệu liên quan' })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết lô nạp thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy lô nạp' })
  async getBatchById(@Param('id', ParseIntPipe) id: number) {
    const result = await this.importService.getBatchById(id);
    return {
      message: 'Lấy thông tin lô nạp thành công',
      data: result,
    };
  }

  @Get('batches/:id/issues')
  @RequirePermissions('import.view')
  @ApiOperation({ summary: 'Danh sách cảnh báo kiểm chéo chất lượng dữ liệu của một lần nạp (BR-15d)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách cảnh báo thành công' })
  async getBatchIssues(@Param('id', ParseIntPipe) id: number) {
    const result = await this.importService.getBatchById(id);
    return {
      message: 'Lấy danh sách cảnh báo chất lượng thành công',
      data: result.issues,
    };
  }

  @Get('scan-directory')
  @RequirePermissions('import.view')
  @ApiOperation({
    summary: 'Quét thư mục máy chủ để tìm các đợt nạp ERP theo quy tắc folder ddmmyy',
    description:
      'Duyệt tìm tất cả các thư mục con có tên theo định dạng 6 chữ số ddmmyy, kiểm tra đủ 5 file ERP và so khớp trạng thái nạp CSDL.',
  })
  @ApiResponse({ status: 200, description: 'Quét thư mục thành công' })
  async scanDirectory(@Query() query: ScanDirectoryQueryDto) {
    const result = await this.importService.scanDirectory(query.dirPath);
    return {
      message: `Quét thư mục hoàn tất. Tìm thấy ${result.totalFolders} thư mục ngày chốt ERP.`,
      data: result,
    };
  }

  @Post('import-scanned-folder')
  @RequirePermissions('import.run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nạp trực tiếp một thư mục ngày chốt đã quét từ ổ đĩa máy chủ (1-click)',
    description:
      'Đọc 5 file ERP từ thư mục cục bộ của máy chủ/máy trạm, thực thi nạp nguyên tử 1 Transaction trong dbo.usp_Import_DailySet.',
  })
  @ApiResponse({ status: 200, description: 'Nạp thư mục thành công' })
  async importScannedFolder(@Body() dto: ImportScannedFolderDto, @Req() req: any) {
    const username = req.user?.username || 'ADMIN';
    const result = await this.importService.importScannedFolder(
      dto.folderPath,
      username,
      dto.dryRun ?? false,
      dto.snapshotDate,
    );
    return {
      message: dto.dryRun
        ? 'Kiểm tra thư mục ngày chốt hoàn tất (Chế độ xem trước - Dry-run)'
        : 'Nạp thư mục ngày chốt vào CSDL thành công',
      data: result,
    };
  }

  @Post('batch-import-scanned')
  @RequirePermissions('import.run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Nạp hàng loạt nhiều thư mục ngày chốt theo thứ tự thời gian tăng dần',
    description:
      'Chạy tuần tự nạp từng thư mục ngày chốt từ ngày cũ nhất đến ngày mới nhất, kiểm soát transaction từng ngày.',
  })
  @ApiResponse({ status: 200, description: 'Nạp hàng loạt hoàn tất' })
  async batchImportScanned(@Body() dto: BatchImportScannedDto, @Req() req: any) {
    const username = req.user?.username || 'ADMIN';
    const result = await this.importService.batchImportScannedFolders(
      dto.folderPaths,
      username,
      dto.dryRun ?? false,
    );
    return {
      message: `Nạp hàng loạt hoàn tất: ${result.successCount} thành công, ${result.failedCount} thất bại.`,
      data: result,
    };
  }
}
