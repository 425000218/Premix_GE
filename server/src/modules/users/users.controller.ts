import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
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
import { AssignFactoriesDto } from './dto/assign-factories.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserQueryDto } from './dto/user-query.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('user.view')
  @ApiOperation({ summary: 'Xem danh sách người dùng phân trang, lọc, tìm kiếm (F01b)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách người dùng thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập' })
  async getUsers(@Query() query: UserQueryDto) {
    const result = await this.usersService.getUsers(query);
    return {
      message: 'Lấy danh sách người dùng thành công',
      data: result.items,
      meta: result.meta,
    };
  }

  @Post()
  @RequirePermissions('user.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Tạo tài khoản người dùng mới' })
  @ApiResponse({ status: 201, description: 'Tạo người dùng thành công' })
  @ApiResponse({ status: 400, description: 'Dữ liệu không hợp lệ hoặc thiếu nhà máy' })
  @ApiResponse({ status: 409, description: 'Tên đăng nhập hoặc email đã tồn tại' })
  async createUser(
    @Body() dto: CreateUserDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const result = await this.usersService.createUser(
      dto,
      req.user.username,
      ip || '127.0.0.1',
    );
    return {
      message: 'Tạo tài khoản người dùng thành công',
      data: result,
    };
  }

  @Get(':id')
  @RequirePermissions('user.view')
  @ApiOperation({ summary: 'Xem chi tiết một người dùng kèm danh sách nhà máy' })
  @ApiResponse({ status: 200, description: 'Lấy chi tiết người dùng thành công' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy người dùng' })
  async getUserById(@Param('id', ParseIntPipe) id: number) {
    const result = await this.usersService.getUserById(id);
    return {
      message: 'Lấy thông tin người dùng thành công',
      data: result,
    };
  }

  @Put(':id')
  @RequirePermissions('user.update')
  @ApiOperation({ summary: 'Cập nhật thông tin người dùng, vai trò, trạng thái' })
  @ApiResponse({ status: 200, description: 'Cập nhật người dùng thành công' })
  @ApiResponse({ status: 403, description: 'Không thể tự khóa admin tối cao' })
  async updateUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const result = await this.usersService.updateUser(
      id,
      dto,
      req.user.username,
      req.user.userId,
      ip || '127.0.0.1',
    );
    return {
      message: 'Cập nhật thông tin người dùng thành công',
      data: result,
    };
  }

  @Put(':id/factories')
  @RequirePermissions('user.update')
  @ApiOperation({ summary: 'Gán danh sách nhà máy cho tài khoản' })
  @ApiResponse({ status: 200, description: 'Gán nhà máy thành công' })
  async assignFactories(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignFactoriesDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const result = await this.usersService.assignFactories(
      id,
      dto,
      req.user.username,
      req.user.userId,
      ip || '127.0.0.1',
    );
    return {
      message: result.message,
      data: null,
    };
  }

  @Post(':id/reset-password')
  @RequirePermissions('user.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu cho tài khoản' })
  @ApiResponse({ status: 200, description: 'Đặt lại mật khẩu thành công' })
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const result = await this.usersService.resetPassword(
      id,
      dto,
      req.user.username,
      req.user.userId,
      ip || '127.0.0.1',
    );
    return {
      message: result.message,
      data: null,
    };
  }

  @Delete(':id')
  @RequirePermissions('user.delete')
  @ApiOperation({ summary: 'Xóa tài khoản người dùng (nếu chưa phát sinh dữ liệu)' })
  @ApiResponse({ status: 200, description: 'Xóa tài khoản thành công' })
  @ApiResponse({ status: 409, description: 'Tài khoản đã có dữ liệu phát sinh, yêu cầu khóa' })
  async deleteUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Ip() ip: string,
  ) {
    const result = await this.usersService.deleteUser(
      id,
      req.user.username,
      req.user.userId,
      ip || '127.0.0.1',
    );
    return {
      message: result.message,
      data: null,
    };
  }
}
