import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class PositionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Ngày chốt xem báo cáo (YYYY-MM-DD, mặc định lấy ngày chốt mới nhất)',
    example: '2026-10-11',
  })
  @IsOptional()
  @IsDateString()
  snapshotDate?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID Nhà máy',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  factoryId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo Category nguyên liệu (Vitamin, Khoáng vi lượng, Enzyme...)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo Phân nhóm (Premix / Ngoài premix)',
  })
  @IsOptional()
  @IsString()
  itemGroup?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo Mức cảnh báo',
    enum: ['CRITICAL', 'WARNING', 'BALANCED', 'OVERSTOCK', 'NO_DEMAND'],
  })
  @IsOptional()
  @IsIn(['CRITICAL', 'WARNING', 'BALANCED', 'OVERSTOCK', 'NO_DEMAND'])
  level?: 'CRITICAL' | 'WARNING' | 'BALANCED' | 'OVERSTOCK' | 'NO_DEMAND';

  @ApiPropertyOptional({
    description: 'Lọc theo mã cờ dữ liệu bất thường (PO_LATE_RECEIPT, REORDER_NEEDED, UNUSED_STOCK, USAGE_DEVIATION...)',
  })
  @IsOptional()
  @IsString()
  flag?: string;
}
