import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { SetPermissionsDto } from './dto/set-permissions.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { RolesService } from './roles.service.js';

@ApiTags('Roles & Permissions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('role.view')
  @ApiOperation({ summary: 'Xem danh sách toàn bộ vai trò và thống kê (F01c)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách vai trò thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền role.view' })
  async getRoles() {
    const roles = await this.rolesService.getRoles();
    return {
      message: 'Lấy danh sách vai trò thành công',
      data: roles,
      total: roles.length,
    };
  }

  @Get('permissions')
  @RequirePermissions('role.view')
  @ApiOperation({ summary: 'Lấy danh mục 27 mã quyền chuẩn hệ thống kèm phân nhóm' })
  @ApiResponse({ status: 200, description: 'Lấy danh mục mã quyền thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền role.view' })
  async getPermissionsCatalog() {
    const catalog = await this.rolesService.getPermissionsCatalog();
    return {
      message: 'Lấy danh mục mã quyền thành công',
      data: catalog,
      total: catalog.length,
    };
  }

  @Get(':code')
  @RequirePermissions('role.view')
  @ApiOperation({ summary: 'Xem chi tiết vai trò và danh sách quyền được cấp' })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết vai trò thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy vai trò' })
  async getRoleByCode(@Param('code') code: string) {
    const result = await this.rolesService.getRoleByCode(code);
    return {
      message: 'Lấy thông tin vai trò thành công',
      data: result,
    };
  }

  @Post()
  @RequirePermissions('role.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo vai trò tùy biến mới' })
  @ApiResponse({ status: 201, description: 'Tạo vai trò thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc mã quyền lạ' })
  @ApiResponse({ status: 409, description: 'Mã vai trò đã tồn tại' })
  async createRole(
    @Body() dto: CreateRoleDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const currentUsername = req.user?.username || 'admin';
    const currentUserId = req.user?.userId || null;
    const result = await this.rolesService.createRole(
      dto,
      currentUsername,
      currentUserId,
      ip,
    );
    return {
      message: 'Tạo vai trò mới thành công',
      data: result,
    };
  }

  @Put(':code')
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Cập nhật thông tin vai trò' })
  @ApiResponse({ status: 200, description: 'Cập nhật vai trò thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy vai trò' })
  async updateRole(
    @Param('code') code: string,
    @Body() dto: UpdateRoleDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const currentUsername = req.user?.username || 'admin';
    const currentUserId = req.user?.userId || null;
    const result = await this.rolesService.updateRole(
      code,
      dto,
      currentUsername,
      currentUserId,
      ip,
    );
    return {
      message: 'Cập nhật vai trò thành công',
      data: result,
    };
  }

  @Delete(':code')
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Xóa vai trò tùy biến' })
  @ApiResponse({ status: 200, description: 'Xóa vai trò thành công' })
  @ApiResponse({ status: 403, description: 'Chặn xóa vai trò hệ thống hoặc vai trò đang có người dùng' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy vai trò' })
  async deleteRole(
    @Param('code') code: string,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const currentUsername = req.user?.username || 'admin';
    const currentUserId = req.user?.userId || null;
    const result = await this.rolesService.deleteRole(
      code,
      currentUsername,
      currentUserId,
      ip,
    );
    return result;
  }

  @Put(':code/permissions')
  @RequirePermissions('role.manage')
  @ApiOperation({ summary: 'Cập nhật ma trận quyền cho vai trò (F01c)' })
  @ApiResponse({ status: 200, description: 'Cập nhật ma trận quyền thành công' })
  @ApiResponse({ status: 400, description: 'Chứa mã quyền không hợp lệ' })
  @ApiResponse({ status: 403, description: 'Không được phép sửa quyền của role ADMIN' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy vai trò' })
  async setRolePermissions(
    @Param('code') code: string,
    @Body() dto: SetPermissionsDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const currentUsername = req.user?.username || 'admin';
    const currentUserId = req.user?.userId || null;
    const result = await this.rolesService.setRolePermissions(
      code,
      dto,
      currentUsername,
      currentUserId,
      ip,
    );
    return result;
  }
}
