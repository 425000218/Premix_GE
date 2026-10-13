import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, PositionsModule],
  controllers: [DashboardController],
  providers: [DashboardService, PermissionsGuard],
  exports: [DashboardService],
})
export class DashboardModule {}
