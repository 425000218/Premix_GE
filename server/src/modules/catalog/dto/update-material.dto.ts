import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateMaterialDto {
  @ApiPropertyOptional({ description: 'Chuyên viên phụ trách (PIC)', example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  pic?: string;

  @ApiProperty({ description: 'Số chữ số thập phân hiển thị (0 - 4)', example: 2, minimum: 0, maximum: 4 })
  @IsInt({ message: 'Số lẻ hiển thị phải là số nguyên' })
  @Min(0, { message: 'Số lẻ hiển thị tối thiểu là 0' })
  @Max(4, { message: 'Số lẻ hiển thị tối đa là 4' })
  displayDecimals: number;
}
