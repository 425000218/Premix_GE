import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { DeliveryPlansController } from './delivery-plans.controller.js';
import { DeliveryPlansService } from './delivery-plans.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [DeliveryPlansController],
  providers: [DeliveryPlansService, PermissionsGuard],
  exports: [DeliveryPlansService],
})
export class DeliveryPlansModule {}
