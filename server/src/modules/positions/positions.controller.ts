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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PairDetailQueryDto } from './dto/pair-detail-query.dto.js';
import { PositionQueryDto } from './dto/position-query.dto.js';
import {
  CreateDemandOverrideDto,
  FlagsQueryDto,
  OverrideHistoryQueryDto,
  RemoveDemandOverrideDto,
} from './dto/demand-override.dto.js';
import { ProjectionQueryDto } from './dto/projection.dto.js';
import { PositionsService } from './positions.service.js';

@ApiTags('Stock Positions, Demand Override & Warnings (F04)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get('snapshot-dates')
  @RequirePermissions('position.view')
  @ApiOperation({
    summary: 'Lấy danh sách các ngày chốt (SnapshotDate) đã có dữ liệu tồn kho',
  })
  async getSnapshotDates() {
    return this.positionsService.getSnapshotDates();
  }

  @Get('flags')
  @RequirePermissions('position.view')
  @ApiOperation({
    summary:
      'Lấy danh sách và thống kê các cặp có cờ bất thường trên toàn hệ thống (BR-37..BR-40)',
  })
  async getFlagsSummary(
    @Query() query: FlagsQueryDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.positionsService.getFlagsSummary(query, user?.userId);
  }

  @Get()
  @RequirePermissions('position.view')
  @ApiOperation({
    summary:
      'Lấy bảng vị thế tồn kho tại ngày chốt C (Tính toán qua Domain Engine, lọc đa năng, sắp xếp & phân trang)',
  })
  async getPositionsList(
    @Query() query: PositionQueryDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.positionsService.getPositionsList(query, user?.userId);
  }

  @Get(':factoryId/:materialId')
  @RequirePermissions('position.view')
  @ApiOperation({
    summary:
      'Lấy chi tiết chuyên sâu của 1 cặp (FactoryID, MaterialID) tại ngày chốt C (PO, TO, POR, Block, Movement, Ngưỡng)',
  })
  @ApiParam({ name: 'factoryId', type: Number, description: 'ID Nhà máy' })
  @ApiParam({ name: 'materialId', type: Number, description: 'ID Nguyên liệu' })
  async getPairDetail(
    @Param('factoryId', ParseIntPipe) factoryId: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @Query() query: PairDetailQueryDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.positionsService.getPairDetail(
      factoryId,
      materialId,
      query.snapshotDate,
      user?.userId,
    );
  }

  @Get(':factoryId/:materialId/projection')
  @RequirePermissions('position.view')
  @ApiOperation({
    summary:
      'Lấy mô hình dự phóng tồn kho 28 ngày (2 tầng) & gợi ý lịch giao (BR-34, BR-36)',
  })
  @ApiParam({ name: 'factoryId', type: Number, description: 'ID Nhà máy' })
  @ApiParam({ name: 'materialId', type: Number, description: 'ID Nguyên liệu' })
  async getProjection(
    @Param('factoryId', ParseIntPipe) factoryId: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @Query() query: ProjectionQueryDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.positionsService.get28DayProjection(
      factoryId,
      materialId,
      query.snapshotDate,
      user?.userId,
    );
  }

  @Post(':factoryId/:materialId/override')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('demand-override.edit')
  @ApiOperation({
    summary:
      'Thiết lập nhu cầu tháng sửa tay (Demand Override - Append-only BR-14a, BR-05a)',
  })
  @ApiParam({ name: 'factoryId', type: Number, description: 'ID Nhà máy' })
  @ApiParam({ name: 'materialId', type: Number, description: 'ID Nguyên liệu' })
  async createDemandOverride(
    @Param('factoryId', ParseIntPipe) factoryId: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @Body() dto: CreateDemandOverrideDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.positionsService.createDemandOverride(
      user?.userId,
      user?.username,
      factoryId,
      materialId,
      dto,
      ip,
    );
  }

  @Delete(':factoryId/:materialId/override')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('demand-override.edit')
  @ApiOperation({
    summary:
      'Hủy bỏ nhu cầu tháng sửa tay để quay về dùng Forecast (Append-only BR-14a, BR-05b)',
  })
  @ApiParam({ name: 'factoryId', type: Number, description: 'ID Nhà máy' })
  @ApiParam({ name: 'materialId', type: Number, description: 'ID Nguyên liệu' })
  async removeDemandOverride(
    @Param('factoryId', ParseIntPipe) factoryId: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @Body() dto: RemoveDemandOverrideDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.positionsService.removeDemandOverride(
      user?.userId,
      user?.username,
      factoryId,
      materialId,
      dto,
      ip,
    );
  }

  @Get(':factoryId/:materialId/override-history')
  @RequirePermissions('position.view')
  @ApiOperation({
    summary:
      'Lấy toàn bộ lịch sử các lần sửa tay nhu cầu tháng của 1 cặp (Append-only BR-14a)',
  })
  @ApiParam({ name: 'factoryId', type: Number, description: 'ID Nhà máy' })
  @ApiParam({ name: 'materialId', type: Number, description: 'ID Nguyên liệu' })
  async getOverrideHistory(
    @Param('factoryId', ParseIntPipe) factoryId: number,
    @Param('materialId', ParseIntPipe) materialId: number,
    @Query() query: OverrideHistoryQueryDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    return this.positionsService.getOverrideHistory(
      factoryId,
      materialId,
      query.periodMonth,
      user?.userId,
    );
  }
}
