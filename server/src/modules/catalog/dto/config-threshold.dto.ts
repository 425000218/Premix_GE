import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateSystemConfigDto {
  @ApiProperty({ description: 'Số ngày chuẩn của tháng chu kỳ (20 - 31)', example: 28 })
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(31)
  standardMonthDays: number;

  @ApiProperty({ description: 'Ngưỡng số ngày tồn kho Nguy cấp CRITICAL (> 0, < WarningDays)', example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  criticalDays: number;

  @ApiProperty({ description: 'Ngưỡng số ngày tồn kho Cảnh báo WARNING (< OverstockDays)', example: 15 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  warningDays: number;

  @ApiProperty({ description: 'Ngưỡng số ngày tồn kho Dư thừa OVERSTOCK thông thường (<= OverstockDaysLowUsage)', example: 75 })
  @Type(() => Number)
  @IsInt()
  @Min(3)
  overstockDays: number;

  @ApiProperty({ description: 'Ngưỡng tồn dư dành riêng cho nguyên liệu dùng ít (>= OverstockDays)', example: 90 })
  @Type(() => Number)
  @IsInt()
  @Min(3)
  overstockDaysLowUsage: number;

  @ApiProperty({ description: 'Định mức tiêu hao tháng phân loại nguyên liệu dùng ít (kg/tháng)', example: 1000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lowUsageKgPerMonth: number;

  @ApiProperty({ description: 'Số ngày chạy máy tối thiểu trong tháng để dùng nhịp thực tế (>= 1)', example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minActiveDays: number;

  @ApiPropertyOptional({ description: 'Tham số cửa sổ dự phòng (>= MinActiveDays)', default: 14 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  actualWindowDays?: number = 14;

  @ApiProperty({ description: 'Số tháng kể từ ngày tạo PO để gắn cờ PO trễ hạn nhận (1 - 24)', example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  poLateMonths: number;

  @ApiProperty({
    description: 'Mốc tính tuổi PO (SNAPSHOT hoặc TODAY)',
    enum: ['SNAPSHOT', 'TODAY'],
    example: 'SNAPSHOT',
  })
  @IsString()
  @IsIn(['SNAPSHOT', 'TODAY'])
  poAgeReference: 'SNAPSHOT' | 'TODAY';

  @ApiProperty({ description: 'Số ngày tiêu hao mặc định cho 1 chuyến giao (1 - 365)', example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  deliveryDays: number;

  @ApiProperty({ description: 'Định mức chuyến giao mặc định cho hàng xá (kg, > 0)', example: 30000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  bulkDeliveryKg: number;

  @ApiProperty({ description: 'Số ngày không xuất dùng để kích hoạt cờ Tồn không sử dụng (>= 1)', example: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  unusedStockDays: number;

  @ApiProperty({ description: 'Số ngày bảo vệ tối thiểu, dưới mức này bật cờ Cần đặt hàng (> 0)', example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  reorderCoverDays: number;

  @ApiProperty({ description: 'Tỷ lệ % lệch giữa tiêu hao thực tế và chuẩn để bật cờ cảnh báo (> 0)', example: 30 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  usageDeviationPct: number;

  @ApiProperty({ description: 'Số ngày chênh lệch để hiển thị thanh cảnh báo Dữ liệu cũ (>= 1)', example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  staleDataDays: number;
}

export class ThresholdQueryDto {
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

  @ApiPropertyOptional({ description: 'Tìm kiếm theo mã/tên nguyên liệu, nhà máy hoặc ghi chú' })
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
    description: 'Cột sắp xếp',
    default: 'UpdatedAt',
    enum: ['UpdatedAt', 'FactoryCode', 'MaterialCode'],
  })
  @IsOptional()
  @IsIn(['UpdatedAt', 'FactoryCode', 'MaterialCode'])
  sortBy?: 'UpdatedAt' | 'FactoryCode' | 'MaterialCode' = 'UpdatedAt';

  @ApiPropertyOptional({
    description: 'Chiều sắp xếp',
    default: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}

export class UpsertThresholdDto {
  @ApiProperty({ description: 'ID Nhà máy', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  factoryId: number;

  @ApiProperty({ description: 'ID Nguyên liệu', example: 17 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  materialId: number;

  @ApiPropertyOptional({
    description: 'Ngưỡng Cảnh báo ghi đè (ngày). NULL = Kế thừa từ cấu hình chung. Phải > CriticalDays chung và < OverstockDays hiệu lực (BR-12a)',
    example: 12,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  warningDays?: number | null;

  @ApiPropertyOptional({
    description: 'Ngưỡng Tồn dư ghi đè (ngày). NULL = Kế thừa từ cấu hình chung. Phải > WarningDays hiệu lực (BR-12a)',
    example: 60,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  overstockDays?: number | null;

  @ApiPropertyOptional({
    description: 'Số ngày an toàn (0 - 365, tối đa 1 số lẻ)',
    example: 7,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(365)
  safetyDays?: number | null;

  @ApiPropertyOptional({
    description: 'Số ngày tiêu hao cho 1 chuyến giao riêng của cặp (1 - 365)',
    example: 7,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(365)
  deliveryDays?: number | null;

  @ApiPropertyOptional({
    description: 'Định mức khối lượng 1 chuyến giao riêng của cặp (kg, > 0)',
    example: 5000,
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  deliveryQtyKg?: number | null;

  @ApiPropertyOptional({
    description: 'Ghi chú lý do ghi đè ngưỡng (tối đa 250 ký tự)',
    example: 'Nguyên liệu đặc thù chu kỳ nhập nhanh',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string | null;
}
