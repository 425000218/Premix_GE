import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ProcedureService } from '../../database/procedure.service.js';
import {
  CalculatedPositionResult,
  WarningLevel,
} from '../positions/domain/position-calculator.js';
import { PositionsService } from '../positions/positions.service.js';
import { DashboardQueryDto } from './dto/dashboard-query.dto.js';

// Thứ tự ưu tiên dòng nguyên liệu trên Ma trận nhiệt (Mục 3.2 F05: CRITICAL -> WARNING -> BALANCED -> OVERSTOCK -> NO_DEMAND)
const MATRIX_ROW_SEVERITY: Record<WarningLevel, number> = {
  CRITICAL: 1,
  WARNING: 2,
  BALANCED: 3,
  OVERSTOCK: 4,
  NO_DEMAND: 5,
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly procedureService: ProcedureService,
    private readonly positionsService: PositionsService,
  ) {}

  private filterPositions(
    positions: CalculatedPositionResult[],
    query: DashboardQueryDto,
  ): CalculatedPositionResult[] {
    let list = positions;

    if (query.category) {
      const cat = query.category.trim().toLowerCase();
      list = list.filter((p) => (p.category || '').toLowerCase() === cat);
    }

    if (query.itemGroup) {
      const grp = query.itemGroup.trim().toLowerCase();
      list = list.filter((p) => (p.itemGroup || '').toLowerCase() === grp);
    }

    if (query.search) {
      const kw = query.search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.materialCode.toLowerCase().includes(kw) ||
          p.materialName.toLowerCase().includes(kw) ||
          p.factoryCode.toLowerCase().includes(kw) ||
          p.factoryName.toLowerCase().includes(kw),
      );
    }

    return list;
  }

  private async loadDashboardContext(
    snapshotDate?: string,
    userId?: number,
    factoryId?: number,
  ) {
    try {
      const sets = await this.procedureService.executeMultiSetProcedure(
        'dbo.usp_Dashboard_GetContextInfo',
        {
          SnapshotDate: snapshotDate || null,
          UserID: userId || null,
          FactoryID: factoryId || null,
        },
      );
      return {
        lastImportRow: sets[0]?.[0] || null,
        factories: sets[1] || [],
        materials: sets[2] || [],
      };
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('50403') || msg.includes('không có quyền')) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập dữ liệu của nhà máy này.',
        );
      }
      throw new BadRequestException(`Lỗi khi tải dữ liệu Dashboard: ${msg}`);
    }
  }

  private formatVnDate(isoDate: string): string {
    const clean = (isoDate || '').slice(0, 10);
    const parts = clean.split('-');
    if (parts.length !== 3) return clean;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  /**
   * GET /api/v1/dashboard/summary
   * Tổng hợp các chỉ số Dashboard kế thừa 100% từ kết quả tính toán của Module F04 (DEC-04)
   */
  async getSummary(query: DashboardQueryDto, userId: number) {
    const [loaded, ctx] = await Promise.all([
      this.positionsService.loadSnapshotData(
        query.snapshotDate,
        userId,
        query.factoryId,
      ),
      this.loadDashboardContext(query.snapshotDate, userId, query.factoryId),
    ]);

    const filtered = this.filterPositions(loaded.positions, query);

    const levelCounts = {
      critical: 0,
      warning: 0,
      balanced: 0,
      overstock: 0,
      noDemand: 0,
      total: filtered.length,
    };

    let blockedPairCount = 0;
    let totalBlockedKg = 0;

    const flagCounts = {
      poLateReceipt: 0,
      reorderNeeded: 0,
      usageDeviation: 0,
      unusedStock: 0,
      blockedExceedsSoh: 0,
      forecastNewerThanOverride: 0,
      totalWithWarningFlags: 0,
    };

    for (const p of filtered) {
      if (p.warningLevel === 'CRITICAL') levelCounts.critical++;
      else if (p.warningLevel === 'WARNING') levelCounts.warning++;
      else if (p.warningLevel === 'BALANCED') levelCounts.balanced++;
      else if (p.warningLevel === 'OVERSTOCK') levelCounts.overstock++;
      else if (p.warningLevel === 'NO_DEMAND') levelCounts.noDemand++;

      if (p.blockedKg > 0) {
        blockedPairCount++;
        totalBlockedKg += p.blockedKg;
      }

      if (p.flagCodes.includes('PO_LATE_RECEIPT')) flagCounts.poLateReceipt++;
      if (p.flagCodes.includes('REORDER_NEEDED')) flagCounts.reorderNeeded++;
      if (p.flagCodes.includes('USAGE_DEVIATION')) flagCounts.usageDeviation++;
      if (p.flagCodes.includes('UNUSED_STOCK')) flagCounts.unusedStock++;
      if (p.flagCodes.includes('BLOCKED_EXCEEDS_SOH')) {
        flagCounts.blockedExceedsSoh++;
      }
      if (p.flagCodes.includes('FORECAST_NEWER_THAN_OVERRIDE')) {
        flagCounts.forecastNewerThanOverride++;
      }

      if (p.flagCodes.some((c) => c !== 'DEMAND_OVERRIDE')) {
        flagCounts.totalWithWarningFlags++;
      }
    }

    const lastImport = ctx.lastImportRow
      ? {
          batchId: Number(ctx.lastImportRow.batchId),
          batchType: ctx.lastImportRow.batchType,
          snapshotDate: ctx.lastImportRow.snapshotDate,
          cutoffDate: ctx.lastImportRow.cutoffDate,
          originalFileName: ctx.lastImportRow.originalFileName,
          importedAt: ctx.lastImportRow.importedAt,
          importedBy: ctx.lastImportRow.importedBy,
        }
      : null;

    const isStale = loaded.isStaleData;
    const staleAlertMessage = isStale
      ? `Dữ liệu đang xem là số liệu chốt ngày ${this.formatVnDate(loaded.snapshotDate)}, đã cũ hơn ${loaded.systemConfig.staleDataDays} ngày. Hãy nạp bộ file mới từ D365.`
      : null;

    return {
      snapshotDate: loaded.snapshotDate,
      latestSnapshotDate: loaded.latestSnapshotDate,
      todayVn: loaded.todayVn,
      staleDays: loaded.staleDays,
      isStale,
      staleAlertMessage,
      isEmptyState: !lastImport && loaded.positions.length === 0,
      lastImport,
      levelCounts,
      blockedStock: {
        pairCount: blockedPairCount,
        totalKg: totalBlockedKg,
        totalTons: Math.round((totalBlockedKg / 1000) * 100) / 100,
      },
      flagCounts,
    };
  }

  /**
   * GET /api/v1/dashboard/matrix
   * Xây dựng cấu trúc Ma trận nhiệt (Heatmap Matrix: Dòng = Nguyên liệu, Cột = Nhà máy)
   */
  async getMatrix(query: DashboardQueryDto, userId: number) {
    const [loaded, ctx] = await Promise.all([
      this.positionsService.loadSnapshotData(
        query.snapshotDate,
        userId,
        query.factoryId,
      ),
      this.loadDashboardContext(query.snapshotDate, userId, query.factoryId),
    ]);

    const columns = ctx.factories.map((f: any) => ({
      factoryId: Number(f.factoryId),
      factoryCode: f.factoryCode,
      factoryName: f.factoryName,
      region: f.region,
    }));

    let materials = ctx.materials.map((m: any) => ({
      materialId: Number(m.materialId),
      materialCode: m.materialCode,
      materialName: m.materialName,
      category: m.category,
      itemGroup: m.itemGroup,
      packingSpec: m.packingSpec ?? null,
      bagKg: m.bagKg != null ? Number(m.bagKg) : null,
      uom: m.uom || 'kg',
      pic: m.pic ?? null,
      displayDecimals: Number(m.displayDecimals ?? 1),
    }));

    if (query.category) {
      const cat = query.category.trim().toLowerCase();
      materials = materials.filter(
        (m) => (m.category || '').toLowerCase() === cat,
      );
    }

    if (query.itemGroup) {
      const grp = query.itemGroup.trim().toLowerCase();
      materials = materials.filter(
        (m) => (m.itemGroup || '').toLowerCase() === grp,
      );
    }

    if (query.search) {
      const kw = query.search.trim().toLowerCase();
      materials = materials.filter(
        (m) =>
          m.materialCode.toLowerCase().includes(kw) ||
          m.materialName.toLowerCase().includes(kw),
      );
    }

    const posMap = new Map<string, CalculatedPositionResult>();
    for (const p of loaded.positions) {
      posMap.set(`${p.factoryId}-${p.materialId}`, p);
    }

    const rows = materials.map((mat) => {
      let worstSeverity = 99;
      let minDoi: number | null = null;
      let trackedCount = 0;

      const cells = columns.map((col) => {
        const pos = posMap.get(`${col.factoryId}-${mat.materialId}`);
        if (!pos) {
          return {
            factoryId: col.factoryId,
            factoryCode: col.factoryCode,
            materialId: mat.materialId,
            materialCode: mat.materialCode,
            isTracked: false,
            warningLevel: null,
            doi: null,
            doiDisplay: null,
            availableKg: null,
            dailyKg: null,
            stockoutDate: null,
            hasWarningDot: false,
            flagCodes: [],
          };
        }

        trackedCount++;
        const sev = MATRIX_ROW_SEVERITY[pos.warningLevel] ?? 99;
        if (sev < worstSeverity) {
          worstSeverity = sev;
        }
        if (pos.doi !== null && (minDoi === null || pos.doi < minDoi)) {
          minDoi = pos.doi;
        }

        // Mục 3.2 F05: Dấu chấm vàng cảnh báo hiển thị nếu có cờ bất thường (ngoại trừ cờ thông tin DEMAND_OVERRIDE)
        const hasWarningDot = pos.flagCodes.some(
          (code) => code !== 'DEMAND_OVERRIDE',
        );

        return {
          factoryId: col.factoryId,
          factoryCode: col.factoryCode,
          materialId: mat.materialId,
          materialCode: mat.materialCode,
          isTracked: true,
          warningLevel: pos.warningLevel,
          doi: pos.doi,
          doiDisplay: pos.doiDisplay,
          coverDoi: pos.coverDoi,
          coverDoiDisplay: pos.coverDoiDisplay,
          sohKg: pos.sohKg,
          blockedKg: pos.blockedKg,
          availableKg: pos.availableKg,
          dailyKg: pos.dailyKg,
          stockoutDate: pos.stockoutDate,
          hasWarningDot,
          flagCodes: pos.flagCodes,
        };
      });

      return {
        ...mat,
        trackedCount,
        worstSeverity,
        minDoi,
        cells,
      };
    });

    // Sắp xếp dòng: Nguyên liệu có mức cảnh báo nghiêm trọng nhất lên đầu bảng (CRITICAL -> WARNING -> BALANCED -> OVERSTOCK -> NO_DEMAND)
    rows.sort((a, b) => {
      if (a.worstSeverity !== b.worstSeverity) {
        return a.worstSeverity - b.worstSeverity;
      }
      if (a.minDoi !== null && b.minDoi !== null && a.minDoi !== b.minDoi) {
        return a.minDoi - b.minDoi;
      }
      return a.materialCode.localeCompare(b.materialCode);
    });

    return {
      snapshotDate: loaded.snapshotDate,
      latestSnapshotDate: loaded.latestSnapshotDate,
      isStale: loaded.isStaleData,
      columns,
      rows,
      meta: {
        columnCount: columns.length,
        rowCount: rows.length,
        trackedCellCount: rows.reduce((acc, r) => acc + r.trackedCount, 0),
      },
    };
  }
}
