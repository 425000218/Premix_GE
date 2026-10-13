import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import databaseConfig from './config/database.config.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ImportModule } from './modules/import/import.module.js';
import { PositionsModule } from './modules/positions/positions.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { BlocksModule } from './modules/blocks/blocks.module.js';
import { DeliveryPlansModule } from './modules/delivery-plans/delivery-plans.module.js';
import { PurchaseRequestsModule } from './modules/purchase-requests/purchase-requests.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig],
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AuditModule,
    CatalogModule,
    ImportModule,
    PositionsModule,
    DashboardModule,
    BlocksModule,
    DeliveryPlansModule,
    PurchaseRequestsModule,
  ],
})
export class AppModule {}
