import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseIntPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CatalogService } from './catalog.service.js';
import { FactoryQueryDto } from './dto/factory-query.dto.js';
import { MaterialQueryDto } from './dto/material-query.dto.js';
import { PlantItemQueryDto } from './dto/plant-item-query.dto.js';
import { SupplierQueryDto } from './dto/supplier-query.dto.js';
import { UpdateMaterialDto } from './dto/update-material.dto.js';
import { UpdatePlantItemDto } from './dto/update-plant-item.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';

@ApiTags('Catalog (Master Data)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('dropdowns')
  @ApiOperation({ summary: 'Dữ liệu dropdown dùng chung (Nhà máy, Nguyên liệu, NCC) - Mở cho mọi user đã login' })
  @ApiResponse({ status: 200, description: 'Lấy dữ liệu dropdown thành công' })
  async getDropdowns() {
    const result = await this.catalogService.getDropdowns();
    return {
      message: 'Lấy dữ liệu dropdown thành công',
      data: result,
    };
  }

  @Get('factories')
  @RequirePermissions('catalog.view')
  @ApiOperation({ summary: 'Danh sách Nhà máy phân trang, tìm kiếm, lọc (F02a)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách nhà máy thành công' })
  async getFactories(@Query() query: FactoryQueryDto) {
    const result = await this.catalogService.getFactories(query);
    return {
      message: 'Lấy danh sách nhà máy thành công',
      data: result.items,
      meta: result.meta,
    };
  }

  @Get('materials')
  @RequirePermissions('catalog.view')
  @ApiOperation({ summary: 'Danh sách Nguyên liệu phân trang, lọc Category, Nhóm, tìm kiếm' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách nguyên liệu thành công' })
  async getMaterials(@Query() query: MaterialQueryDto) {
    const result = await this.catalogService.getMaterials(query);
    return {
      message: 'Lấy danh sách nguyên liệu thành công',
      data: result.items,
      meta: result.meta,
    };
  }

  @Put('materials/:id')
  @RequirePermissions('material.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cập nhật thuộc tính Nguyên liệu (PIC, DisplayDecimals 0-4)' })
  @ApiResponse({ status: 200, description: 'Cập nhật nguyên liệu thành công' })
  @ApiResponse({ status: 400, description: 'Số lẻ không hợp lệ' })
  async updateMaterial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMaterialDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const result = await this.catalogService.updateMaterial(
      id,
      dto,
      req.user.username,
      ip || '127.0.0.1',
    );
    return {
      message: 'Cập nhật nguyên liệu thành công',
      data: result,
    };
  }

  @Get('suppliers')
  @RequirePermissions('catalog.view')
  @ApiOperation({ summary: 'Danh sách Nhà cung cấp phân trang, lọc nhóm vendor, tìm kiếm' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách nhà cung cấp thành công' })
  async getSuppliers(@Query() query: SupplierQueryDto) {
    const result = await this.catalogService.getSuppliers(query);
    return {
      message: 'Lấy danh sách nhà cung cấp thành công',
      data: result.items,
      meta: result.meta,
    };
  }

  @Put('suppliers/:id')
  @RequirePermissions('supplier.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cập nhật thời gian giao hàng NCC (LeadTimeDays 0-365)' })
  @ApiResponse({ status: 200, description: 'Cập nhật nhà cung cấp thành công' })
  @ApiResponse({ status: 400, description: 'LeadTimeDays không hợp lệ' })
  async updateSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const result = await this.catalogService.updateSupplier(
      id,
      dto,
      req.user.username,
      ip || '127.0.0.1',
    );
    return {
      message: 'Cập nhật nhà cung cấp thành công',
      data: result,
    };
  }

  @Get('plant-items')
  @RequirePermissions('catalog.view')
  @ApiOperation({ summary: 'Danh sách Cặp theo dõi Nhà máy - Nguyên liệu (72 cặp)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách cặp theo dõi thành công' })
  async getPlantItems(@Query() query: PlantItemQueryDto) {
    const result = await this.catalogService.getPlantItems(query);
    return {
      message: 'Lấy danh sách cặp theo dõi thành công',
      data: result.items,
      meta: result.meta,
    };
  }

  @Put('plant-items/:id')
  @RequirePermissions('factory-material.edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bật / Tắt trạng thái theo dõi vị thế cặp (IsTracked)' })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái theo dõi thành công' })
  async updatePlantItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlantItemDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const result = await this.catalogService.updatePlantItem(
      id,
      dto,
      req.user.username,
      ip || '127.0.0.1',
    );
    return {
      message: 'Cập nhật trạng thái theo dõi cặp thành công',
      data: result,
    };
  }
}
