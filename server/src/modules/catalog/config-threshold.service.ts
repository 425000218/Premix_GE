import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProcedureService } from '../../database/procedure.service.js';
import {
  ThresholdQueryDto,
  UpdateSystemConfigDto,
  UpsertThresholdDto,
} from './dto/config-threshold.dto.js';

@Injectable()
export class ConfigThresholdService {
  constructor(private readonly procedureService: ProcedureService) {}

  private handleSqlError(err: any): never {
    const msg: string = err?.message || '';
    const number: number = err?.number || 0;

    if (number === 50409 || msg.includes('[50409]')) {
      const [rawText, jsonPart] = msg.replace(/^\[50409\]\s*/, '').split('||CONFLICTS_JSON||');
      let conflictingPairs: any[] = [];
      if (jsonPart) {
        try {
          conflictingPairs = JSON.parse(jsonPart);
        } catch {
          conflictingPairs = [];
        }
      }
      throw new BadRequestException({
        error: 'THRESHOLD_CONFLICT_BR12B',
        message:
          rawText?.trim() ||
          'Không thể cập nhật cấu hình chung do gây xung đột thứ tự ngưỡng với các cặp đã ghi đè riêng (BR-12b).',
        details: conflictingPairs,
      });
    }

    const cleanMsg = msg.replace(/^\[50\d{3}\]\s*/, '');

    if (number === 50404 || msg.includes('[50404]')) {
      throw new NotFoundException(cleanMsg || 'Không tìm thấy bản ghi yêu cầu.');
    }
    if (number === 50400 || msg.includes('[50400]')) {
      throw new BadRequestException(cleanMsg || 'Dữ liệu đầu vào không hợp lệ.');
    }
    throw err;
  }

  private mapSystemConfig(r: any) {
    return {
      configId: Number(r.ConfigID),
      standardMonthDays: Number(r.StandardMonthDays),
      criticalDays: Number(r.CriticalDays),
      warningDays: Number(r.WarningDays),
      overstockDays: Number(r.OverstockDays),
      overstockDaysLowUsage: Number(r.OverstockDaysLowUsage),
      lowUsageKgPerMonth: Number(r.LowUsageKgPerMonth),
      minActiveDays: Number(r.MinActiveDays),
      actualWindowDays: Number(r.ActualWindowDays),
      poLateMonths: Number(r.PoLateMonths),
      poAgeReference: r.PoAgeReference as 'SNAPSHOT' | 'TODAY',
      deliveryDays: Number(r.DeliveryDays),
      bulkDeliveryKg: Number(r.BulkDeliveryKg),
      unusedStockDays: Number(r.UnusedStockDays),
      reorderCoverDays: Number(r.ReorderCoverDays),
      usageDeviationPct: Number(r.UsageDeviationPct),
      staleDataDays: Number(r.StaleDataDays),
      updatedAt: r.UpdatedAt ? new Date(r.UpdatedAt).toISOString() : null,
      updatedBy: r.UpdatedBy,
    };
  }

  private mapThresholdRow(r: any) {
    return {
      thresholdId: Number(r.ThresholdID),
      factoryId: Number(r.FactoryID),
      factoryCode: r.FactoryCode,
      factoryName: r.FactoryName,
      materialId: Number(r.MaterialID),
      materialCode: r.MaterialCode,
      materialName: r.MaterialName,
      category: r.Category ?? null,
      itemGroup: r.ItemGroup ?? null,
      bagKg: r.BagKg != null ? Number(r.BagKg) : null,
      warningDays: r.WarningDays != null ? Number(r.WarningDays) : null,
      overstockDays: r.OverstockDays != null ? Number(r.OverstockDays) : null,
      safetyDays: r.SafetyDays != null ? Number(r.SafetyDays) : null,
      deliveryDays: r.DeliveryDays != null ? Number(r.DeliveryDays) : null,
      deliveryQtyKg: r.DeliveryQtyKg != null ? Number(r.DeliveryQtyKg) : null,
      note: r.Note ?? null,
      effectiveThresholds: {
        criticalDays: Number(r.EffectiveCriticalDays),
        warningDays: Number(r.EffectiveWarningDays),
        overstockDays: Number(r.EffectiveOverstockDays),
      },
      updatedAt: r.UpdatedAt ? new Date(r.UpdatedAt).toISOString() : null,
      updatedBy: r.UpdatedBy,
    };
  }

  async getSystemConfig() {
    const rows = await this.procedureService.executeProcedure<any>('dbo.usp_Config_Get');
    if (!rows || rows.length === 0) {
      throw new NotFoundException('Chưa khởi tạo cấu hình hệ thống cfg_System.');
    }
    return this.mapSystemConfig(rows[0]);
  }

  async updateSystemConfig(
    userId: number,
    username: string,
    dto: UpdateSystemConfigDto,
    ipAddress: string,
  ) {
    try {
      const rows = await this.procedureService.executeProcedure<any>('dbo.usp_Config_Update', {
        UserID: userId,
        Username: username,
        StandardMonthDays: dto.standardMonthDays,
        CriticalDays: dto.criticalDays,
        WarningDays: dto.warningDays,
        OverstockDays: dto.overstockDays,
        OverstockDaysLowUsage: dto.overstockDaysLowUsage,
        LowUsageKgPerMonth: dto.lowUsageKgPerMonth,
        MinActiveDays: dto.minActiveDays,
        ActualWindowDays: dto.actualWindowDays ?? 14,
        PoLateMonths: dto.poLateMonths,
        PoAgeReference: dto.poAgeReference,
        DeliveryDays: dto.deliveryDays,
        BulkDeliveryKg: dto.bulkDeliveryKg,
        UnusedStockDays: dto.unusedStockDays,
        ReorderCoverDays: dto.reorderCoverDays,
        UsageDeviationPct: dto.usageDeviationPct,
        StaleDataDays: dto.staleDataDays,
        IPAddress: ipAddress || null,
      });

      return this.mapSystemConfig(rows[0]);
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  async listThresholds(query: ThresholdQueryDto) {
    const page = query.page && query.page > 0 ? Number(query.page) : 1;
    const isAll = String(query.pageSize).toLowerCase() === 'all';
    const numericPageSize = isAll ? 0 : Number(query.pageSize) || 20;

    try {
      const rows = await this.procedureService.executeProcedure<any>('dbo.usp_Threshold_List', {
        Search: query.search?.trim() || null,
        FactoryID: query.factoryId ?? null,
        MaterialID: query.materialId ?? null,
        Page: page,
        PageSize: numericPageSize,
        SortBy: query.sortBy || 'UpdatedAt',
        SortOrder: query.sortOrder || 'DESC',
      });

      const totalItems = rows.length > 0 ? Number(rows[0].TotalCount) : 0;
      const effectivePageSize = isAll ? totalItems || 1 : numericPageSize;
      const totalPages =
        totalItems === 0 ? 0 : isAll ? 1 : Math.ceil(totalItems / effectivePageSize);

      return {
        items: rows.map((r: any) => this.mapThresholdRow(r)),
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

  async upsertThreshold(
    userId: number,
    username: string,
    dto: UpsertThresholdDto,
    ipAddress: string,
  ) {
    try {
      const rows = await this.procedureService.executeProcedure<any>('dbo.usp_Threshold_Upsert', {
        UserID: userId,
        Username: username,
        FactoryID: dto.factoryId,
        MaterialID: dto.materialId,
        WarningDays: dto.warningDays ?? null,
        OverstockDays: dto.overstockDays ?? null,
        SafetyDays: dto.safetyDays ?? null,
        DeliveryDays: dto.deliveryDays ?? null,
        DeliveryQtyKg: dto.deliveryQtyKg ?? null,
        Note: dto.note?.trim() || null,
        IPAddress: ipAddress || null,
      });

      return this.mapThresholdRow(rows[0]);
    } catch (err) {
      this.handleSqlError(err);
    }
  }

  async deleteThreshold(userId: number, username: string, thresholdId: number, ipAddress: string) {
    try {
      const rows = await this.procedureService.executeProcedure<any>('dbo.usp_Threshold_Delete', {
        UserID: userId,
        Username: username,
        ThresholdID: thresholdId,
        IPAddress: ipAddress || null,
      });

      if (!rows || rows.length === 0) {
        throw new NotFoundException('Bản ghi ngưỡng ghi đè không tồn tại.');
      }

      return {
        thresholdId: Number(rows[0].ThresholdID),
        factoryId: Number(rows[0].FactoryID),
        materialId: Number(rows[0].MaterialID),
        deleted: Boolean(rows[0].Deleted),
      };
    } catch (err) {
      this.handleSqlError(err);
    }
  }
}
