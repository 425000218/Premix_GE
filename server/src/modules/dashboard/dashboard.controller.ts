import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';

@ApiTags('Executive Dashboard (F05)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequirePermissions('dashboard.view')
  @ApiOperation({
    summary:
      'Lấy dữ liệu tổng hợp Dashboard (5 Thẻ mức cảnh báo, Thống kê tồn bị khóa, Cờ dữ liệu, Lần nạp mới nhất & Cảnh báo dữ liệu cũ)',
  })
  async getSummary(@Query() query: DashboardQueryDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.dashboardService.getSummary(query, user?.userId);
  }

  @Get('matrix')
  @RequirePermissions('dashboard.view')
  @ApiOperation({
    summary:
      'Lấy cấu trúc dữ liệu Ma trận nhiệt (Heatmap Matrix: Dòng = Nguyên liệu sắp theo độ khẩn cấp, Cột = Nhà máy)',
  })
  async getMatrix(@Query() query: DashboardQueryDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.dashboardService.getMatrix(query, user?.userId);
  }
}
