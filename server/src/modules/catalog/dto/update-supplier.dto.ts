import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateSupplierDto {
  @ApiProperty({ description: 'Thời gian giao hàng (0 - 365 ngày)', example: 14, minimum: 0, maximum: 365 })
  @IsInt({ message: 'Thời gian giao hàng phải là số nguyên' })
  @Min(0, { message: 'Thời gian giao hàng tối thiểu là 0 ngày' })
  @Max(365, { message: 'Thời gian giao hàng tối đa là 365 ngày' })
  leadTimeDays: number;
}
