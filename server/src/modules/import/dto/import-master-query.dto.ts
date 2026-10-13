import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ImportMasterQueryDto {
  @ApiPropertyOptional({
    description: 'Chế độ xem trước (Dry-run): Kiểm tra cú pháp và logic, không ghi vào CSDL',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true || value === 1 || value === '1')
  @IsBoolean()
  dryRun?: boolean = false;
}
