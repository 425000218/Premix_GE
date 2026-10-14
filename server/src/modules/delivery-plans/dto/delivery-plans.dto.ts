import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class GetWeekPlanQueryDto {
  @ApiProperty({
    description: 'Ngày Thứ 2 của tuần cần xem (YYYY-MM-DD)',
    example: '2026-10-05',
  })
  @IsNotEmpty()
  @IsDateString()
  weekStartDate!: string;

  @ApiPropertyOptional({
    description: 'ID của nhà máy (nếu để trống xem toàn bộ nhà máy được cấp quyền)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId?: number;

  @ApiPropertyOptional({
    description: 'ID của nguyên liệu cần lọc',
    example: 17,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;
}

export class PlanItemDto {
  @ApiProperty({
    description: 'Ngày dự kiến giao hàng (YYYY-MM-DD)',
    example: '2026-10-05',
  })
  @IsNotEmpty()
  @IsDateString()
  planDate!: string;

  @ApiProperty({
    description: 'ID của nguyên liệu',
    example: 17,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId!: number;

  @ApiProperty({
    description: 'ID của nhà cung cấp',
    example: 14,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId!: number;

  @ApiPropertyOptional({
    description: 'Số PO Pending liên kết (nếu có)',
    example: 'PO-2026-001',
  })
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional({
    description: 'Khối lượng giao theo TẤN (cho phép tối đa 3 chữ số thập phân, ví dụ 15.250 tấn)',
    example: 15.25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  planQtyTons?: number;

  @ApiPropertyOptional({
    description: 'Khối lượng giao theo KG nguyên (nếu gửi trực tiếp theo KG)',
    example: 15250,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  planQtyKg?: number;

  @ApiPropertyOptional({
    description: 'Ghi chú thêm cho chuyến giao',
    example: 'Giao sáng 8h',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class SaveWeekPlanDto {
  @ApiProperty({
    description: 'Ngày Thứ 2 của tuần cần lưu (YYYY-MM-DD)',
    example: '2026-10-05',
  })
  @IsNotEmpty()
  @IsDateString()
  weekStartDate!: string;

  @ApiProperty({
    description: 'ID nhà máy cần lưu kế hoạch',
    example: 1,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId!: number;

  @ApiProperty({
    description: 'Danh sách các dòng kế hoạch giao hàng trong tuần (nhập theo tấn)',
    type: [PlanItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanItemDto)
  plans!: PlanItemDto[];
}

export class GetPoOptionsQueryDto {
  @ApiProperty({
    description: 'ID của nhà máy',
    example: 1,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId!: number;

  @ApiProperty({
    description: 'ID của nguyên liệu',
    example: 17,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId!: number;

  @ApiPropertyOptional({
    description: 'ID của nhà cung cấp (tùy chọn)',
    example: 14,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId?: number;
}

export class SuggestPlanDto {
  @ApiProperty({
    description: 'Ngày Thứ 2 của tuần (YYYY-MM-DD)',
    example: '2026-10-05',
  })
  @IsNotEmpty()
  @IsDateString()
  weekStartDate!: string;

  @ApiProperty({
    description: 'ID của nhà máy',
    example: 1,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId!: number;

  @ApiPropertyOptional({
    description: 'ID của nguyên liệu (tùy chọn)',
    example: 17,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  @ApiPropertyOptional({
    description: 'Kích hoạt thuật toán ghép chuyến FTL theo NCC (JRP Can-order Policy)',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  consolidateBySupplier?: boolean;

  @ApiPropertyOptional({
    description: 'Ngưỡng tỷ lệ lấp đầy tối thiểu % (mặc định 85%)',
    example: 85,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(50)
  minFillRate?: number;

  @ApiPropertyOptional({
    description: 'Tự động làm tròn khối lượng theo quy cách bao chuẩn',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  autoRoundBag?: boolean;

  @ApiPropertyOptional({
    description: 'Tuân thủ cấm giao Chủ Nhật (Sunday Ban - BR-36)',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  avoidSunday?: boolean;
}
