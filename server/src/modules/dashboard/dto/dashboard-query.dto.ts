import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Ngày chốt xem Dashboard (YYYY-MM-DD, mặc định lấy ngày chốt mới nhất)',
    example: '2026-10-06',
  })
  @IsOptional()
  @IsDateString()
  snapshotDate?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID Nhà máy',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  factoryId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo Category nguyên liệu',
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
    description: 'Tìm kiếm nhanh theo mã hoặc tên nguyên liệu',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
