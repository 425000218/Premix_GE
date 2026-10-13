import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DeliveryPlansService } from './delivery-plans.service.js';
import {
  GetPoOptionsQueryDto,
  GetWeekPlanQueryDto,
  SaveWeekPlanDto,
  SuggestPlanDto,
} from './dto/delivery-plans.dto.js';

@ApiTags('Delivery Plans & POR Reconciliation (F07)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('delivery-plans')
export class DeliveryPlansController {
  constructor(private readonly deliveryPlansService: DeliveryPlansService) {}

  @Get('week')
  @RequirePermissions('delivery-plan.view')
  @ApiOperation({
    summary:
      'Lấy kế hoạch giao hàng tuần và kết quả đối chiếu tự động với phiếu nhận thực tế POR (BR-26b)',
  })
  async getWeekPlan(@Query() query: GetWeekPlanQueryDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.deliveryPlansService.getWeekPlan(user?.userId, query);
  }

  @Post('week')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('delivery-plan.edit')
  @ApiOperation({
    summary:
      'Lưu toàn bộ lưới kế hoạch giao hàng tuần của 1 nhà máy trong 1 Transaction nguyên tử (nhập TẤN, lưu KG - BR-26, BR-33)',
  })
  async saveWeekPlan(@Body() dto: SaveWeekPlanDto, @Req() req: Request) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.deliveryPlansService.saveWeekPlan(
      user?.userId,
      user?.username,
      dto,
      ip,
    );
  }

  @Get('po-options')
  @RequirePermissions('delivery-plan.view')
  @ApiOperation({
    summary:
      'Lấy danh sách PO Pending còn mở của cặp (Nhà máy, Nguyên liệu) sắp xếp FIFO ngày giao để chọn trên dòng kế hoạch',
  })
  async getPoOptions(@Query() query: GetPoOptionsQueryDto) {
    return this.deliveryPlansService.getPoOptions(query);
  }

  @Post('suggest')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('delivery-plan.view')
  @ApiOperation({
    summary:
      'Đề xuất các chuyến giao hàng nháp lên lưới tuần theo định mức an toàn (BR-36b) mà không ghi đè dữ liệu cũ',
  })
  async suggestWeekPlans(@Body() dto: SuggestPlanDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.deliveryPlansService.suggestWeekPlans(user?.userId, dto);
  }
}
