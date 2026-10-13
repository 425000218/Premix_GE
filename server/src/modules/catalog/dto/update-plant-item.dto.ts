import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePlantItemDto {
  @ApiProperty({ description: 'Trạng thái theo dõi vị thế tồn kho (1: Bật, 0: Tắt)', example: true })
  @IsBoolean({ message: 'Trạng thái isTracked phải là boolean' })
  isTracked: boolean;
}
