import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ALL_PERMISSIONS } from '../../common/constants/permissions.constant.js';
import { ProcedureService } from '../../database/procedure.service.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { SetPermissionsDto } from './dto/set-permissions.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

export interface RoleItem {
  roleCode: string;
  roleName: string;
  description: string | null;
  factoryScope: 'ALL' | 'ASSIGNED';
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  permissionCount: number;
}

export interface PermissionCatalogItem {
  permissionCode: string;
  permissionName: string;
  moduleCode: string;
  moduleName: string;
  description: string;
  sortOrder: number;
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly procedureService: ProcedureService) {}

  /**
   * Lấy danh sách toàn bộ vai trò kèm thống kê
   */
  async getRoles(): Promise<RoleItem[]> {
    const rows = await this.procedureService.executeProcedure<any>('usp_Role_List');
    return (rows || []).map((r: any) => ({
      roleCode: r.RoleCode,
      roleName: r.RoleName,
      description: r.Description,
      factoryScope: r.FactoryScope,
      isSystem: Boolean(r.IsSystem),
      createdAt: r.CreatedAt,
      updatedAt: r.UpdatedAt,
      userCount: Number(r.UserCount || 0),
      permissionCount: Number(r.PermissionCount || 0),
    }));
  }

  /**
   * Lấy danh mục 27 mã quyền chuẩn kèm phân nhóm module
   */
  async getPermissionsCatalog(): Promise<PermissionCatalogItem[]> {
    const rows = await this.procedureService.executeProcedure<any>(
      'usp_Role_GetPermissionsCatalog',
    );
    return (rows || []).map((p: any) => ({
      permissionCode: p.PermissionCode,
      permissionName: p.PermissionName,
      moduleCode: p.ModuleCode,
      moduleName: p.ModuleName,
      description: p.Description,
      sortOrder: Number(p.SortOrder || 0),
    }));
  }

  /**
   * Lấy chi tiết vai trò và danh sách quyền
   */
  async getRoleByCode(roleCode: string): Promise<{
    role: RoleItem;
    permissions: string[];
  }> {
    const upperCode = roleCode.toUpperCase().trim();
    const resultSets = await this.procedureService.executeMultiSetProcedure(
      'usp_Role_GetByCode',
      { RoleCode: upperCode },
    );

    const roleRow = resultSets[0] && resultSets[0][0] ? resultSets[0][0] : null;
    if (!roleRow) {
      throw new NotFoundException(`Không tìm thấy vai trò với mã '${upperCode}'`);
    }

    const permissionRows = resultSets[1] || [];
    const permissions = permissionRows.map((p: any) => p.PermissionCode);

    return {
      role: {
        roleCode: roleRow.RoleCode,
        roleName: roleRow.RoleName,
        description: roleRow.Description,
        factoryScope: roleRow.FactoryScope,
        isSystem: Boolean(roleRow.IsSystem),
        createdAt: roleRow.CreatedAt,
        updatedAt: roleRow.UpdatedAt,
        userCount: Number(roleRow.UserCount || 0),
        permissionCount: Number(roleRow.PermissionCount || 0),
      },
      permissions,
    };
  }

  /**
   * Tạo vai trò tùy biến mới
   */
  async createRole(
    dto: CreateRoleDto,
    currentUsername: string = 'admin',
    currentUserId: number | null = 1,
    ip: string = '127.0.0.1',
  ): Promise<any> {
    const upperRoleCode = dto.roleCode.toUpperCase().trim();

    // Kiểm tra trùng mã vai trò ở application layer để độc lập với collation/encoding
    const existingRoles = await this.getRoles();
    if (existingRoles.some((r) => r.roleCode === upperRoleCode)) {
      throw new ConflictException(`Mã vai trò '${upperRoleCode}' đã tồn tại trong hệ thống`);
    }

    // 1. Kiểm tra tính hợp lệ của permissionCodes nếu có truyền
    if (dto.permissionCodes && dto.permissionCodes.length > 0) {
      const invalidPermissions = dto.permissionCodes.filter(
        (code) => !ALL_PERMISSIONS.includes(code as any),
      );
      if (invalidPermissions.length > 0) {
        throw new BadRequestException(
          `Mã quyền không hợp lệ: ${invalidPermissions.join(', ')}`,
        );
      }
    }

    const permissionsJson =
      dto.permissionCodes && dto.permissionCodes.length > 0
        ? JSON.stringify(dto.permissionCodes)
        : null;

    try {
      await this.procedureService.executeProcedure('usp_Role_Create', {
        CurrentUserID: currentUserId,
        CurrentUsername: currentUsername,
        RoleCode: upperRoleCode,
        RoleName: dto.roleName,
        Description: dto.description || null,
        FactoryScope: dto.factoryScope,
        PermissionsJson: permissionsJson,
        IPAddress: ip,
      });

      return await this.getRoleByCode(upperRoleCode);
    } catch (err: any) {
      if (err.message && err.message.includes('đã tồn tại')) {
        throw new ConflictException(err.message);
      }
      if (err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(err.message || 'Lỗi khi tạo vai trò');
    }
  }

  /**
   * Cập nhật thông tin vai trò
   */
  async updateRole(
    roleCode: string,
    dto: UpdateRoleDto,
    currentUsername: string = 'admin',
    currentUserId: number | null = 1,
    ip: string = '127.0.0.1',
  ): Promise<any> {
    const upperRoleCode = roleCode.toUpperCase().trim();

    // Chặn đổi scope của ADMIN
    if (upperRoleCode === 'ADMIN' && dto.factoryScope !== 'ALL') {
      throw new BadRequestException(
        'Vai trò ADMIN bắt buộc phải có phạm vi toàn hệ thống (ALL)',
      );
    }

    try {
      await this.procedureService.executeProcedure('usp_Role_Update', {
        CurrentUserID: currentUserId,
        CurrentUsername: currentUsername,
        RoleCode: upperRoleCode,
        RoleName: dto.roleName,
        Description: dto.description || null,
        FactoryScope: dto.factoryScope,
        IPAddress: ip,
      });

      return await this.getRoleByCode(upperRoleCode);
    } catch (err: any) {
      if (err.message && err.message.includes('không tồn tại')) {
        throw new NotFoundException(err.message);
      }
      if (err.message && err.message.includes('ADMIN bắt buộc')) {
        throw new BadRequestException(err.message);
      }
      throw new BadRequestException(err.message || 'Lỗi khi cập nhật vai trò');
    }
  }

  /**
   * Xóa vai trò tùy biến
   */
  async deleteRole(
    roleCode: string,
    currentUsername: string = 'admin',
    currentUserId: number | null = 1,
    ip: string = '127.0.0.1',
  ): Promise<{ message: string }> {
    const upperRoleCode = roleCode.toUpperCase().trim();

    // 1. Kiểm tra tồn tại và quyền xóa
    const existing = await this.getRoleByCode(upperRoleCode);
    if (existing.role.isSystem || ['ADMIN', 'PLANNER', 'FACTORY', 'VIEWER'].includes(upperRoleCode)) {
      throw new ForbiddenException(
        `Không thể xóa vai trò hệ thống mặc định '${upperRoleCode}'`,
      );
    }
    if (existing.role.userCount > 0) {
      throw new ForbiddenException(
        `Không thể xóa vai trò '${upperRoleCode}' vì đang được gán cho ${existing.role.userCount} người dùng trong hệ thống`,
      );
    }

    try {
      await this.procedureService.executeProcedure('usp_Role_Delete', {
        CurrentUserID: currentUserId,
        CurrentUsername: currentUsername,
        RoleCode: upperRoleCode,
        IPAddress: ip,
      });

      return {
        message: `Đã xóa vai trò '${upperRoleCode}' thành công`,
      };
    } catch (err: any) {
      if (err.message && err.message.includes('không tồn tại')) {
        throw new NotFoundException(err.message);
      }
      if (
        (err.message && err.message.includes('Không thể xóa vai trò')) ||
        (err.message && err.message.includes('đang được gán'))
      ) {
        throw new ForbiddenException(err.message);
      }
      throw new BadRequestException(err.message || 'Lỗi khi xóa vai trò');
    }
  }

  /**
   * Cập nhật ma trận quyền cho vai trò
   */
  async setRolePermissions(
    roleCode: string,
    dto: SetPermissionsDto,
    currentUsername: string = 'admin',
    currentUserId: number | null = 1,
    ip: string = '127.0.0.1',
  ): Promise<{ message: string; roleCode: string; permissions: string[] }> {
    const upperRoleCode = roleCode.toUpperCase().trim();

    // 1. Chặn can thiệp quyền của ADMIN
    if (upperRoleCode === 'ADMIN') {
      throw new ForbiddenException(
        'Không được phép tùy biến quyền của vai trò ADMIN hệ thống',
      );
    }

    // 2. Validate toàn bộ mã quyền
    const invalidPermissions = dto.permissionCodes.filter(
      (code) => !ALL_PERMISSIONS.includes(code as any),
    );
    if (invalidPermissions.length > 0) {
      throw new BadRequestException(
        `Chứa mã quyền không hợp lệ: ${invalidPermissions.join(', ')}`,
      );
    }

    const permissionsJson = JSON.stringify(dto.permissionCodes);

    try {
      const rows = await this.procedureService.executeProcedure<{ PermissionCode: string }>(
        'usp_Role_SetPermissions',
        {
          CurrentUserID: currentUserId,
          CurrentUsername: currentUsername,
          RoleCode: upperRoleCode,
          PermissionsJson: permissionsJson,
          IPAddress: ip,
        },
      );

      const updatedPermissions = (rows || []).map((r) => r.PermissionCode);

      await this.logAudit(
        currentUserId,
        currentUsername,
        'ROLE_SET_PERMISSIONS',
        'Role',
        upperRoleCode,
        ip,
        'SUCCESS',
        null,
        null,
        JSON.stringify({
          permissionCount: updatedPermissions.length,
          permissions: updatedPermissions,
        }),
      );

      return {
        message: `Đã cập nhật ${updatedPermissions.length} quyền cho vai trò '${upperRoleCode}' thành công`,
        roleCode: upperRoleCode,
        permissions: updatedPermissions,
      };
    } catch (err: any) {
      if (err.message && err.message.includes('không tồn tại')) {
        throw new NotFoundException(err.message);
      }
      if (err.message && err.message.includes('Không được phép tùy biến')) {
        throw new ForbiddenException(err.message);
      }
      if (err instanceof ForbiddenException || err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException(err.message || 'Lỗi khi gán quyền cho vai trò');
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
