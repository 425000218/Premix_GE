import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber } from 'class-validator';

export class AssignFactoriesDto {
  @ApiProperty({
    description: 'Danh sách ID nhà máy gán cho người dùng',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsNotEmpty({ message: 'Danh sách nhà máy không được để trống' })
  @IsArray({ message: 'Danh sách nhà máy phải là mảng' })
  @IsNumber({}, { each: true, message: 'ID nhà máy phải là số nguyên' })
  factoryIds: number[];
}
