import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class ImportHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Loại lô nạp (MASTER, DAILY_SET, FORECAST)',
    enum: ['MASTER', 'DAILY_SET', 'FORECAST'],
  })
  @IsOptional()
  @IsString()
  batchType?: string;
}
