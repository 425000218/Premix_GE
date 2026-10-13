import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Số thứ tự trang (bắt đầu từ 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Kích thước trang (10, 20, 50 hoặc 0/all để lấy tất cả)',
    default: 20,
  })
  @IsOptional()
  @Type(() => String)
  pageSize: string | number = 20;

  @ApiPropertyOptional({ description: 'Tên trường dùng để sắp xếp' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ description: 'Thứ tự sắp xếp (ASC hoặc DESC)', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  order: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm tự do' })
  @IsOptional()
  @IsString()
  search?: string;

  get parsedPageSize(): number {
    if (this.pageSize === 'all' || this.pageSize === '0' || this.pageSize === 0) {
      return 0; // 0 = Lấy tất cả (không phân trang trong SQL)
    }
    const parsed = Number(this.pageSize);
    return isNaN(parsed) || parsed < 1 ? 20 : parsed;
  }
}

export interface PaginationMeta {
  page: number;
  pageSize: number | string;
  totalItems: number;
  totalPages: number;
}
