import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDemandOverrideDto {
  @ApiPropertyOptional({
    description: 'Khối lượng nhu cầu tháng sửa tay tính theo KG (nguyên)',
    example: 2500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'overrideKg phải là số hợp lệ' })
  @Min(0, { message: 'overrideKg phải >= 0' })
  overrideKg?: number;

  @ApiPropertyOptional({
    description: 'Khối lượng nhu cầu tháng sửa tay tính theo TẤN (ví dụ 2.500 tấn)',
    example: 2.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'overrideTons phải là số hợp lệ' })
  @Min(0, { message: 'overrideTons phải >= 0' })
  overrideTons?: number;

  @ApiPropertyOptional({
    description: 'Tháng áp dụng nhu cầu sửa tay (YYYY-MM-01 hoặc YYYY-MM-DD). Mặc định là tháng hiện tại của ngày chốt',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'periodMonth phải có định dạng ngày hợp lệ (YYYY-MM-DD)' })
  periodMonth?: string;

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu áp dụng số sửa tay (YYYY-MM-DD). Mặc định là ngày chốt mới nhất',
    example: '2026-10-06',
  })
  @IsOptional()
  @IsDateString({}, { message: 'effectiveDate phải có định dạng ngày hợp lệ (YYYY-MM-DD)' })
  effectiveDate?: string;

  @ApiProperty({
    description: 'Lý do sửa tay nhu cầu tháng (bắt buộc, tối đa 250 ký tự)',
    example: 'Thay đổi công thức sản xuất cám Heo Thịt đột xuất trong tháng 10',
  })
  @IsNotEmpty({ message: 'Vui lòng nhập lý do sửa tay nhu cầu tháng' })
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @MaxLength(250, { message: 'Lý do không được vượt quá 250 ký tự' })
  reason!: string;
}

export class RemoveDemandOverrideDto {
  @ApiPropertyOptional({
    description: 'Tháng cần hủy bỏ số sửa tay (YYYY-MM-01). Mặc định là tháng hiện tại của ngày chốt',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString({}, { message: 'periodMonth phải có định dạng ngày hợp lệ (YYYY-MM-DD)' })
  periodMonth?: string;

  @ApiPropertyOptional({
    description: 'Ngày bắt đầu hủy bỏ số sửa tay (YYYY-MM-DD). Mặc định là ngày chốt mới nhất',
    example: '2026-10-06',
  })
  @IsOptional()
  @IsDateString({}, { message: 'effectiveDate phải có định dạng ngày hợp lệ (YYYY-MM-DD)' })
  effectiveDate?: string;

  @ApiPropertyOptional({
    description: 'Lý do hủy bỏ số sửa tay để quay về dùng Forecast (tối đa 250 ký tự)',
    example: 'Kế hoạch sản xuất trở lại bình thường theo Forecast đã phê duyệt',
  })
  @IsOptional()
  @IsString({ message: 'Lý do phải là chuỗi ký tự' })
  @MaxLength(250, { message: 'Lý do không được vượt quá 250 ký tự' })
  reason?: string;
}

export class OverrideHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo tháng (YYYY-MM-01)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsDateString()
  periodMonth?: string;
}

export class FlagsQueryDto {
  @ApiPropertyOptional({
    description: 'Ngày chốt xem danh sách cờ (YYYY-MM-DD)',
    example: '2026-10-06',
  })
  @IsOptional()
  @IsDateString()
  snapshotDate?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo ID nhà máy',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  factoryId?: number;

  @ApiPropertyOptional({
    description: 'Lọc theo mã cờ bất thường cụ thể (ví dụ: UNUSED_STOCK, REORDER_NEEDED, USAGE_DEVIATION, STALE_DATA, PO_LATE_RECEIPT, FORECAST_NEWER_THAN_OVERRIDE)',
    example: 'REORDER_NEEDED',
  })
  @IsOptional()
  @IsString()
  flagCode?: string;
}
