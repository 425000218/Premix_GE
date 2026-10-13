import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';

export interface ProcedureParam {
  name: string;
  value: any;
}

@Injectable()
export class ProcedureService {
  private readonly logger = new Logger(ProcedureService.name);

  constructor(private readonly dataSource: DataSource) {}

  private getPool(runner?: QueryRunner): any {
    if (runner) {
      return (runner.connection.driver as any).master;
    }
    return (this.dataSource.driver as any).master;
  }

  /**
   * Thực thi Stored Procedure trả về kết quả (SELECT 1 tập dữ liệu)
   * Sử dụng mssql Request an toàn tuyệt đối chống SQL Injection
   */
  async executeProcedure<T = any>(
    procedureName: string,
    params: Record<string, any> = {},
    runner?: QueryRunner,
  ): Promise<T[]> {
    const pool = this.getPool(runner);
    const request = pool.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }

    const qualifiedName = procedureName.startsWith('dbo.')
      ? procedureName
      : `dbo.${procedureName}`;

    this.logger.debug(`Executing: ${qualifiedName} with ${Object.keys(params).length} params`);
    const result = await request.execute(qualifiedName);
    return (result.recordset || []) as T[];
  }

  /**
   * Thực thi Stored Procedure trả về nhiều Result Sets (Multi-dataset)
   * Ví dụ: usp_Auth_GetCurrentUser trả về 3 bảng, sp_Position_LoadSnapshot trả về 8 bảng
   */
  async executeMultiSetProcedure(
    procedureName: string,
    params: Record<string, any> = {},
    runner?: QueryRunner,
  ): Promise<any[][]> {
    const pool = this.getPool(runner);
    const request = pool.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }

    const qualifiedName = procedureName.startsWith('dbo.')
      ? procedureName
      : `dbo.${procedureName}`;

    this.logger.debug(`Executing MultiSet: ${qualifiedName} with ${Object.keys(params).length} params`);
    const result = await request.execute(qualifiedName);
    return (result.recordsets || []) as any[][];
  }

  /**
   * Tạo QueryRunner để quản lý Transaction cho tác vụ nhiều bước
   */
  async createTransactionRunner(): Promise<QueryRunner> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    return runner;
  }
}
