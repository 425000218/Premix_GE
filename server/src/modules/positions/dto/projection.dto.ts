import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ProjectionQueryDto {
  @ApiPropertyOptional({
    description: 'Ngày chốt C cần xem dự phóng (YYYY-MM-DD). Nếu để trống, mặc định ngày chốt mới nhất.',
    example: '2026-10-06',
  })
  @IsOptional()
  @IsDateString({}, { message: 'snapshotDate phải có định dạng YYYY-MM-DD.' })
  snapshotDate?: string;
}
