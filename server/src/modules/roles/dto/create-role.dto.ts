import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Mã vai trò viết hoa không dấu',
    example: 'WAREHOUSE_LEAD',
  })
  @IsNotEmpty({ message: 'Mã vai trò không được để trống' })
  @IsString({ message: 'Mã vai trò phải là chuỗi ký tự' })
  @Length(2, 30, { message: 'Mã vai trò từ 2 đến 30 ký tự' })
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Mã vai trò chỉ chứa chữ in hoa, số và dấu gạch dưới',
  })
  roleCode: string;

  @ApiProperty({
    description: 'Tên hiển thị của vai trò',
    example: 'Trưởng kho nhà máy',
  })
  @IsNotEmpty({ message: 'Tên vai trò không được để trống' })
  @IsString({ message: 'Tên vai trò phải là chuỗi ký tự' })
  @Length(2, 100, { message: 'Tên vai trò từ 2 đến 100 ký tự' })
  roleName: string;

  @ApiPropertyOptional({
    description: 'Mô tả vai trò',
    example: 'Quản lý kho và xuất nhập tồn',
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

  @ApiPropertyOptional({
    description: 'Danh sách mã quyền khởi tạo ban đầu',
    type: [String],
    example: ['position.view', 'block.view'],
  })
  @IsOptional()
  @IsArray({ message: 'Danh sách quyền phải là một mảng' })
  @IsString({ each: true, message: 'Mỗi mã quyền phải là chuỗi ký tự' })
  permissionCodes?: string[];
}
