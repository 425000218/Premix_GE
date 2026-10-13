import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthService } from './services/auth.service.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập hệ thống (F01a)' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, trả về token và quyền' })
  @ApiResponse({ status: 401, description: 'Tên đăng nhập hoặc mật khẩu không chính xác' })
  @ApiResponse({ status: 429, description: 'Chặn tạm thời do nhập sai quá 5 lần/15 phút' })
  async login(@Body() loginDto: LoginDto, @Ip() ip: string) {
    const result = await this.authService.login(loginDto, ip || '127.0.0.1');
    return {
      message: 'Đăng nhập thành công',
      data: result,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Xem thông tin tài khoản hiện tại kèm quyền và nhà máy' })
  @ApiResponse({ status: 200, description: 'Lấy thông tin tài khoản thành công' })
  @ApiResponse({ status: 401, description: 'Chưa đăng nhập hoặc phiên hết hạn' })
  async getMe(@Req() req: any) {
    const result = await this.authService.getMe(req.user.userId);
    return {
      message: 'Lấy thông tin tài khoản thành công',
      data: result,
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Đổi mật khẩu cá nhân' })
  @ApiResponse({ status: 200, description: 'Đổi mật khẩu thành công' })
  @ApiResponse({ status: 400, description: 'Mật khẩu cũ không đúng hoặc mật khẩu mới vi phạm' })
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto, @Ip() ip: string) {
    const result = await this.authService.changePassword(req.user.userId, dto, ip || '127.0.0.1');
    return {
      message: result.message,
      data: null,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Đăng xuất khỏi hệ thống' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  async logout(@Req() req: any, @Ip() ip: string) {
    const result = await this.authService.logout(req.user.userId, req.user.username, ip || '127.0.0.1');
    return {
      message: result.message,
      data: null,
    };
  }
}
