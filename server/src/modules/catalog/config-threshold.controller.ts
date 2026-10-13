import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ConfigThresholdService } from './config-threshold.service.js';
import {
  ThresholdQueryDto,
  UpdateSystemConfigDto,
  UpsertThresholdDto,
} from './dto/config-threshold.dto.js';

@ApiTags('System Configuration & Pair Thresholds (F02b)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ConfigThresholdController {
  constructor(private readonly configThresholdService: ConfigThresholdService) {}

  @Get('system-config')
  @RequirePermissions('catalog.view')
  @ApiOperation({
    summary: 'Lấy toàn bộ 16 tham số cấu hình chung hệ thống từ cfg_System (F02b)',
  })
  async getSystemConfig() {
    return this.configThresholdService.getSystemConfig();
  }

  @Put('system-config')
  @RequirePermissions('system-config.edit')
  @ApiOperation({
    summary:
      'Cập nhật 16 tham số cấu hình chung hệ thống (kiểm tra thứ tự ngưỡng BR-12 và xung đột ngưỡng ghi đè BR-12b)',
  })
  async updateSystemConfig(@Body() dto: UpdateSystemConfigDto, @Req() req: Request) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.configThresholdService.updateSystemConfig(user?.userId, user?.username, dto, ip);
  }

  @Get('thresholds')
  @RequirePermissions('catalog.view')
  @ApiOperation({
    summary:
      'Danh sách ngưỡng ghi đè theo cặp Nhà máy - Nguyên liệu (phân trang 10/20/50/all, kèm ngưỡng hiệu lực từ cfg_System)',
  })
  async listThresholds(@Query() query: ThresholdQueryDto) {
    return this.configThresholdService.listThresholds(query);
  }

  @Post('thresholds')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('threshold.edit')
  @ApiOperation({
    summary:
      'Thiết lập hoặc cập nhật (Upsert) ngưỡng ghi đè theo cặp (kiểm tra BR-12a: Critical chung < Warning hiệu lực < Overstock hiệu lực)',
  })
  async upsertThreshold(@Body() dto: UpsertThresholdDto, @Req() req: Request) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.configThresholdService.upsertThreshold(user?.userId, user?.username, dto, ip);
  }

  @Delete('thresholds/:id')
  @RequirePermissions('threshold.edit')
  @ApiParam({ name: 'id', description: 'ID của bản ghi ngưỡng ghi đè (ThresholdID)', type: Number })
  @ApiOperation({
    summary: 'Xóa ngưỡng ghi đè của cặp để quay về sử dụng ngưỡng mặc định hệ thống',
  })
  async deleteThreshold(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.configThresholdService.deleteThreshold(user?.userId, user?.username, id, ip);
  }
}
