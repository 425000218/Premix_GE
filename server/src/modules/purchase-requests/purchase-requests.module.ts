import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PositionsModule } from '../positions/positions.module.js';
import { PurchaseRequestsController } from './purchase-requests.controller.js';
import { PurchaseRequestsService } from './purchase-requests.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, PositionsModule],
  controllers: [PurchaseRequestsController],
  providers: [PurchaseRequestsService, PermissionsGuard],
  exports: [PurchaseRequestsService],
})
export class PurchaseRequestsModule {}
