import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ImportForecastQueryDto {
  @ApiPropertyOptional({
    description: 'Tháng dự báo nhu cầu (YYYY-MM hoặc YYYY-MM-01)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsString()
  periodMonth?: string;

  @ApiPropertyOptional({
    description: 'Ngày giờ lập phiên bản Forecast (ISO 8601 hoặc YYYY-MM-DD)',
    example: '2026-10-01T08:00:00Z',
  })
  @IsOptional()
  @IsString()
  versionDate?: string;

  @ApiPropertyOptional({
    description: 'Chế độ xem trước (Dry-run): Kiểm tra cú pháp và xoay ma trận, không ghi CSDL',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1')
  @IsBoolean()
  dryRun?: boolean = false;
}
