import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePurchaseRequestDto {
  @ApiProperty({
    description: 'ID nhà máy cần đặt mua',
    example: 1,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId!: number;

  @ApiProperty({
    description: 'ID nguyên liệu cần đặt mua',
    example: 17,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId!: number;

  @ApiProperty({
    description: 'ID nhà cung cấp được chọn',
    example: 14,
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId!: number;

  @ApiPropertyOptional({
    description: 'Khối lượng đặt mua theo TẤN (ví dụ 10.5 tấn)',
    example: 10.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedQtyTons?: number;

  @ApiPropertyOptional({
    description: 'Khối lượng đặt mua theo KG nguyên (ví dụ 10500 kg)',
    example: 10500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  requestedQtyKg?: number;

  @ApiProperty({
    description: 'Ngày cần hàng về nhà máy (YYYY-MM-DD)',
    example: '2026-10-20',
  })
  @IsNotEmpty()
  @IsDateString()
  needByDate!: string;

  @ApiPropertyOptional({
    description: 'Ghi chú thêm cho đề nghị mua hàng',
    example: 'Mua bổ sung theo gợi ý định mức tồn kho',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdatePurchaseRequestStatusDto {
  @ApiProperty({
    description: 'Trạng thái mới cần chuyển đổi (MATCHED, EXPIRED, CANCELLED)',
    enum: ['MATCHED', 'EXPIRED', 'CANCELLED'],
    example: 'MATCHED',
  })
  @IsNotEmpty()
  @IsIn(['MATCHED', 'EXPIRED', 'CANCELLED'])
  status!: 'MATCHED' | 'EXPIRED' | 'CANCELLED';

  @ApiPropertyOptional({
    description: 'Số PO từ ERP D365 (bắt buộc khi status = MATCHED)',
    example: 'PO-2026-999',
  })
  @IsOptional()
  @IsString()
  poNumber?: string;

  @ApiPropertyOptional({
    description: 'Lý do hủy (áp dụng khi status = CANCELLED)',
    example: 'Kế hoạch sản xuất thay đổi, không cần mua đợt này',
  })
  @IsOptional()
  @IsString()
  cancelReason?: string;
}

export class PurchaseRequestQueryDto {
  @ApiPropertyOptional({
    description: 'Tìm kiếm theo mã PR, mã/tên nguyên liệu, tên NCC, số PO',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID nhà máy',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo ID nguyên liệu',
    example: 17,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo ID nhà cung cấp',
    example: 14,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái (SENT, MATCHED, EXPIRED, CANCELLED)',
    enum: ['SENT', 'MATCHED', 'EXPIRED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['SENT', 'MATCHED', 'EXPIRED', 'CANCELLED'])
  status?: 'SENT' | 'MATCHED' | 'EXPIRED' | 'CANCELLED';

  @ApiPropertyOptional({
    description: 'Ngày cần hàng từ ngày (YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'Ngày cần hàng đến ngày (YYYY-MM-DD)',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Trang hiện tại (mặc định 1)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Số dòng trên mỗi trang (10, 20, 50, 0 là tất cả, mặc định 20)',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pageSize: number = 20;

  @ApiPropertyOptional({
    description: 'Cột sắp xếp (CreatedAt, NeedByDate, RequestedQtyKg)',
    default: 'CreatedAt',
  })
  @IsOptional()
  @IsString()
  sortBy: string = 'CreatedAt';

  @ApiPropertyOptional({
    description: 'Chiều sắp xếp (ASC hoặc DESC)',
    default: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder: 'ASC' | 'DESC' = 'DESC';
}

export class PurchaseSuggestionsQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo ID nhà máy',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo ID nguyên liệu',
    example: 17,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId?: number;

  @ApiPropertyOptional({
    description: 'Ngày chốt tính toán (mặc định lấy ngày chốt mới nhất)',
    example: '2026-10-06',
  })
  @IsOptional()
  @IsDateString()
  snapshotDate?: string;
}

export class ExportPurchaseRequestDto {
  @ApiPropertyOptional({
    description: 'Danh sách ID các phiếu đề nghị mua hàng cần xuất Excel (nếu để trống xuất theo bộ lọc)',
    type: [Number],
    example: [1, 2, 3],
  })
  @IsOptional()
  @IsArray()
  requestIds?: number[];

  @ApiPropertyOptional({
    description: 'Lọc theo ID nhà máy khi xuất toàn bộ',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái khi xuất toàn bộ',
    enum: ['SENT', 'MATCHED', 'EXPIRED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['SENT', 'MATCHED', 'EXPIRED', 'CANCELLED'])
  status?: string;
}
