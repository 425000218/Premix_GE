import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDateUtil } from '../../common/utils/app-date.util.js';

export interface HealthStatus {
  status: 'UP' | 'DOWN';
  timestamp: string;
  uptimeSeconds: number;
  appTimezone: string;
  todayDate: string;
  database: {
    status: 'CONNECTED' | 'DISCONNECTED';
    type: string;
    databaseName: string;
    responseTimeMs?: number;
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  async checkHealth(): Promise<HealthStatus> {
    const start = Date.now();
    let dbStatus: 'CONNECTED' | 'DISCONNECTED' = 'DISCONNECTED';
    let responseTimeMs = 0;

    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1 AS is_alive');
        dbStatus = 'CONNECTED';
        responseTimeMs = Date.now() - start;
      }
    } catch (err: any) {
      this.logger.error(`Database health check failed: ${err.message}`);
    }

    const mem = process.memoryUsage();

    return {
      status: dbStatus === 'CONNECTED' ? 'UP' : 'DOWN',
      timestamp: AppDateUtil.getUtcNow(),
      uptimeSeconds: Math.floor(process.uptime()),
      appTimezone: process.env.APP_TIMEZONE || AppDateUtil.DEFAULT_TIMEZONE,
      todayDate: AppDateUtil.getAppToday(),
      database: {
        status: dbStatus,
        type: 'mssql',
        databaseName: 'PremixTrack_DB',
        responseTimeMs,
      },
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      },
    };
  }
}
