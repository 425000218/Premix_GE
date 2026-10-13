import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AuditService } from './audit.service.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';

@ApiTags('Audit Logs')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('user.view')
  @ApiOperation({ summary: 'Xem lịch sử nhật ký kiểm toán hệ thống (F01b)' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách nhật ký kiểm toán thành công' })
  @ApiResponse({ status: 403, description: 'Không có quyền truy cập' })
  async getAuditLogs(@Query() query: AuditQueryDto) {
    const result = await this.auditService.getAuditLogs(query);
    return {
      message: 'Lấy danh sách nhật ký kiểm toán thành công',
      data: result.items,
      meta: result.meta,
    };
  }
}
