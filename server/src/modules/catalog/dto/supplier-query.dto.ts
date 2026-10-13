import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class SupplierQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo nhóm vendor (LOC_SUPPLIER, FOR_SUPPLIER)' })
  @IsOptional()
  @IsString()
  vendorGroup?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái hoạt động' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;
}
