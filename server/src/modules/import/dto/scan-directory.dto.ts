import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ScanDirectoryQueryDto {
  @ApiPropertyOptional({
    description: 'Đường dẫn thư mục chứa các thư mục ngày chốt ddmmyy (mặc định Mock_Export_Data)',
    example: 'Mock_Export_Data',
  })
  @IsOptional()
  @IsString()
  dirPath?: string;
}

export class ImportScannedFolderDto {
  @ApiProperty({
    description: 'Đường dẫn thư mục ngày chốt cần nạp (ví dụ C:/Premix_GE/Mock_Export_Data/260926)',
    example: 'Mock_Export_Data/260926',
  })
  @IsString()
  folderPath: string;

  @ApiPropertyOptional({
    description: 'Chế độ xem trước (Dry-run) - không ghi vào CSDL',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  dryRun?: boolean = false;

  @ApiPropertyOptional({
    description: 'Ngày chốt ghi đè (YYYY-MM-DD)',
    example: '2026-09-25',
  })
  @IsOptional()
  @IsString()
  snapshotDate?: string;
}

export class BatchImportScannedDto {
  @ApiProperty({
    description: 'Danh sách các đường dẫn thư mục cần nạp theo thứ tự',
    type: [String],
    example: ['Mock_Export_Data/260926', 'Mock_Export_Data/270926'],
  })
  @IsArray()
  @IsString({ each: true })
  folderPaths: string[];

  @ApiPropertyOptional({
    description: 'Chế độ xem trước (Dry-run)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  dryRun?: boolean = false;
}
