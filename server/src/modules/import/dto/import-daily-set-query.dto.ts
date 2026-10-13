import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ImportDailySetQueryDto {
  @ApiPropertyOptional({
    description: 'Ngày chốt C (YYYY-MM-DD). Nếu để trống, hệ thống tự động trích xuất D từ tên file và tính C = D - 1 (BR-15e)',
    example: '2026-10-06',
  })
  @IsOptional()
  @IsString()
  snapshotDate?: string;
}
