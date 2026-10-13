import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface AuthenticatedUser {
  userId: number;
  username: string;
  roleCode: string;
  factoryScope: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Yêu cầu cần Bearer token xác thực hợp lệ');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = this.jwtService.verify(token);
      (request as any).user = {
        userId: decoded.sub,
        username: decoded.username,
        roleCode: decoded.roleCode,
        factoryScope: decoded.factoryScope,
      } as AuthenticatedUser;

      return true;
    } catch {
      throw new UnauthorizedException('Phiên làm việc không hợp lệ hoặc đã hết hạn');
    }
  }
}
