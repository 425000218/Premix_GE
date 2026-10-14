import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class SetPermissionsDto {
  @ApiProperty({
    description: 'Danh sách mã quyền cần cấp cho vai trò (từ danh mục 27 quyền chuẩn)',
    type: [String],
    example: ['position.view', 'block.view', 'block.create'],
  })
  @IsArray({ message: 'Danh sách quyền phải là mảng chuỗi' })
  @IsString({ each: true, message: 'Mỗi mã quyền phải là chuỗi ký tự' })
  permissionCodes: string[];
}
