import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PositionsController } from './positions.controller.js';
import { PositionsService } from './positions.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PositionsController],
  providers: [PositionsService, PermissionsGuard],
  exports: [PositionsService],
})
export class PositionsModule {}
