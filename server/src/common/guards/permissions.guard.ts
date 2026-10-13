import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES } from '../constants/roles.constant.js';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator.js';
import { ProcedureService } from '../../database/procedure.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly procedureService: ProcedureService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Người dùng chưa được xác thực');
    }

    // Quy tắc D1 & A4: ADMIN luôn có đủ 27 quyền hệ thống
    if (user.roleCode === ROLES.ADMIN) {
      return true;
    }

    // Đọc quyền trực tiếp từ CSDL ở mỗi request (A6: Cập nhật quyền tức thì)
    const resultSets = await this.procedureService.executeMultiSetProcedure(
      'usp_Auth_GetCurrentUser',
      { UserID: user.userId },
    );

    const userRow = resultSets[0] && resultSets[0][0] ? resultSets[0][0] : null;
    if (!userRow || !userRow.IsActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa hoặc không tồn tại');
    }

    const permRows = resultSets[1] || [];
    const userPermissions = new Set(permRows.map((r: any) => r.PermissionCode));

    const hasAll = requiredPermissions.every((perm) => userPermissions.has(perm));
    if (!hasAll) {
      throw new ForbiddenException(
        `Bạn không có quyền thực hiện thao tác này (yêu cầu: ${requiredPermissions.join(', ')})`,
      );
    }

    return true;
  }
}
