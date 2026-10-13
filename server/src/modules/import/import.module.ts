import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { ExcelParserService } from './excel-parser.service.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ImportController],
  providers: [ImportService, ExcelParserService, PermissionsGuard],
  exports: [ImportService, ExcelParserService],
})
export class ImportModule {}
