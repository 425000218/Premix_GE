import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({
    description: 'Tên hiển thị của vai trò',
    example: 'Trưởng kho nhà máy cập nhật',
  })
  @IsNotEmpty({ message: 'Tên vai trò không được để trống' })
  @IsString({ message: 'Tên vai trò phải là chuỗi ký tự' })
  @Length(2, 100, { message: 'Tên vai trò từ 2 đến 100 ký tự' })
  roleName: string;

  @ApiPropertyOptional({
    description: 'Mô tả vai trò',
    example: 'Quản lý kho và xuất nhập tồn cập nhật',
  })
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi ký tự' })
  description?: string;

  @ApiProperty({
    description: 'Phạm vi nhà máy',
    enum: ['ALL', 'ASSIGNED'],
    example: 'ASSIGNED',
  })
  @IsNotEmpty({ message: 'Phạm vi nhà máy không được để trống' })
  @IsIn(['ALL', 'ASSIGNED'], {
    message: 'Phạm vi nhà máy chỉ chấp nhận ALL hoặc ASSIGNED',
  })
  factoryScope: 'ALL' | 'ASSIGNED';
}
