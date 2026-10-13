import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class PairDetailQueryDto {
  @ApiPropertyOptional({
    description: 'Ngày chốt xem chi tiết cặp (YYYY-MM-DD, mặc định lấy ngày chốt mới nhất)',
    example: '2026-10-11',
  })
  @IsOptional()
  @IsDateString()
  snapshotDate?: string;
}
