import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { ConfigThresholdController } from './config-threshold.controller.js';
import { ConfigThresholdService } from './config-threshold.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CatalogController, ConfigThresholdController],
  providers: [CatalogService, ConfigThresholdService, PermissionsGuard],
  exports: [CatalogService, ConfigThresholdService],
})
export class CatalogModule {}
