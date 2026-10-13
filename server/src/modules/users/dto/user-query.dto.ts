import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo mã vai trò (ADMIN, PLANNER, FACTORY, VIEWER)' })
  @IsOptional()
  @IsString()
  roleCode?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái hoạt động' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Lọc theo ID nhà máy' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  factoryId?: number;
}
