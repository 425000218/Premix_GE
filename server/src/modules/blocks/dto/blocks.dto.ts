import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class BlockQueryDto {
  @ApiPropertyOptional({ description: 'Trang hiện tại (bắt đầu từ 1)', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Kích thước trang (10, 20, 50, hoặc all)',
    default: '20',
    enum: ['10', '20', '50', 'all'],
  })
  @IsOptional()
  @IsString()
  pageSize?: string = '20';

  @ApiPropertyOptional({ description: 'Tìm kiếm theo mã/tên nguyên liệu, nhà máy hoặc lý do khóa' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID nhà máy' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId?: number;

  @ApiPropertyOptional({ description: 'Lọc theo ID nguyên liệu' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái hiệu lực suy diễn (BR-28): ACTIVE, RELEASED, hoặc ALL',
    enum: ['ACTIVE', 'RELEASED', 'ALL'],
  })
  @IsOptional()
  @IsIn(['ACTIVE', 'RELEASED', 'ALL'])
  status?: 'ACTIVE' | 'RELEASED' | 'ALL';

  @ApiPropertyOptional({
    description: 'Ngày mốc xét trạng thái hiệu lực (YYYY-MM-DD, mặc định hôm nay)',
    example: '2026-10-06',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'asOfDate phải có định dạng YYYY-MM-DD' })
  asOfDate?: string;

  @ApiPropertyOptional({
    description: 'Cột sắp xếp',
    default: 'CreatedAt',
    enum: ['CreatedAt', 'BlockedKg', 'StartDate'],
  })
  @IsOptional()
  @IsIn(['CreatedAt', 'BlockedKg', 'StartDate'])
  sortBy?: 'CreatedAt' | 'BlockedKg' | 'StartDate' = 'CreatedAt';

  @ApiPropertyOptional({
    description: 'Chiều sắp xếp',
    default: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class CreateBlockDto {
  @ApiProperty({ description: 'ID Nhà máy cần khóa hàng', example: 2 })
  @Type(() => Number)
  @IsInt({ message: 'factoryId phải là số nguyên hợp lệ' })
  @Min(1, { message: 'factoryId phải lớn hơn 0' })
  factoryId: number;

  @ApiProperty({ description: 'ID Nguyên liệu cần khóa hàng', example: 1 })
  @Type(() => Number)
  @IsInt({ message: 'materialId phải là số nguyên hợp lệ' })
  @Min(1, { message: 'materialId phải lớn hơn 0' })
  materialId: number;

  @ApiProperty({
    description: 'Khối lượng cần khóa (kg) — bắt buộc > 0 và không vượt quá SOH khả dụng (BR-28a)',
    example: 3000,
  })
  @Type(() => Number)
  @IsNumber({}, { message: 'blockedKg phải là số hợp lệ' })
  @Min(1, { message: 'Số lượng khóa phải lớn hơn 0 kg' })
  blockedKg: number;

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu hiệu lực khóa (YYYY-MM-DD). Nếu bỏ trống sẽ lấy ngày chốt SOH mới nhất',
    example: '2026-10-06',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu khóa phải có định dạng YYYY-MM-DD' })
  startDate?: string;

  @ApiProperty({
    description: 'Lý do khóa hàng (tối đa 250 ký tự)',
    example: 'Chờ kiểm nghiệm chất lượng lô hàng mới nhập (QC pending)',
  })
  @IsString({ message: 'Lý do khóa hàng phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do khóa hàng' })
  @MaxLength(250, { message: 'Lý do khóa hàng không được vượt quá 250 ký tự' })
  reason: string;
}

export class ReleaseBlockDto {
  @ApiPropertyOptional({
    description: 'Ngày kết thúc mở khóa (YYYY-MM-DD, phải >= StartDate). Mặc định là ngày chốt mới nhất',
    example: '2026-10-06',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc mở khóa phải có định dạng YYYY-MM-DD' })
  endDate?: string;
}
