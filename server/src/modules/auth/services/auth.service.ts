import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcryptjs from 'bcryptjs';
import { ALL_PERMISSIONS } from '../../../common/constants/permissions.constant.js';
import { ROLES } from '../../../common/constants/roles.constant.js';
import { AppDateUtil } from '../../../common/utils/app-date.util.js';
import { ProcedureService } from '../../../database/procedure.service.js';
import { ChangePasswordDto } from '../dto/change-password.dto.js';
import { LoginDto } from '../dto/login.dto.js';
import { RateLimiterService } from './rate-limiter.service.js';

export interface AuthSessionUser {
  userId: number;
  username: string;
  fullName: string;
  email: string | null;
  roleCode: string;
  roleName: string;
  factoryScope: string;
}

export interface LoginResult {
  token: string;
  user: AuthSessionUser;
  permissions: string[];
  appTimezone: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly procedureService: ProcedureService,
    private readonly jwtService: JwtService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /**
   * Đăng nhập người dùng (F01a)
   */
  async login(loginDto: LoginDto, ip: string = '127.0.0.1'): Promise<LoginResult> {
    // 1. Kiểm tra rate limit IP
    this.rateLimiter.checkRateLimit(ip);

    // 2. Lấy thông tin tài khoản qua Stored Procedure
    const users = await this.procedureService.executeProcedure<{
      UserID: number;
      Username: string;
      PasswordHash: string;
      FullName: string;
      Email: string | null;
      RoleCode: string;
      RoleName: string;
      FactoryScope: string;
      IsActive: boolean;
    }>('usp_Auth_GetUserForLogin', { Username: loginDto.username });

    const user = users && users.length > 0 ? users[0] : null;

    // 3. Nếu tài khoản không tồn tại hoặc bị khóa -> thông báo lỗi chung
    if (!user || !user.IsActive) {
      this.rateLimiter.recordFailedAttempt(ip);
      await this.logAudit(null, loginDto.username, 'AUTH_LOGIN_FAILED', 'User', null, ip, 'FAILED', 'Sai tên đăng nhập hoặc tài khoản bị khóa');
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    // 4. So khớp mật khẩu băm
    const isPasswordValid = bcryptjs.compareSync(loginDto.password, user.PasswordHash);
    if (!isPasswordValid) {
      this.rateLimiter.recordFailedAttempt(ip);
      await this.logAudit(user.UserID, user.Username, 'AUTH_LOGIN_FAILED', 'User', user.UserID.toString(), ip, 'FAILED', 'Sai mật khẩu');
      throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    // 5. Đăng nhập thành công -> Reset bộ đếm rate-limit
    this.rateLimiter.resetAttempts(ip);

    // 6. Lấy danh sách quyền (ADMIN luôn có đủ 27 quyền tính cứng)
    let permissions: string[] = [];
    if (user.RoleCode === ROLES.ADMIN) {
      permissions = [...ALL_PERMISSIONS];
    } else {
      const permRows = await this.procedureService.executeProcedure<{ PermissionCode: string }>(
        'usp_Auth_GetCurrentUser',
        { UserID: user.UserID },
      );
      permissions = permRows.map((r) => r.PermissionCode);
    }

    // 7. Sinh JWT Token
    const payload = {
      sub: user.UserID,
      username: user.Username,
      roleCode: user.RoleCode,
      factoryScope: user.FactoryScope,
    };
    const token = this.jwtService.sign(payload);

    // 8. Ghi nhật ký kiểm toán đăng nhập thành công
    await this.logAudit(user.UserID, user.Username, 'AUTH_LOGIN_SUCCESS', 'User', user.UserID.toString(), ip, 'SUCCESS');

    return {
      token,
      user: {
        userId: user.UserID,
        username: user.Username,
        fullName: user.FullName,
        email: user.Email,
        roleCode: user.RoleCode,
        roleName: user.RoleName,
        factoryScope: user.FactoryScope,
      },
      permissions,
      appTimezone: process.env.APP_TIMEZONE || AppDateUtil.DEFAULT_TIMEZONE,
    };
  }

  /**
   * Đọc hồ sơ người dùng hiện tại (/auth/me)
   */
  async getMe(userId: number): Promise<{
    user: AuthSessionUser;
    permissions: string[];
    factories: Array<{ factoryId: number; factoryCode: string; factoryName: string }>;
    appTimezone: string;
  }> {
    const rawResult = await this.procedureService.executeMultiSetProcedure(
      'usp_Auth_GetCurrentUser',
      { UserID: userId },
    );

    // rawResult là mảng các tập kết quả
    const userRow = rawResult[0] && rawResult[0][0] ? rawResult[0][0] : null;
    if (!userRow || !userRow.IsActive) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ hoặc tài khoản đã bị vô hiệu hóa');
    }

    let permissions: string[] = [];
    if (userRow.RoleCode === ROLES.ADMIN) {
      permissions = [...ALL_PERMISSIONS];
    } else {
      const permRows = rawResult[1] || [];
      permissions = permRows.map((p: any) => p.PermissionCode);
    }

    const factoryRows = rawResult[2] || [];
    const factories = factoryRows.map((f: any) => ({
      factoryId: f.FactoryID,
      factoryCode: f.FactoryCode,
      factoryName: f.FactoryName,
    }));

    return {
      user: {
        userId: userRow.UserID,
        username: userRow.Username,
        fullName: userRow.FullName,
        email: userRow.Email,
        roleCode: userRow.RoleCode,
        roleName: userRow.RoleName,
        factoryScope: userRow.FactoryScope,
      },
      permissions,
      factories,
      appTimezone: process.env.APP_TIMEZONE || AppDateUtil.DEFAULT_TIMEZONE,
    };
  }

  /**
   * Đổi mật khẩu cá nhân
   */
  async changePassword(userId: number, dto: ChangePasswordDto, ip: string = '127.0.0.1'): Promise<{ message: string }> {
    // 1. Lấy thông tin user hiện tại
    const userMe = await this.getMe(userId);
    const users = await this.procedureService.executeProcedure<{
      UserID: number;
      Username: string;
      PasswordHash: string;
    }>('usp_Auth_GetUserForLogin', { Username: userMe.user.username });

    const user = users && users.length > 0 ? users[0] : null;
    if (!user) {
      throw new BadRequestException('Không tìm thấy thông tin tài khoản');
    }

    // 2. Kiểm tra mật khẩu cũ
    if (!bcryptjs.compareSync(dto.currentPassword, user.PasswordHash)) {
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    // 3. Kiểm tra mật khẩu mới không được trùng mật khẩu cũ
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Mật khẩu mới không được trùng với mật khẩu hiện tại');
    }

    // 4. Băm mật khẩu mới
    const newHash = bcryptjs.hashSync(dto.newPassword, 10);

    // 5. Cập nhật qua Stored Procedure
    await this.procedureService.executeProcedure('usp_Auth_UpdatePassword', {
      UserID: userId,
      PasswordHash: newHash,
    });

    // 6. Ghi log kiểm toán
    await this.logAudit(userId, user.Username, 'USER_CHANGE_PASSWORD', 'User', userId.toString(), ip, 'SUCCESS');

    return { message: 'Đổi mật khẩu thành công' };
  }

  /**
   * Đăng xuất
   */
  async logout(userId: number, username: string, ip: string = '127.0.0.1'): Promise<{ message: string }> {
    await this.logAudit(userId, username, 'AUTH_LOGOUT', 'User', userId.toString(), ip, 'SUCCESS');
    return { message: 'Đăng xuất thành công' };
  }

  /**
   * Tiện ích ghi Audit Log qua Stored Procedure usp_Audit_Write
   */
  private async logAudit(
    userId: number | null,
    username: string,
    actionCode: string,
    targetEntity: string,
    targetId: string | null = null,
    ip: string = '127.0.0.1',
    status: 'SUCCESS' | 'FAILED' = 'SUCCESS',
    errorMessage: string | null = null,
  ): Promise<void> {
    try {
      await this.procedureService.executeProcedure('usp_Audit_Write', {
        UserID: userId,
        Username: username,
        ActionCode: actionCode,
        TargetEntity: targetEntity,
        TargetID: targetId,
        IPAddress: ip,
        OldValues: null,
        NewValues: null,
        Status: status,
        ErrorMessage: errorMessage,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to write audit log: ${e.message}`);
    }
  }
}
