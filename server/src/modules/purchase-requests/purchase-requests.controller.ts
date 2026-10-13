import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CreatePurchaseRequestDto,
  ExportPurchaseRequestDto,
  PurchaseRequestQueryDto,
  PurchaseSuggestionsQueryDto,
  UpdatePurchaseRequestStatusDto,
} from './dto/purchase-requests.dto.js';
import { PurchaseRequestsService } from './purchase-requests.service.js';

@ApiTags('Purchase Requests & Purchase Suggestions (F08)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-requests')
export class PurchaseRequestsController {
  constructor(private readonly purchaseRequestsService: PurchaseRequestsService) {}

  @Get('suggestions')
  @RequirePermissions('purchase-request.view')
  @ApiOperation({
    summary:
      'Lấy danh sách các cặp NM-NL có nhu cầu cần đặt mua theo thuật toán định mức tồn kho (BR-25, BR-25a)',
  })
  async getSuggestions(
    @Query() query: PurchaseSuggestionsQueryDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.purchaseRequestsService.getSuggestions(user?.userId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('purchase-request.create')
  @ApiOperation({
    summary:
      'Tạo mới phiếu đề nghị mua hàng (sinh mã tự động PR-YYYYMMDD-XXXX chống xung đột đồng thời)',
  })
  async create(@Body() dto: CreatePurchaseRequestDto, @Req() req: Request) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.purchaseRequestsService.create(
      user?.userId,
      user?.username,
      dto,
      ip,
    );
  }

  @Get()
  @RequirePermissions('purchase-request.view')
  @ApiOperation({
    summary:
      'Danh sách phiếu đề nghị mua hàng (phân trang 10/20/50/all, lọc nhà máy, trạng thái, ngày cần và tìm kiếm)',
  })
  async findAll(@Query() query: PurchaseRequestQueryDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.purchaseRequestsService.findAll(user?.userId, query);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase-request.status')
  @ApiParam({ name: 'id', description: 'ID của phiếu đề nghị mua hàng', type: Number })
  @ApiOperation({
    summary:
      'Cập nhật trạng thái phiếu PR (SENT -> MATCHED [bắt buộc số PO], EXPIRED, CANCELLED - BR-27, BR-27a)',
  })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseRequestStatusDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.purchaseRequestsService.updateStatus(
      user?.userId,
      user?.username,
      id,
      dto,
      ip,
    );
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('purchase-request.export')
  @ApiOperation({
    summary:
      'Xuất danh sách các phiếu đề nghị mua hàng đã chọn ra file Excel định dạng chuẩn ERP',
  })
  async exportExcel(
    @Body() dto: ExportPurchaseRequestDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';

    const result = await this.purchaseRequestsService.exportExcel(
      user?.userId,
      user?.username,
      dto,
      ip,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result?.filename || 'PR_Export.xlsx'}"`,
    );
    res.send(result?.buffer);
  }
}
