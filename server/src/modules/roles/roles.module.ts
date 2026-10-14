import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [RolesController],
  providers: [RolesService, PermissionsGuard],
  exports: [RolesService],
})
export class RolesModule {}
