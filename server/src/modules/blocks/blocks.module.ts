import { Module } from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BlocksController } from './blocks.controller.js';
import { BlocksService } from './blocks.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [BlocksController],
  providers: [BlocksService, PermissionsGuard],
  exports: [BlocksService],
})
export class BlocksModule {}
