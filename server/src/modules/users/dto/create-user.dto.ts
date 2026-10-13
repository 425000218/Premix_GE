import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ description: 'Tên đăng nhập (chữ cái, số, _, -, .)', example: 'planner01' })
  @IsNotEmpty({ message: 'Tên đăng nhập không được để trống' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'Tên đăng nhập chỉ được chứa chữ cái, chữ số và các ký tự: _ . -',
  })
  username: string;

  @ApiProperty({ description: 'Họ và tên đầy đủ', example: 'Nguyễn Văn A' })
  @IsNotEmpty({ message: 'Họ tên không được để trống' })
  @IsString()
  fullName: string;

  @ApiPropertyOptional({ description: 'Email liên hệ', example: 'nguyenvana@feedmill.vn' })
  @IsOptional()
  @IsEmail({}, { message: 'Định dạng email không hợp lệ' })
  email?: string;

  @ApiProperty({ description: 'Mã vai trò (ADMIN, PLANNER, FACTORY, VIEWER)', example: 'PLANNER' })
  @IsNotEmpty({ message: 'Mã vai trò không được để trống' })
  @IsString()
  roleCode: string;

  @ApiPropertyOptional({
    description: 'Danh sách ID nhà máy gán (Bắt buộc nếu vai trò là FACTORY - phạm vi ASSIGNED)',
    example: [1, 2],
    type: [Number],
  })
  @IsOptional()
  @IsArray({ message: 'Danh sách nhà máy phải là mảng số ID' })
  @IsNumber({}, { each: true, message: 'ID nhà máy phải là số nguyên' })
  factoryIds?: number[];

  @ApiPropertyOptional({
    description: 'Mật khẩu ban đầu (mặc định User@1234 nếu để trống)',
    example: 'User@1234',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Mật khẩu ban đầu phải có ít nhất 8 ký tự' })
  initialPassword?: string;
}
