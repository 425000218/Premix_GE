import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProcedureService } from '../../database/procedure.service.js';
import {
  CalculatedPositionResult,
  PositionFlagCode,
  SystemPositionConfig,
  WarningLevel,
  calculatePosition,
  diffDaysIso,
} from './domain/position-calculator.js';
import { PairDetailQueryDto } from './dto/pair-detail-query.dto.js';
import { PositionQueryDto } from './dto/position-query.dto.js';
import {
  CreateDemandOverrideDto,
  FlagsQueryDto,
  RemoveDemandOverrideDto,
} from './dto/demand-override.dto.js';
import { calculate28DayProjection } from './domain/projection-engine.js';
import { ProjectionQueryDto } from './dto/projection.dto.js';

const LEVEL_PRIORITY: Record<WarningLevel, number> = {
  CRITICAL: 1,
  WARNING: 2,
  OVERSTOCK: 3,
  BALANCED: 4,
  NO_DEMAND: 5,
};

@Injectable()
export class PositionsService {
  constructor(private readonly procedureService: ProcedureService) {}

  private toIsoDate(val: unknown): string | null {
    if (!val) return null;
    if (val instanceof Date) {
      return val.toISOString().slice(0, 10);
    }
    const str = String(val);
    return str.length >= 10 ? str.slice(0, 10) : str;
  }

  /**
   * Lấy danh sách các ngày chốt (SnapshotDate) đã có dữ liệu tồn kho
   */
  async getSnapshotDates() {
    const sets = await this.procedureService.executeMultiSetProcedure(
      'dbo.usp_Position_GetSnapshotDates',
      {},
    );

    const rawDates = sets[0] || [];
    const metaRow = (sets[1] && sets[1][0]) || {};

    const items = rawDates.map((r: any) => ({
      snapshotDate: this.toIsoDate(r.snapshotDate),
      cutoffDate: this.toIsoDate(r.cutoffDate),
      pairCount: Number(r.pairCount || 0),
      totalSohKg: Number(r.totalSohKg || 0),
      latestBatchId: r.latestBatchId ? Number(r.latestBatchId) : null,
      importedAt: r.importedAt,
      importedBy: r.importedBy,
      ageDays: Number(r.ageDays || 0),
      isStale: Boolean(r.isStale),
    }));

    const latestSnapshotDate = this.toIsoDate(metaRow.latestSnapshotDate);
    const currentDateVn = this.toIsoDate(metaRow.currentDateVn);
    const staleDataDays = Number(metaRow.staleDataDays ?? 2);
    const staleDays =
      latestSnapshotDate && currentDateVn
        ? diffDaysIso(latestSnapshotDate, currentDateVn)
        : 0;

    return {
      items,
      meta: {
        currentDateVn,
        latestSnapshotDate,
        staleDataDays,
        staleDays,
        isStaleData: latestSnapshotDate ? staleDays > staleDataDays : false,
      },
    };
  }

  /**
   * Nạp toàn bộ dữ liệu thô tại ngày chốt C và chạy Domain Engine calculatePosition
   */
  async loadSnapshotData(
    snapshotDate?: string,
    userId?: number,
    factoryId?: number,
  ) {
    let sets: any[][];
    try {
      sets = await this.procedureService.executeMultiSetProcedure(
        'dbo.usp_Position_LoadSnapshot',
        {
          SnapshotDate: snapshotDate || null,
          UserID: userId || null,
          FactoryID: factoryId || null,
        },
      );
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('50403') || msg.includes('không có quyền')) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập dữ liệu của nhà máy này.',
        );
      }
      throw new BadRequestException(
        `Lỗi khi tải dữ liệu vị thế tồn kho: ${msg}`,
      );
    }

    const cfgRow = (sets[0] && sets[0][0]) || {};
    const thresholdRows = sets[1] || [];
    const trackedPairs = sets[2] || [];
    const sohRows = sets[3] || [];
    const blockRows = sets[4] || [];
    const movRows = sets[5] || [];
    const forecastRows = sets[6] || [];
    const overrideRows = sets[7] || [];
    const poRows = sets[8] || [];
    const toRows = sets[9] || [];
    const issueRows = sets[10] || [];

    const resolvedSnapshotDate =
      this.toIsoDate(cfgRow.resolvedSnapshotDate) ||
      snapshotDate ||
      new Date().toISOString().slice(0, 10);
    const latestSnapshotDate =
      this.toIsoDate(cfgRow.latestSnapshotDate) || resolvedSnapshotDate;
    const todayVn =
      this.toIsoDate(cfgRow.todayVn) || new Date().toISOString().slice(0, 10);
    const hasPoPendingInSnapshot = Boolean(cfgRow.hasPoPendingInSnapshot);

    const systemConfig: SystemPositionConfig = {
      standardMonthDays: Number(cfgRow.StandardMonthDays ?? 28),
      criticalDays: Number(cfgRow.CriticalDays ?? 7),
      warningDays: Number(cfgRow.WarningDays ?? 15),
      overstockDays: Number(cfgRow.OverstockDays ?? 75),
      overstockDaysLowUsage: Number(cfgRow.OverstockDaysLowUsage ?? 90),
      lowUsageKgPerMonth: Number(cfgRow.LowUsageKgPerMonth ?? 1000),
      minActiveDays: Number(cfgRow.MinActiveDays ?? 3),
      poLateMonths: Number(cfgRow.PoLateMonths ?? 3),
      unusedStockDays: Number(cfgRow.UnusedStockDays ?? 60),
      reorderCoverDays: Number(cfgRow.ReorderCoverDays ?? 20),
      usageDeviationPct: Number(cfgRow.UsageDeviationPct ?? 30),
      staleDataDays: Number(cfgRow.StaleDataDays ?? 2),
    };

    const keyOf = (fId: number, mId: number) => `${fId}-${mId}`;

    const thresholdMap = new Map<string, any>();
    for (const r of thresholdRows) {
      thresholdMap.set(keyOf(r.FactoryID, r.MaterialID), {
        warningDays: r.WarningDays != null ? Number(r.WarningDays) : null,
        overstockDays: r.OverstockDays != null ? Number(r.OverstockDays) : null,
        safetyDays: r.SafetyDays != null ? Number(r.SafetyDays) : null,
        deliveryDays: r.DeliveryDays != null ? Number(r.DeliveryDays) : null,
        deliveryQtyKg: r.DeliveryQtyKg != null ? Number(r.DeliveryQtyKg) : null,
        note: r.Note || null,
      });
    }

    const sohMap = new Map<string, number>();
    for (const r of sohRows) {
      sohMap.set(keyOf(r.FactoryID, r.MaterialID), Number(r.SohQtyKg || 0));
    }

    const blockMap = new Map<
      string,
      { blockedKg: number; activeBlockCount: number }
    >();
    for (const r of blockRows) {
      blockMap.set(keyOf(r.FactoryID, r.MaterialID), {
        blockedKg: Number(r.BlockedKg || 0),
        activeBlockCount: Number(r.ActiveBlockCount || 0),
      });
    }

    const movMap = new Map<
      string,
      {
        wipIssueMtdKg: number;
        activeDays: number;
        prevMonthWipIssueKg: number;
        prevMonthActiveDays: number;
        hasWipIssueInWindow: boolean;
      }
    >();
    for (const r of movRows) {
      movMap.set(keyOf(r.FactoryID, r.MaterialID), {
        wipIssueMtdKg: Number(r.WipIssueMtdKg || 0),
        activeDays: Number(r.ActiveDays || 0),
        prevMonthWipIssueKg: Number(r.PrevMonthWipIssueKg || 0),
        prevMonthActiveDays: Number(r.PrevMonthActiveDays || 0),
        hasWipIssueInWindow: Boolean(r.HasWipIssueInWindow),
      });
    }

    const forecastMap = new Map<
      string,
      { forecastKg: number; versionDate: string | Date }
    >();
    for (const r of forecastRows) {
      forecastMap.set(keyOf(r.FactoryID, r.MaterialID), {
        forecastKg: Number(r.ForecastKg || 0),
        versionDate: r.VersionDate,
      });
    }

    const overrideMap = new Map<
      string,
      {
        overrideId: number;
        overrideKg: number | null;
        effectiveDate: string | Date;
        reason: string;
      }
    >();
    for (const r of overrideRows) {
      overrideMap.set(keyOf(r.FactoryID, r.MaterialID), {
        overrideId: Number(r.OverrideID),
        overrideKg: r.OverrideKg != null ? Number(r.OverrideKg) : null,
        effectiveDate: r.EffectiveDate,
        reason: r.Reason,
      });
    }

    const poMap = new Map<
      string,
      { poPendingKg: number; poPendingCount: number; latePoCount: number }
    >();
    for (const r of poRows) {
      poMap.set(keyOf(r.FactoryID, r.MaterialID), {
        poPendingKg: Number(r.PoPendingKg || 0),
        poPendingCount: Number(r.PoPendingCount || 0),
        latePoCount: Number(r.LatePoCount || 0),
      });
    }

    const toMap = new Map<
      string,
      { transitInKg: number; transitCount: number }
    >();
    for (const r of toRows) {
      toMap.set(keyOf(r.FactoryID, r.MaterialID), {
        transitInKg: Number(r.TransitInKg || 0),
        transitCount: Number(r.TransitCount || 0),
      });
    }

    const pairNotInMasterSet = new Set<string>();
    for (const r of issueRows) {
      if (
        r.IssueType === 'PAIR_NOT_IN_MASTER' &&
        r.FactoryID != null &&
        r.MaterialID != null
      ) {
        pairNotInMasterSet.add(keyOf(r.FactoryID, r.MaterialID));
      }
    }

    const buildPairPosition = (pairRow: any): CalculatedPositionResult => {
      const fId = Number(pairRow.FactoryID ?? pairRow.factoryId);
      const mId = Number(pairRow.MaterialID ?? pairRow.materialId);
      const k = keyOf(fId, mId);

      const sohKg = sohMap.get(k) ?? 0;
      const blk = blockMap.get(k) ?? { blockedKg: 0, activeBlockCount: 0 };
      const mov = movMap.get(k) ?? {
        wipIssueMtdKg: 0,
        activeDays: 0,
        prevMonthWipIssueKg: 0,
        prevMonthActiveDays: 0,
        hasWipIssueInWindow: false,
      };
      const fc = forecastMap.get(k);
      const ov = overrideMap.get(k);
      const po = poMap.get(k) ?? {
        poPendingKg: 0,
        poPendingCount: 0,
        latePoCount: 0,
      };
      const tr = toMap.get(k) ?? { transitInKg: 0, transitCount: 0 };
      const th = thresholdMap.get(k) ?? null;

      return calculatePosition({
        snapshotDate: resolvedSnapshotDate,
        todayVn,
        latestSnapshotDate,
        hasPoPendingInSnapshot,

        factoryId: fId,
        factoryCode: pairRow.FactoryCode ?? pairRow.factoryCode,
        factoryName: pairRow.FactoryName ?? pairRow.factoryName,
        region: pairRow.Region ?? pairRow.region ?? '',

        materialId: mId,
        materialCode: pairRow.MaterialCode ?? pairRow.materialCode,
        materialName: pairRow.MaterialName ?? pairRow.materialName,
        category: pairRow.Category ?? pairRow.category,
        itemGroup: pairRow.ItemGroup ?? pairRow.itemGroup,
        packingSpec: pairRow.PackingSpec ?? pairRow.packingSpec ?? null,
        bagKg:
          (pairRow.BagKg ?? pairRow.bagKg) != null
            ? Number(pairRow.BagKg ?? pairRow.bagKg)
            : null,
        uom: pairRow.UOM ?? pairRow.uom ?? 'kg',
        pic: pairRow.PIC ?? pairRow.pic ?? null,
        displayDecimals: Number(
          pairRow.DisplayDecimals ?? pairRow.displayDecimals ?? 1,
        ),
        isTracked: Boolean(pairRow.IsTracked ?? pairRow.isTracked ?? true),

        sohKg,
        blockedKg: blk.blockedKg,
        activeBlockCount: blk.activeBlockCount,

        forecastKg: fc ? fc.forecastKg : null,
        forecastVersionDate: fc ? fc.versionDate : null,

        demandOverrideKg: ov ? ov.overrideKg : null,
        hasActiveOverride: Boolean(ov && ov.overrideKg !== null),
        overrideEffectiveDate: ov ? ov.effectiveDate : null,

        wipIssueMtdKg: mov.wipIssueMtdKg,
        activeDays: mov.activeDays,
        prevMonthWipIssueKg: mov.prevMonthWipIssueKg,
        prevMonthActiveDays: mov.prevMonthActiveDays,
        hasWipIssueInWindow: mov.hasWipIssueInWindow,

        poPendingKg: po.poPendingKg,
        poPendingCount: po.poPendingCount,
        latePoCount: po.latePoCount,

        transitInKg: tr.transitInKg,
        transitCount: tr.transitCount,

        hasPairNotInMasterIssue: pairNotInMasterSet.has(k),

        systemConfig,
        pairThreshold: th,
      });
    };

    const positions: CalculatedPositionResult[] =
      trackedPairs.map(buildPairPosition);

    const summaryCounts = {
      TOTAL: positions.length,
      CRITICAL: 0,
      WARNING: 0,
      BALANCED: 0,
      OVERSTOCK: 0,
      NO_DEMAND: 0,
    };

    for (const p of positions) {
      summaryCounts[p.warningLevel] = (summaryCounts[p.warningLevel] || 0) + 1;
    }

    const staleDays = diffDaysIso(latestSnapshotDate, todayVn);
    const isStaleData = staleDays > systemConfig.staleDataDays;

    return {
      snapshotDate: resolvedSnapshotDate,
      latestSnapshotDate,
      todayVn,
      staleDays,
      isStaleData,
      hasPoPendingInSnapshot,
      systemConfig,
      summaryCounts,
      positions,
      buildPairPosition,
      issueRows,
    };
  }

  /**
   * GET /api/v1/positions
   * Lấy bảng vị thế tồn kho có lọc, tìm kiếm, sắp xếp và phân trang
   */
  async getPositionsList(query: PositionQueryDto, userId: number) {
    const loaded = await this.loadSnapshotData(
      query.snapshotDate,
      userId,
      query.factoryId,
    );

    let filtered = loaded.positions;

    if (query.category) {
      const catLower = query.category.trim().toLowerCase();
      filtered = filtered.filter(
        (p) => (p.category || '').toLowerCase() === catLower,
      );
    }

    if (query.itemGroup) {
      const grpLower = query.itemGroup.trim().toLowerCase();
      filtered = filtered.filter(
        (p) => (p.itemGroup || '').toLowerCase() === grpLower,
      );
    }

    if (query.level) {
      filtered = filtered.filter((p) => p.warningLevel === query.level);
    }

    if (query.flag) {
      const flagUpper = query.flag.trim().toUpperCase() as PositionFlagCode;
      filtered = filtered.filter((p) => p.flagCodes.includes(flagUpper));
    }

    if (query.search) {
      const kw = query.search.trim().toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.materialCode.toLowerCase().includes(kw) ||
          p.materialName.toLowerCase().includes(kw) ||
          p.factoryCode.toLowerCase().includes(kw) ||
          p.factoryName.toLowerCase().includes(kw),
      );
    }

    // Sắp xếp
    const sortField = (query.sort || 'level').toLowerCase();
    const isDesc = (query.order || 'ASC').toUpperCase() === 'DESC';
    const dir = isDesc ? -1 : 1;

    filtered.sort((a, b) => {
      if (sortField === 'doi') {
        if (a.doi === null && b.doi === null) return 0;
        if (a.doi === null) return 1;
        if (b.doi === null) return -1;
        return (a.doi - b.doi) * dir;
      }
      if (sortField === 'coverdoi') {
        if (a.coverDoi === null && b.coverDoi === null) return 0;
        if (a.coverDoi === null) return 1;
        if (b.coverDoi === null) return -1;
        return (a.coverDoi - b.coverDoi) * dir;
      }
      if (sortField === 'availablekg') {
        return (a.availableKg - b.availableKg) * dir;
      }
      if (sortField === 'sohkg') {
        return (a.sohKg - b.sohKg) * dir;
      }
      if (sortField === 'dailykg') {
        return (a.dailyKg - b.dailyKg) * dir;
      }
      if (sortField === 'demandmonthkg') {
        return (a.demandMonthKg - b.demandMonthKg) * dir;
      }
      if (sortField === 'materialcode') {
        return a.materialCode.localeCompare(b.materialCode) * dir;
      }
      if (sortField === 'factorycode') {
        return a.factoryCode.localeCompare(b.factoryCode) * dir;
      }

      // Mặc định: sắp xếp theo độ ưu tiên mức cảnh báo -> DOI tăng dần -> Mã NM -> Mã NL
      const pA = LEVEL_PRIORITY[a.warningLevel] ?? 99;
      const pB = LEVEL_PRIORITY[b.warningLevel] ?? 99;
      if (pA !== pB) return (pA - pB) * dir;

      if (a.doi !== null && b.doi !== null && a.doi !== b.doi) {
        return a.doi - b.doi;
      }
      const fCmp = a.factoryCode.localeCompare(b.factoryCode);
      if (fCmp !== 0) return fCmp;
      return a.materialCode.localeCompare(b.materialCode);
    });

    const totalItems = filtered.length;
    const pageSizeNum = query.parsedPageSize;
    const page = Math.max(1, Number(query.page || 1));

    let pagedItems = filtered;
    let totalPages = 1;

    if (pageSizeNum > 0) {
      totalPages = Math.max(1, Math.ceil(totalItems / pageSizeNum));
      const startIdx = (page - 1) * pageSizeNum;
      pagedItems = filtered.slice(startIdx, startIdx + pageSizeNum);
    }

    return {
      snapshotDate: loaded.snapshotDate,
      latestSnapshotDate: loaded.latestSnapshotDate,
      todayVn: loaded.todayVn,
      staleDays: loaded.staleDays,
      isStaleData: loaded.isStaleData,
      summaryCounts: loaded.summaryCounts,
      items: pagedItems,
      meta: {
        page,
        pageSize: pageSizeNum === 0 ? 'all' : pageSizeNum,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * GET /api/v1/positions/:factoryId/:materialId
   * Lấy chi tiết chuyên sâu của 1 cặp (FactoryID, MaterialID) tại ngày chốt C
   */
  async getPairDetail(
    factoryId: number,
    materialId: number,
    snapshotDate: string | undefined,
    userId: number,
  ) {
    let detailSets: any[][];
    try {
      detailSets = await this.procedureService.executeMultiSetProcedure(
        'dbo.usp_Position_GetPairDetail',
        {
          FactoryID: factoryId,
          MaterialID: materialId,
          SnapshotDate: snapshotDate || null,
          UserID: userId,
        },
      );
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('50403') || msg.includes('không có quyền')) {
        throw new ForbiddenException(
          'Bạn không có quyền xem vị thế của nhà máy này.',
        );
      }
      if (msg.includes('50404') || msg.includes('Không tìm thấy')) {
        throw new NotFoundException(
          'Không tìm thấy cặp Nhà máy - Nguyên liệu yêu cầu.',
        );
      }
      throw new BadRequestException(`Lỗi khi tải chi tiết cặp vị thế: ${msg}`);
    }

    const pairInfo = detailSets[0]?.[0];
    if (!pairInfo) {
      throw new NotFoundException(
        'Không tìm thấy cặp Nhà máy - Nguyên liệu yêu cầu.',
      );
    }

    const resolvedSnapshotDate =
      this.toIsoDate(pairInfo.snapshotDate) || snapshotDate;

    const loaded = await this.loadSnapshotData(
      resolvedSnapshotDate || undefined,
      userId,
      factoryId,
    );

    let calculatedPosition = loaded.positions.find(
      (p) => p.factoryId === factoryId && p.materialId === materialId,
    );

    if (!calculatedPosition) {
      calculatedPosition = loaded.buildPairPosition(pairInfo);
    }

    const poPendingList = (detailSets[1] || []).map((r: any) => ({
      poPendingId: Number(r.poPendingId),
      poNumber: r.poNumber,
      docType: r.docType,
      deliveryDate: this.toIsoDate(r.deliveryDate),
      vendorAccount: r.vendorAccount,
      supplierName: r.supplierName,
      leadTimeDays: Number(r.leadTimeDays ?? 7),
      orderQtyKg: Number(r.orderQtyKg || 0),
      receivedQtyKg: Number(r.receivedQtyKg || 0),
      deliverRemainderKg: Number(r.deliverRemainderKg || 0),
      lineStatus: r.lineStatus,
      ageDays: Number(r.ageDays || 0),
      isLate: Boolean(r.isLate),
    }));

    const inTransitTransfers = (detailSets[2] || []).map((r: any) => ({
      transferId: Number(r.transferId),
      transferNumber: r.transferNumber,
      fromWarehouse: r.fromWarehouse,
      fromFactoryCode: r.fromFactoryCode,
      toWarehouse: r.toWarehouse,
      toFactoryCode: r.toFactoryCode,
      transferStatus: r.transferStatus,
      shippedDate: this.toIsoDate(r.shippedDate),
      receivedDate: this.toIsoDate(r.receivedDate),
      shippedQtyKg: Number(r.shippedQtyKg || 0),
      postedQtyKg: Number(r.postedQtyKg || 0),
    }));

    const poReceipts = (detailSets[3] || []).map((r: any) => ({
      receiptId: Number(r.receiptId),
      receiptNumber: r.receiptNumber,
      poNumber: r.poNumber,
      pagNumber: r.pagNumber,
      deliveryDate: this.toIsoDate(r.deliveryDate),
      receivedQtyKg: Number(r.receivedQtyKg || 0),
      supplierCode: r.supplierCode,
      supplierName: r.supplierName,
      truckNumber: r.truckNumber,
    }));

    const activeBlocks = (detailSets[4] || []).map((r: any) => ({
      blockId: Number(r.blockId),
      blockedKg: Number(r.blockedKg || 0),
      startDate: this.toIsoDate(r.startDate),
      endDate: this.toIsoDate(r.endDate),
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));

    const movementHistory = (detailSets[5] || []).map((r: any) => ({
      snapshotDate: this.toIsoDate(r.snapshotDate),
      beginOnhandKg: Number(r.beginOnhandKg || 0),
      qtyReceiveKg: Number(r.qtyReceiveKg || 0),
      wipIssueKg: Number(r.wipIssueKg || 0),
      transferInKg: Number(r.transferInKg || 0),
      transferOutKg: Number(r.transferOutKg || 0),
      adjustKg: Number(r.adjustKg || 0),
      closedOnhandKg: Number(r.closedOnhandKg || 0),
    }));

    const demandOverrideHistory = (detailSets[6] || []).map((r: any) => ({
      overrideId: Number(r.overrideId),
      periodMonth: this.toIsoDate(r.periodMonth),
      effectiveDate: this.toIsoDate(r.effectiveDate),
      overrideKg: r.overrideKg != null ? Number(r.overrideKg) : null,
      reason: r.reason,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
    }));

    return {
      position: calculatedPosition,
      thresholdConfig: {
        overrideWarningDays:
          pairInfo.overrideWarningDays != null
            ? Number(pairInfo.overrideWarningDays)
            : null,
        overrideOverstockDays:
          pairInfo.overrideOverstockDays != null
            ? Number(pairInfo.overrideOverstockDays)
            : null,
        overrideSafetyDays:
          pairInfo.overrideSafetyDays != null
            ? Number(pairInfo.overrideSafetyDays)
            : null,
        overrideDeliveryDays:
          pairInfo.overrideDeliveryDays != null
            ? Number(pairInfo.overrideDeliveryDays)
            : null,
        overrideDeliveryQtyKg:
          pairInfo.overrideDeliveryQtyKg != null
            ? Number(pairInfo.overrideDeliveryQtyKg)
            : null,
        thresholdNote: pairInfo.thresholdNote || null,
        effectiveThresholds: calculatedPosition.effectiveThresholds,
      },
      poPendingList,
      inTransitTransfers,
      poReceipts,
      activeBlocks,
      movementHistory,
      demandOverrideHistory,
    };
  }

  /**
   * Tạo bản ghi nhu cầu tháng sửa tay mới (Append-only BR-14a, BR-05a)
   */
  async createDemandOverride(
    userId: number,
    username: string,
    factoryId: number,
    materialId: number,
    dto: CreateDemandOverrideDto,
    ip?: string,
  ) {
    let finalKg: number;
    if (dto.overrideKg !== undefined && dto.overrideKg !== null) {
      finalKg = Math.round(dto.overrideKg);
    } else if (dto.overrideTons !== undefined && dto.overrideTons !== null) {
      finalKg = Math.round(dto.overrideTons * 1000);
    } else {
      throw new BadRequestException(
        'Vui lòng nhập khối lượng overrideKg hoặc overrideTons.',
      );
    }

    try {
      const rows = await this.procedureService.executeProcedure(
        'dbo.usp_DemandOverride_Create',
        {
          FactoryID: factoryId,
          MaterialID: materialId,
          OverrideKg: finalKg,
          PeriodMonth: dto.periodMonth || null,
          EffectiveDate: dto.effectiveDate || null,
          Reason: dto.reason,
          CreatedBy: username || 'ADMIN',
          IPAddress: ip || '127.0.0.1',
        },
      );
      return rows[0];
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (
        msg.includes('50400') ||
        msg.includes('không tồn tại') ||
        msg.includes('Chỉ được phép')
      ) {
        throw new BadRequestException(msg.replace(/^\[50400\]\s*/, ''));
      }
      throw new BadRequestException(`Lỗi khi tạo số nhu cầu sửa tay: ${msg}`);
    }
  }

  /**
   * Hủy bỏ số nhu cầu sửa tay để quay về dùng Forecast (Append-only BR-14a, BR-05b)
   */
  async removeDemandOverride(
    userId: number,
    username: string,
    factoryId: number,
    materialId: number,
    dto: RemoveDemandOverrideDto,
    ip?: string,
  ) {
    try {
      const rows = await this.procedureService.executeProcedure(
        'dbo.usp_DemandOverride_Remove',
        {
          FactoryID: factoryId,
          MaterialID: materialId,
          PeriodMonth: dto.periodMonth || null,
          EffectiveDate: dto.effectiveDate || null,
          Reason: dto.reason || null,
          CreatedBy: username || 'ADMIN',
          IPAddress: ip || '127.0.0.1',
        },
      );
      return rows[0];
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('50400') || msg.includes('không tồn tại')) {
        throw new BadRequestException(msg.replace(/^\[50400\]\s*/, ''));
      }
      throw new BadRequestException(`Lỗi khi hủy số nhu cầu sửa tay: ${msg}`);
    }
  }

  /**
   * Lấy lịch sử các lần sửa tay nhu cầu tháng của 1 cặp (Append-only)
   */
  async getOverrideHistory(
    factoryId: number,
    materialId: number,
    periodMonth?: string,
    userId?: number,
  ) {
    const sets = await this.procedureService.executeProcedure(
      'dbo.usp_DemandOverride_GetHistory',
      {
        FactoryID: factoryId,
        MaterialID: materialId,
        PeriodMonth: periodMonth || null,
      },
    );
    return sets;
  }

  /**
   * Lấy danh sách và thống kê các cặp có cờ bất thường trên toàn hệ thống (BR-37..BR-40)
   */
  async getFlagsSummary(query: FlagsQueryDto, userId?: number) {
    const snapData = await this.loadSnapshotData(
      query.snapshotDate,
      userId,
      query.factoryId,
    );

    const allPositions = snapData.positions;
    const flagCounts: Record<string, number> = {
      BLOCKED_EXCEEDS_SOH: 0,
      PREV_MONTH_USAGE: 0,
      FEW_ACTIVE_DAYS: 0,
      MISSING_PO_PENDING: 0,
      PO_LATE_RECEIPT: 0,
      DEMAND_OVERRIDE: 0,
      FORECAST_NEWER_THAN_OVERRIDE: 0,
      PAIR_NOT_IN_MASTER: 0,
      UNUSED_STOCK: 0,
      REORDER_NEEDED: 0,
      USAGE_DEVIATION: 0,
      STALE_DATA: 0,
    };

    allPositions.forEach((pos) => {
      pos.flagCodes.forEach((fc) => {
        flagCounts[fc] = (flagCounts[fc] || 0) + 1;
      });
    });

    let pairsWithFlags = allPositions.filter((pos) => pos.flags.length > 0);

    if (query.flagCode) {
      pairsWithFlags = pairsWithFlags.filter((pos) =>
        pos.flagCodes.includes(query.flagCode as any),
      );
    }

    return {
      snapshotDate: snapData.snapshotDate,
      todayVn: snapData.todayVn,
      isStaleData: snapData.isStaleData,
      totalPairs: allPositions.length,
      totalPairsWithFlags: pairsWithFlags.length,
      flagCounts,
      pairs: pairsWithFlags.map((p) => ({
        factoryId: p.factoryId,
        factoryCode: p.factoryCode,
        factoryName: p.factoryName,
        materialId: p.materialId,
        materialCode: p.materialCode,
        materialName: p.materialName,
        category: p.category,
        doi: p.doi,
        doiDisplay: p.doiDisplay,
        warningLevel: p.warningLevel,
        availableKg: p.availableKg,
        availableTons: p.availableKg / 1000.0,
        demandSource: p.demandSource,
        demandMonthKg: p.demandMonthKg,
        flags: p.flags,
        flagCodes: p.flagCodes,
      })),
    };
  }

  /**
   * GET /api/v1/positions/:factoryId/:materialId/projection
   * Mô hình Dự phóng tồn kho 28 ngày (2 tầng) & Gợi ý lịch giao (BR-34, BR-36)
   */
  async get28DayProjection(
    factoryId: number,
    materialId: number,
    snapshotDate?: string,
    userId?: number,
  ) {
    let rawSets: any[][];
    try {
      rawSets = await this.procedureService.executeMultiSetProcedure(
        'dbo.usp_Position_GetProjectionData',
        {
          FactoryID: factoryId,
          MaterialID: materialId,
          SnapshotDate: snapshotDate || null,
          UserID: userId || null,
        },
      );
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('50403') || msg.includes('không có quyền')) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập dữ liệu dự phóng của nhà máy này.',
        );
      }
      if (msg.includes('50404') || msg.includes('Không tìm thấy')) {
        throw new NotFoundException(
          'Không tìm thấy cặp Nhà máy - Nguyên liệu yêu cầu.',
        );
      }
      throw new BadRequestException(`Lỗi khi tải dữ liệu dự phóng: ${msg}`);
    }

    const pairMeta = rawSets[0]?.[0];
    if (!pairMeta) {
      throw new NotFoundException(
        'Không tìm thấy cặp Nhà máy - Nguyên liệu yêu cầu.',
      );
    }

    const resolvedSnapshotDate =
      this.toIsoDate(pairMeta.snapshotDate) || snapshotDate;

    // Lấy vị thế đã tính toán của cặp để có exact availableKg và stdDailyKg
    const loaded = await this.loadSnapshotData(
      resolvedSnapshotDate || undefined,
      userId,
      factoryId,
    );

    let pos = loaded.positions.find(
      (p) => p.factoryId === factoryId && p.materialId === materialId,
    );

    if (!pos) {
      pos = loaded.buildPairPosition(pairMeta);
    }

    const existingPlans = (rawSets[1] || []).map((r: any) => ({
      planId: Number(r.planId),
      planDate: this.toIsoDate(r.planDate) || '',
      poNumber: r.poNumber,
      supplierId: r.supplierId ? Number(r.supplierId) : undefined,
      supplierName: r.supplierName,
      planQtyKg: Number(r.planQtyKg || 0),
    }));

    const transferOrders = (rawSets[2] || []).map((r: any) => ({
      transferId: Number(r.transferId),
      transferNumber: r.transferNumber,
      shippedDate: this.toIsoDate(r.shippedDate) || '',
      shippedQtyKg: Number(r.shippedQtyKg || 0),
    }));

    const openPos = (rawSets[3] || []).map((r: any) => ({
      poPendingId: Number(r.poPendingId),
      poNumber: r.poNumber,
      deliveryDate: this.toIsoDate(r.deliveryDate) || '',
      supplierId: r.supplierId ? Number(r.supplierId) : undefined,
      supplierName: r.supplierName,
      leadTimeDays: Number(r.leadTimeDays || 7),
      deliverRemainderKg: Number(r.deliverRemainderKg || 0),
    }));

    const thresholds = {
      criticalDays: Number(pairMeta.defaultCriticalDays || 7),
      warningDays: Number(
        pairMeta.overrideWarningDays ?? pairMeta.defaultWarningDays ?? 15,
      ),
      overstockDays: Number(
        pairMeta.overrideOverstockDays ?? pairMeta.defaultOverstockDays ?? 75,
      ),
      safetyDays: Number(
        pairMeta.overrideSafetyDays ??
          pairMeta.effectiveSafetyDays ??
          pairMeta.defaultCriticalDays ??
          7,
      ),
      deliveryDays: pairMeta.overrideDeliveryDays
        ? Number(pairMeta.overrideDeliveryDays)
        : Number(pairMeta.defaultDeliveryDays || 7),
      deliveryQtyKg: pairMeta.overrideDeliveryQtyKg
        ? Number(pairMeta.overrideDeliveryQtyKg)
        : undefined,
    };

    const projectionResult = calculate28DayProjection({
      snapshotDate: resolvedSnapshotDate || '2026-10-06',
      initialStockKg: pos.availableKg,
      dailyDemandKg: pos.dailyKg,
      bagKg: pairMeta.bagKg != null ? Number(pairMeta.bagKg) : null,
      category: pairMeta.category || '',
      itemGroup: pairMeta.itemGroup || '',
      thresholds,
      existingPlans,
      transferOrders,
      openPos,
    });

    return {
      factoryId,
      factoryCode: pairMeta.factoryCode,
      factoryName: pairMeta.factoryName,
      materialId,
      materialCode: pairMeta.materialCode,
      materialName: pairMeta.materialName,
      category: pairMeta.category,
      itemGroup: pairMeta.itemGroup,
      bagKg: Number(pairMeta.bagKg || 25),
      packingSpec: pairMeta.packingSpec,
      thresholds,
      currentPosition: {
        doi: pos.doi,
        warningLevel: pos.warningLevel,
        demandSource: pos.demandSource,
        availableKg: pos.availableKg,
        availableTons: pos.availableKg / 1000.0,
      },
      ...projectionResult,
    };
  }
}
