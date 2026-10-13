import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo mã hành động (ví dụ: AUTH_LOGIN_SUCCESS, USER_CREATE)' })
  @IsOptional()
  @IsString()
  actionCode?: string;

  @ApiPropertyOptional({ description: 'Lọc theo tên người thực hiện' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'Từ ngày (ISO Date: YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Định dạng fromDate không hợp lệ (YYYY-MM-DD)' })
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Đến ngày (ISO Date: YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Định dạng toDate không hợp lệ (YYYY-MM-DD)' })
  toDate?: string;
}
