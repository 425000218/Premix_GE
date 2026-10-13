import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService, HealthStatus } from './health.service.js';

@ApiTags('System')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái hoạt động của hệ thống và kết nối CSDL' })
  @ApiResponse({ status: 200, description: 'Hệ thống hoạt động bình thường' })
  async getHealth(): Promise<{ message: string; data: HealthStatus }> {
    const health = await this.healthService.checkHealth();
    return {
      message: health.status === 'UP' ? 'Hệ thống hoạt động bình thường' : 'Hệ thống đang gặp sự cố kết nối',
      data: health,
    };
  }
}
