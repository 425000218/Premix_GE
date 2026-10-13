import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({ description: 'Họ và tên đầy đủ', example: 'Nguyễn Văn B' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ description: 'Email liên hệ', example: 'nguyenvanb@feedmill.vn' })
  @IsOptional()
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  email?: string;

  @ApiProperty({ description: 'Mã vai trò', example: 'FACTORY' })
  @IsNotEmpty({ message: 'Mã vai trò không được để trống' })
  @IsString()
  roleCode: string;

  @ApiProperty({ description: 'Trạng thái hoạt động (1: Hoạt động, 0: Khóa)', example: true })
  @IsBoolean({ message: 'Trạng thái isActive phải là giá trị boolean' })
  isActive: boolean;

  @ApiPropertyOptional({
    description: 'Danh sách ID nhà máy gán (Bắt buộc nếu vai trò là FACTORY - phạm vi ASSIGNED)',
    example: [1],
    type: [Number],
  })
  @IsOptional()
  @IsArray({ message: 'Danh sách nhà máy phải là mảng số ID' })
  @IsNumber({}, { each: true, message: 'ID nhà máy phải là số nguyên' })
  factoryIds?: number[];
}
