import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AuditController],
  providers: [AuditService, PermissionsGuard],
  exports: [AuditService],
})
export class AuditModule {}
