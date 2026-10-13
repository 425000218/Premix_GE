import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import bcryptjs from 'bcryptjs';
import { ROLES } from '../../common/constants/roles.constant.js';
import { PaginationMeta } from '../../common/dto/pagination.dto.js';
import { ProcedureService } from '../../database/procedure.service.js';
import { AssignFactoriesDto } from './dto/assign-factories.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserQueryDto } from './dto/user-query.dto.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly procedureService: ProcedureService) {}

  /**
   * Lấy danh sách người dùng kèm phân trang, tìm kiếm, lọc
   */
  async getUsers(query: UserQueryDto): Promise<{ items: any[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const pageSize = query.parsedPageSize;

    const rows = await this.procedureService.executeProcedure('usp_User_List', {
      Search: query.search || null,
      RoleCode: query.roleCode || null,
      IsActive: query.isActive !== undefined ? (query.isActive ? 1 : 0) : null,
      FactoryID: query.factoryId || null,
      Page: page,
      PageSize: pageSize,
      SortBy: query.sort || 'CreatedAt',
      SortOrder: (query.order || 'DESC').toUpperCase(),
    });

    const totalItems = rows && rows.length > 0 ? Number(rows[0].TotalCount) : 0;
    const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;

    const items = (rows || []).map((row) => ({
      userId: row.UserID,
      username: row.Username,
      fullName: row.FullName,
      email: row.Email,
      roleCode: row.RoleCode,
      roleName: row.RoleName,
      factoryScope: row.FactoryScope,
      isActive: Boolean(row.IsActive),
      assignedFactories: row.AssignedFactoryCodes
        ? row.AssignedFactoryCodes.split(', ')
        : [],
      createdAt: row.CreatedAt,
      updatedAt: row.UpdatedAt,
    }));

    return {
      items,
      meta: {
        page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Xem thông tin chi tiết một người dùng
   */
  async getUserById(userId: number): Promise<{ user: any; assignedFactories: any[] }> {
    const resultSets = await this.procedureService.executeMultiSetProcedure(
      'usp_User_GetById',
      { UserID: userId },
    );

    const userRow = resultSets[0] && resultSets[0][0] ? resultSets[0][0] : null;
    if (!userRow) {
      throw new NotFoundException(`Không tìm thấy người dùng có ID ${userId}`);
    }

    const factoryRows = resultSets[1] || [];
    const assignedFactories = factoryRows.map((f: any) => ({
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
        isActive: Boolean(userRow.IsActive),
        createdAt: userRow.CreatedAt,
        updatedAt: userRow.UpdatedAt,
      },
      assignedFactories,
    };
  }

  /**
   * Tạo tài khoản người dùng mới
   */
  async createUser(
    dto: CreateUserDto,
    currentUsername: string = 'admin',
    ip: string = '127.0.0.1',
  ): Promise<any> {
    // 1. Kiểm tra ràng buộc BR-02b: vai trò FACTORY (scope ASSIGNED) bắt buộc chọn ít nhất 1 nhà máy
    if (dto.roleCode === ROLES.FACTORY && (!dto.factoryIds || dto.factoryIds.length === 0)) {
      throw new BadRequestException(
        'Vai trò phạm vi ASSIGNED bắt buộc phải gán ít nhất một nhà máy',
      );
    }

    // 2. Băm mật khẩu (mặc định User@1234 nếu để trống)
    const rawPassword = dto.initialPassword || 'User@1234';
    const passwordHash = bcryptjs.hashSync(rawPassword, 10);

    // 3. Chuẩn bị JSON danh sách nhà máy
    const factoryIdsJson =
      dto.factoryIds && dto.factoryIds.length > 0
        ? JSON.stringify(dto.factoryIds)
        : null;

    try {
      const result = await this.procedureService.executeProcedure<{ NewUserID: number }>(
        'usp_User_Create',
        {
          Username: dto.username,
          PasswordHash: passwordHash,
          FullName: dto.fullName,
          Email: dto.email || null,
          RoleCode: dto.roleCode,
          FactoryIdsJson: factoryIdsJson,
          CreatedBy: currentUsername,
        },
      );

      const newUserId = result && result.length > 0 ? result[0].NewUserID : null;
      if (!newUserId) {
        throw new BadRequestException('Không thể lấy ID người dùng mới tạo');
      }

      // 4. Ghi Audit Log
      await this.logAudit(
        null,
        currentUsername,
        'USER_CREATE',
        'User',
        newUserId.toString(),
        ip,
        'SUCCESS',
        null,
        null,
        JSON.stringify({ username: dto.username, roleCode: dto.roleCode }),
      );

      return await this.getUserById(newUserId);
    } catch (err: any) {
      const msg = err.message || '';
      if (
        msg.includes('tồn tại') ||
        msg.includes('tá»“n táº¡i') ||
        msg.includes('đã tồn tại') ||
        msg.includes('already exists')
      ) {
        throw new ConflictException('Tên đăng nhập đã tồn tại trong hệ thống');
      }
      throw new BadRequestException(msg || 'Lỗi khi tạo người dùng');
    }
  }

  /**
   * Cập nhật thông tin người dùng
   */
  async updateUser(
    userId: number,
    dto: UpdateUserDto,
    currentUsername: string = 'admin',
    currentUserId: number = 1,
    ip: string = '127.0.0.1',
  ): Promise<any> {
    // Không thể tự khóa chính mình nếu là Admin
    if (userId === currentUserId && dto.isActive === false) {
      throw new ForbiddenException('Không thể tự khóa tài khoản quản trị của chính mình');
    }
    if (userId === 1 && dto.isActive === false) {
      throw new ForbiddenException('Không thể tự khóa tài khoản quản trị tối cao của hệ thống');
    }
    if (userId === 1 && dto.roleCode !== ROLES.ADMIN) {
      throw new ForbiddenException('Không thể hạ vai trò của tài khoản quản trị tối cao');
    }

    if (dto.roleCode === ROLES.FACTORY && (!dto.factoryIds || dto.factoryIds.length === 0)) {
      throw new BadRequestException(
        'Vai trò phạm vi ASSIGNED bắt buộc phải gán ít nhất một nhà máy',
      );
    }

    const factoryIdsJson =
      dto.factoryIds && dto.factoryIds.length > 0
        ? JSON.stringify(dto.factoryIds)
        : null;

    try {
      await this.procedureService.executeProcedure('usp_User_Update', {
        UserID: userId,
        FullName: dto.fullName,
        Email: dto.email || null,
        RoleCode: dto.roleCode,
        IsActive: dto.isActive ? 1 : 0,
        FactoryIdsJson: factoryIdsJson,
        UpdatedBy: currentUsername,
      });

      await this.logAudit(
        currentUserId,
        currentUsername,
        'USER_UPDATE',
        'User',
        userId.toString(),
        ip,
        'SUCCESS',
        null,
        null,
        JSON.stringify({ fullName: dto.fullName, roleCode: dto.roleCode, isActive: dto.isActive }),
      );

      return await this.getUserById(userId);
    } catch (err: any) {
      if (err.message && err.message.includes('đã được sử dụng')) {
        throw new ConflictException(err.message);
      }
      if (err.message && err.message.includes('Không thể')) {
        throw new ForbiddenException(err.message);
      }
      throw new BadRequestException(err.message || 'Lỗi khi cập nhật người dùng');
    }
  }

  /**
   * Gán danh sách nhà máy cho tài khoản
   */
  async assignFactories(
    userId: number,
    dto: AssignFactoriesDto,
    currentUsername: string = 'admin',
    currentUserId: number = 1,
    ip: string = '127.0.0.1',
  ): Promise<{ message: string }> {
    const factoryIdsJson = JSON.stringify(dto.factoryIds);

    await this.procedureService.executeProcedure('usp_User_AssignFactories', {
      UserID: userId,
      FactoryIdsJson: factoryIdsJson,
      UpdatedBy: currentUsername,
    });

    await this.logAudit(
      currentUserId,
      currentUsername,
      'USER_ASSIGN_FACTORIES',
      'User',
      userId.toString(),
      ip,
      'SUCCESS',
      null,
      null,
      JSON.stringify({ factoryIds: dto.factoryIds }),
    );

    return { message: 'Cập nhật danh sách nhà máy thành công' };
  }

  /**
   * Admin đặt lại mật khẩu cho người dùng
   */
  async resetPassword(
    userId: number,
    dto: ResetPasswordDto,
    currentUsername: string = 'admin',
    currentUserId: number = 1,
    ip: string = '127.0.0.1',
  ): Promise<{ message: string }> {
    const passwordHash = bcryptjs.hashSync(dto.newPassword, 10);

    await this.procedureService.executeProcedure('usp_User_ResetPassword', {
      UserID: userId,
      PasswordHash: passwordHash,
      UpdatedBy: currentUsername,
    });

    await this.logAudit(
      currentUserId,
      currentUsername,
      'USER_RESET_PASSWORD',
      'User',
      userId.toString(),
      ip,
      'SUCCESS',
    );

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  /**
   * Xóa tài khoản (Chỉ xóa khi chưa phát sinh dữ liệu, nếu đã có dữ liệu từ chối với HTTP 409)
   */
  async deleteUser(
    userId: number,
    currentUsername: string = 'admin',
    currentUserId: number = 1,
    ip: string = '127.0.0.1',
  ): Promise<{ message: string }> {
    if (userId === currentUserId || userId === 1) {
      throw new ForbiddenException(
        'Không thể tự xóa tài khoản của chính mình hoặc tài khoản Admin tối cao',
      );
    }

    try {
      await this.procedureService.executeProcedure('usp_User_Delete', {
        UserID: userId,
        DeletedBy: currentUsername,
      });

      await this.logAudit(
        currentUserId,
        currentUsername,
        'USER_DELETE',
        'User',
        userId.toString(),
        ip,
        'SUCCESS',
      );

      return { message: 'Xóa tài khoản người dùng thành công' };
    } catch (err: any) {
      if (err.message && err.message.includes('dữ liệu giao dịch')) {
        throw new ConflictException(err.message);
      }
      if (err.message && err.message.includes('Không thể')) {
        throw new ForbiddenException(err.message);
      }
      throw new BadRequestException(err.message || 'Lỗi khi xóa người dùng');
    }
  }

  /**
   * Ghi log kiểm toán
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
    oldValues: string | null = null,
    newValues: string | null = null,
  ): Promise<void> {
    try {
      await this.procedureService.executeProcedure('usp_Audit_Write', {
        UserID: userId,
        Username: username,
        ActionCode: actionCode,
        TargetEntity: targetEntity,
        TargetID: targetId,
        IPAddress: ip,
        OldValues: oldValues,
        NewValues: newValues,
        Status: status,
        ErrorMessage: errorMessage,
      });
    } catch (e: any) {
      this.logger.warn(`Failed to write audit log: ${e.message}`);
    }
  }
}
