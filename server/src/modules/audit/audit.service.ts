import { Injectable, Logger } from '@nestjs/common';
import { PaginationMeta } from '../../common/dto/pagination.dto.js';
import { ProcedureService } from '../../database/procedure.service.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly procedureService: ProcedureService) {}

  /**
   * Truy vấn danh sách nhật ký kiểm toán hệ thống
   */
  async getAuditLogs(query: AuditQueryDto): Promise<{ items: any[]; meta: PaginationMeta }> {
    const page = query.page || 1;
    const pageSize = query.parsedPageSize;

    const rows = await this.procedureService.executeProcedure('usp_Audit_List', {
      Search: query.search || null,
      ActionCode: query.actionCode || null,
      Username: query.username || null,
      FromDate: query.fromDate ? `${query.fromDate}T00:00:00` : null,
      ToDate: query.toDate ? `${query.toDate}T23:59:59` : null,
      Page: page,
      PageSize: pageSize,
      SortOrder: (query.order || 'DESC').toUpperCase(),
    });

    const totalItems = rows && rows.length > 0 ? Number(rows[0].TotalCount) : 0;
    const totalPages = pageSize > 0 ? Math.ceil(totalItems / pageSize) : 1;

    const items = (rows || []).map((row) => ({
      logId: row.LogID,
      timestamp: row.Timestamp,
      userId: row.UserID,
      username: row.Username,
      actionCode: row.ActionCode,
      targetEntity: row.TargetEntity,
      targetId: row.TargetID,
      ipAddress: row.IPAddress,
      oldValues: row.OldValues,
      newValues: row.NewValues,
      status: row.Status,
      errorMessage: row.ErrorMessage,
    }));

    return {
      items,
      meta: {
        page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
      },
    };
  }
}
