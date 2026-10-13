import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProcedureService } from '../../database/procedure.service.js';
import { BlockQueryDto, CreateBlockDto, ReleaseBlockDto } from './dto/blocks.dto.js';

@Injectable()
export class BlocksService {
  constructor(private readonly procedureService: ProcedureService) {}

  private handleSqlError(err: any): never {
    const msg: string = err?.message || '';
    const number: number = err?.number || 0;

    const cleanMsg = msg.replace(/^\[50\d{3}\]\s*/, '');

    if (number === 50403 || msg.includes('[50403]')) {
      throw new ForbiddenException(cleanMsg || 'Bạn không có quyền thao tác trên nhà máy này.');
    }
    if (number === 50404 || msg.includes('[50404]')) {
      throw new NotFoundException(cleanMsg || 'Không tìm thấy bản ghi yêu cầu.');
    }
    if (number === 50400 || msg.includes('[50400]')) {
      throw new BadRequestException(cleanMsg || 'Dữ liệu đầu vào không hợp lệ.');
    }
    throw err;
  }

  private mapBlockRow(r: any) {
    return {
      blockId: Number(r.BlockID),
      factoryId: Number(r.FactoryID),
      factoryCode: r.FactoryCode,
      factoryName: r.FactoryName,
      materialId: Number(r.MaterialID),
      materialCode: r.MaterialCode,
      materialName: r.MaterialName,
      category: r.Category ?? null,
      itemGroup: r.ItemGroup ?? null,
      bagKg: r.BagKg != null ? Number(r.BagKg) : null,
      displayDecimals: r.DisplayDecimals != null ? Number(r.DisplayDecimals) : 2,
      blockedKg: Number(r.BlockedKg),
      currentSohKg: r.CurrentSohKg != null ? Number(r.CurrentSohKg) : undefined,
      totalBlockedKgAfter:
        r.TotalBlockedKgAfter != null ? Number(r.TotalBlockedKgAfter) : undefined,
      remainingAvailableKg:
        r.RemainingAvailableKg != null ? Number(r.RemainingAvailableKg) : undefined,
      startDate: r.StartDate,
      endDate: r.EndDate ?? null,
      blockStatus: r.BlockStatus as 'ACTIVE' | 'RELEASED',
      reason: r.Reason ?? null,
      createdAt: r.CreatedAt ? new Date(r.CreatedAt).toISOString() : null,
      createdBy: r.CreatedBy,
      releasedAt: r.ReleasedAt ? new Date(r.ReleasedAt).toISOString() : null,
      releasedBy: r.ReleasedBy ?? null,
    };
  }

  async findAll(userId: number, query: BlockQueryDto) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const isAll = String(query.pageSize).toLowerCase() === 'all';
    const numericPageSize = isAll ? 0 : Number(query.pageSize) || 20;

    try {
      const rows = await this.procedureService.executeProcedure<any>('dbo.usp_Block_List', {
        UserID: userId,
        Search: query.search?.trim() || null,
        FactoryID: query.factoryId ?? null,
        MaterialID: query.materialId ?? null,
        Status: query.status || null,
        AsOfDate: query.asOfDate || null,
        Page: page,
        PageSize: numericPageSize,
        SortBy: query.sortBy || 'CreatedAt',
        SortOrder: query.sortOrder || 'DESC',
      });

      const totalItems = rows.length > 0 ? Number(rows[0].TotalCount) : 0;
      const effectivePageSize = isAll ? totalItems || 1 : numericPageSize;
      const totalPages =
        totalItems === 0 ? 0 : isAll ? 1 : Math.ceil(totalItems / effectivePageSize);

      return {
        items: rows.map((r: any) => this.mapBlockRow(r)),
        meta: {
          page: isAll ? 1 : page,
          pageSize: isAll ? 'all' : numericPageSize,
          totalItems,
          totalPages,
        },
      };
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  async create(userId: number, username: string, dto: CreateBlockDto, ipAddress: string) {
    try {
      const rows = await this.procedureService.executeProcedure<any>('dbo.usp_Block_Create', {
        UserID: userId,
        Username: username,
        FactoryID: dto.factoryId,
        MaterialID: dto.materialId,
        BlockedKg: dto.blockedKg,
        StartDate: dto.startDate || null,
        Reason: dto.reason.trim(),
        IPAddress: ipAddress || null,
      });

      if (!rows || rows.length === 0) {
        throw new BadRequestException('Không thể tạo lệnh khóa hàng.');
      }

      return this.mapBlockRow(rows[0]);
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  async release(
    userId: number,
    username: string,
    blockId: number,
    dto: ReleaseBlockDto,
    ipAddress: string,
  ) {
    try {
      const rows = await this.procedureService.executeProcedure<any>('dbo.usp_Block_Release', {
        UserID: userId,
        Username: username,
        BlockID: blockId,
        EndDate: dto.endDate || null,
        IPAddress: ipAddress || null,
      });

      if (!rows || rows.length === 0) {
        throw new NotFoundException('Lệnh khóa hàng không tồn tại.');
      }

      return this.mapBlockRow(rows[0]);
    } catch (err) {
      this.handleSqlError(err);
    }
  }
}
