import {
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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { BlocksService } from './blocks.service.js';
import { BlockQueryDto, CreateBlockDto, ReleaseBlockDto } from './dto/blocks.dto.js';

@ApiTags('Blocked Inventory Management (F06)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('blocks')
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  @Get()
  @RequirePermissions('block.view')
  @ApiOperation({
    summary:
      'Danh sách lệnh khóa tồn kho (phân trang 10/20/50/all, lọc theo nhà máy, nguyên liệu, trạng thái hiệu lực suy diễn BR-28 và tìm kiếm)',
  })
  async findAll(@Query() query: BlockQueryDto, @Req() req: Request) {
    const user = (req as any).user;
    return this.blocksService.findAll(user?.userId, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('block.create')
  @ApiOperation({
    summary:
      'Tạo mới lệnh khóa tồn kho thủ công (kiểm tra hạn mức không vượt SOH khả dụng BR-28a với khóa bi quan UPDLOCK, HOLDLOCK)',
  })
  async create(@Body() dto: CreateBlockDto, @Req() req: Request) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.blocksService.create(user?.userId, user?.username, dto, ip);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('block.release')
  @ApiParam({ name: 'id', description: 'ID của lệnh khóa hàng cần mở khóa', type: Number })
  @ApiOperation({
    summary: 'Mở khóa hàng (cập nhật EndDate >= StartDate, giải phóng tồn khả dụng và ghi Audit Log)',
  })
  async release(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReleaseBlockDto,
    @Req() req: Request,
  ) {
    const user = (req as any).user;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      '127.0.0.1';
    return this.blocksService.release(user?.userId, user?.username, id, dto, ip);
  }
}
