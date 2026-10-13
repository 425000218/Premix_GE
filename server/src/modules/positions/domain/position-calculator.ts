/**
 * MODULE F04a: PURE DOMAIN STOCK POSITION CALCULATION ENGINE (DEC-04)
 * Cài đặt tập trung toàn bộ công thức tính Vị thế tồn kho, Chuẩn hóa DOI 12 chữ số có nghĩa (BR-09a),
 * Phân loại 5 mức cảnh báo (BR-10, BR-11) và Nhận diện 12 cờ bất thường (BR-37..BR-40).
 * Tuyệt đối không phụ thuộc vào Database hay NestJS Framework.
 */

export type WarningLevel =
  | 'CRITICAL'
  | 'WARNING'
  | 'BALANCED'
  | 'OVERSTOCK'
  | 'NO_DEMAND';

export type PositionFlagCode =
  | 'BLOCKED_EXCEEDS_SOH'
  | 'PREV_MONTH_USAGE'
  | 'FEW_ACTIVE_DAYS'
  | 'MISSING_PO_PENDING'
  | 'PO_LATE_RECEIPT'
  | 'DEMAND_OVERRIDE'
  | 'FORECAST_NEWER_THAN_OVERRIDE'
  | 'PAIR_NOT_IN_MASTER'
  | 'UNUSED_STOCK'
  | 'REORDER_NEEDED'
  | 'USAGE_DEVIATION'
  | 'STALE_DATA';

export interface PositionFlag {
  code: PositionFlagCode;
  severity: 'WARNING' | 'INFO';
  message: string;
}

export interface SystemPositionConfig {
  standardMonthDays: number; // Mặc định 28 (BR-05)
  criticalDays: number; // Mặc định 7 (BR-10)
  warningDays: number; // Mặc định 15 (BR-10)
  overstockDays: number; // Mặc định 75 (BR-10)
  overstockDaysLowUsage: number; // Mặc định 90 (BR-10)
  lowUsageKgPerMonth: number; // Mặc định 1000 (BR-10, Q-011)
  minActiveDays: number; // Mặc định 3 (BR-06, BR-07)
  poLateMonths: number; // Mặc định 3 (BR-19c)
  unusedStockDays: number; // Mặc định 60 (BR-37)
  reorderCoverDays: number; // Mặc định 20 (BR-38)
  usageDeviationPct: number; // Mặc định 30 (BR-39)
  staleDataDays: number; // Mặc định 2 (BR-40)
}

export interface PairThresholdOverride {
  warningDays?: number | null;
  overstockDays?: number | null;
  safetyDays?: number | null;
  deliveryDays?: number | null;
  deliveryQtyKg?: number | null;
}

export interface CalculatePositionInput {
  snapshotDate: string; // YYYY-MM-DD (Ngày chốt C)
  todayVn?: string; // YYYY-MM-DD
  latestSnapshotDate?: string; // YYYY-MM-DD
  hasPoPendingInSnapshot?: boolean;

  factoryId: number;
  factoryCode: string;
  factoryName: string;
  region?: string;

  materialId: number;
  materialCode: string;
  materialName: string;
  category: string;
  itemGroup: string;
  packingSpec?: string | null;
  bagKg?: number | null;
  uom: string;
  pic?: string | null;
  displayDecimals: number;
  isTracked?: boolean;

  sohKg: number;
  blockedKg: number;
  activeBlockCount?: number;

  forecastKg: number | null;
  forecastVersionDate?: string | Date | null;

  demandOverrideKg: number | null;
  hasActiveOverride: boolean;
  overrideEffectiveDate?: string | Date | null;

  wipIssueMtdKg: number;
  activeDays: number;
  prevMonthWipIssueKg: number;
  prevMonthActiveDays: number;
  hasWipIssueInWindow?: boolean;

  poPendingKg: number;
  poPendingCount?: number;
  latePoCount?: number;

  transitInKg: number;
  transitCount?: number;

  hasPairNotInMasterIssue?: boolean;

  systemConfig: SystemPositionConfig;
  pairThreshold?: PairThresholdOverride | null;
}

export interface CalculatedPositionResult {
  snapshotDate: string;
  factoryId: number;
  factoryCode: string;
  factoryName: string;
  region: string;

  materialId: number;
  materialCode: string;
  materialName: string;
  category: string;
  itemGroup: string;
  packingSpec: string | null;
  bagKg: number | null;
  uom: string;
  pic: string | null;
  displayDecimals: number;

  sohKg: number;
  blockedKg: number;
  availableKg: number;
  transitInKg: number;
  poPendingKg: number;
  totalCoverKg: number;

  demandMonthKg: number;
  demandSource: 'OVERRIDE' | 'FORECAST' | 'NONE';
  forecastKg: number;
  demandOverrideKg: number | null;

  wipIssueMtdKg: number;
  activeDays: number;
  prevMonthWipIssueKg: number;
  prevMonthActiveDays: number;

  stdDailyKg: number;
  actualDailyKg: number;
  dailyKg: number; // Ký hiệu d

  doi: number | null; // Đã chuẩn hóa 12 chữ số có nghĩa (BR-09a)
  doiDisplay: number | null; // Làm tròn 1 chữ số thập phân phục vụ hiển thị UI
  coverDoi: number | null; // Đã chuẩn hóa 12 chữ số có nghĩa
  coverDoiDisplay: number | null;
  stockoutDate: string | null; // YYYY-MM-DD (C + floor(doi))

  warningLevel: WarningLevel;
  isLowUsageMaterial: boolean;
  effectiveThresholds: {
    criticalDays: number;
    warningDays: number;
    overstockDays: number;
    safetyDays: number;
  };

  flags: PositionFlag[];
  flagCodes: PositionFlagCode[];
}

export const DEFAULT_SYSTEM_POSITION_CONFIG: SystemPositionConfig = {
  standardMonthDays: 28,
  criticalDays: 7,
  warningDays: 15,
  overstockDays: 75,
  overstockDaysLowUsage: 90,
  lowUsageKgPerMonth: 1000,
  minActiveDays: 3,
  poLateMonths: 3,
  unusedStockDays: 60,
  reorderCoverDays: 20,
  usageDeviationPct: 30,
  staleDataDays: 2,
};

/**
 * BR-09a: Khử sai số dấu phẩy động IEEE 754 bằng cách chuẩn hóa 12 chữ số có nghĩa
 * Ví dụ: 6.999999999999999 -> 7, hoặc 7.000000000000001 -> 7
 */
export function normalizeDoi12(rawDoi: number): number {
  if (!Number.isFinite(rawDoi) || rawDoi <= 0) {
    return 0;
  }
  return Number(rawDoi.toPrecision(12));
}

/**
 * Cộng số ngày nguyên vào chuỗi ngày YYYY-MM-DD theo UTC (không lệch múi giờ)
 */
export function addDaysIso(isoDateStr: string, daysToAdd: number): string {
  const clean = isoDateStr.slice(0, 10);
  const [y, m, d] = clean.split('-').map((n) => parseInt(n, 10));
  const utcMs = Date.UTC(y, m - 1, d) + Math.floor(daysToAdd) * 86400000;
  const dt = new Date(utcMs);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Tính khoảng cách ngày (toDate - fromDate) từ 2 chuỗi YYYY-MM-DD
 */
export function diffDaysIso(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  const [y2, m2, d2] = toIso.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((ms2 - ms1) / 86400000);
}

/**
 * Hàm Domain thuần túy tính Vị thế tồn kho cho 1 cặp (Factory, Material) tại ngày chốt C
 */
export function calculatePosition(
  input: CalculatePositionInput,
): CalculatedPositionResult {
  const cfg: SystemPositionConfig = {
    ...DEFAULT_SYSTEM_POSITION_CONFIG,
    ...(input.systemConfig || {}),
  };

  const flags: PositionFlag[] = [];
  const addFlag = (
    code: PositionFlagCode,
    severity: 'WARNING' | 'INFO',
    message: string,
  ) => {
    if (!flags.some((f) => f.code === code)) {
      flags.push({ code, severity, message });
    }
  };

  // =========================================================================
  // BƯỚC 1: TÍNH TỒN KHẢ DỤNG (availableKg - BR-03, BR-04a)
  // =========================================================================
  const sohKg = Math.max(0, Number(input.sohKg ?? 0));
  const blockedKg = Math.max(0, Number(input.blockedKg ?? 0));
  const availableKg = Math.max(0, sohKg - blockedKg);

  if (blockedKg > sohKg) {
    addFlag(
      'BLOCKED_EXCEEDS_SOH',
      'WARNING',
      `Lượng tồn bị khóa (${blockedKg.toLocaleString('en-US')} kg) vượt quá tồn thực tế SOH (${sohKg.toLocaleString('en-US')} kg).`,
    );
  }

  // =========================================================================
  // BƯỚC 2: XÁC ĐỊNH NHU CẦU THÁNG ÁP DỤNG (demandMonthKg - BR-05a, BR-14)
  // =========================================================================
  const forecastKg = Math.max(0, Number(input.forecastKg ?? 0));
  let demandMonthKg = 0;
  let demandSource: 'OVERRIDE' | 'FORECAST' | 'NONE' = 'NONE';

  if (
    input.hasActiveOverride &&
    input.demandOverrideKg !== null &&
    input.demandOverrideKg !== undefined
  ) {
    demandMonthKg = Math.max(0, Number(input.demandOverrideKg));
    demandSource = 'OVERRIDE';
    addFlag(
      'DEMAND_OVERRIDE',
      'INFO',
      `Đang sử dụng nhu cầu tháng sửa tay (${demandMonthKg.toLocaleString('en-US')} kg).`,
    );

    if (input.forecastVersionDate && input.overrideEffectiveDate) {
      const forecastTs = new Date(input.forecastVersionDate).getTime();
      const overrideTs = new Date(input.overrideEffectiveDate).getTime();
      if (forecastTs > overrideTs) {
        addFlag(
          'FORECAST_NEWER_THAN_OVERRIDE',
          'WARNING',
          'Đã có bản Forecast mới nạp sau ngày áp dụng số nhu cầu sửa tay.',
        );
      }
    }
  } else if (input.forecastKg !== null && input.forecastKg !== undefined && forecastKg > 0) {
    demandMonthKg = forecastKg;
    demandSource = 'FORECAST';
  } else {
    demandMonthKg = 0;
    demandSource = 'NONE';
  }

  // =========================================================================
  // BƯỚC 3: TÍNH TIÊU HAO CHUẨN / NGÀY (stdDailyKg - BR-05)
  // =========================================================================
  const standardMonthDays = Math.max(1, Number(cfg.standardMonthDays || 28));
  const stdDailyKg = demandMonthKg / standardMonthDays;

  // =========================================================================
  // BƯỚC 4: TÍNH TIÊU HAO THỰC TẾ / NGÀY (actualDailyKg - BR-06, BR-07)
  // =========================================================================
  const minActiveDays = Math.max(1, Number(cfg.minActiveDays || 3));
  const activeDays = Math.max(0, Math.floor(Number(input.activeDays ?? 0)));
  const wipIssueMtdKg = Math.max(0, Number(input.wipIssueMtdKg ?? 0));
  const prevMonthActiveDays = Math.max(
    0,
    Math.floor(Number(input.prevMonthActiveDays ?? 0)),
  );
  const prevMonthWipIssueKg = Math.max(0, Number(input.prevMonthWipIssueKg ?? 0));

  if (activeDays >= 1 && activeDays < minActiveDays) {
    addFlag(
      'FEW_ACTIVE_DAYS',
      'INFO',
      `Số ngày chạy máy trong tháng mới có ${activeDays} ngày (< ${minActiveDays} ngày).`,
    );
  }

  let actualDailyKg = 0;
  if (activeDays >= minActiveDays) {
    // BR-06: Đủ số ngày chạy máy tối thiểu (>= 3 ngày)
    actualDailyKg = wipIssueMtdKg / activeDays;
  } else {
    // BR-07: Đầu tháng (< 3 ngày chạy máy) -> max(Nhịp tháng này, Nhịp tháng trước)
    const currentMonthPace = wipIssueMtdKg / Math.max(1, activeDays);
    const prevMonthPace =
      prevMonthActiveDays > 0 ? prevMonthWipIssueKg / prevMonthActiveDays : 0;
    actualDailyKg = Math.max(currentMonthPace, prevMonthPace);

    if (prevMonthPace > 0 && prevMonthPace >= currentMonthPace) {
      addFlag(
        'PREV_MONTH_USAGE',
        'INFO',
        `Tháng này mới chạy ${activeDays} ngày máy, đang mượn nhịp tiêu hao tháng trước (${Math.round(prevMonthPace * 10) / 10} kg/ngày).`,
      );
    }
  }

  // =========================================================================
  // BƯỚC 5: TIÊU HAO DÙNG ĐỂ CẢNH BÁO (dailyKg - Ký hiệu d - BR-08)
  // =========================================================================
  const dailyKg = Math.max(stdDailyKg, actualDailyKg);

  // =========================================================================
  // BƯỚC 6: TÍNH SỐ NGÀY TỒN KHO (doi), COVER DOI & NGÀY HẾT HÀNG (BR-09, BR-09a, BR-11)
  // =========================================================================
  const transitInKg = Math.max(0, Number(input.transitInKg ?? 0));
  const poPendingKg = Math.max(0, Number(input.poPendingKg ?? 0));
  const totalCoverKg = availableKg + transitInKg + poPendingKg;

  let doi: number | null = null;
  let doiDisplay: number | null = null;
  let coverDoi: number | null = null;
  let coverDoiDisplay: number | null = null;
  let stockoutDate: string | null = null;

  if (dailyKg > 0) {
    doi = normalizeDoi12(availableKg / dailyKg);
    doiDisplay = Math.round(doi * 10) / 10;

    coverDoi = normalizeDoi12(totalCoverKg / dailyKg);
    coverDoiDisplay = Math.round(coverDoi * 10) / 10;

    const wholeDays = Math.floor(doi);
    stockoutDate = addDaysIso(input.snapshotDate, wholeDays);
  }

  // =========================================================================
  // BƯỚC 7: PHÂN LOẠI MỨC CẢNH BÁO (warningLevel - BR-10, BR-11, Q-011)
  // =========================================================================
  const criticalDaysEff = Number(cfg.criticalDays ?? 7);
  const warningDaysEff =
    input.pairThreshold?.warningDays != null
      ? Number(input.pairThreshold.warningDays)
      : Number(cfg.warningDays ?? 15);
  const safetyDaysEff =
    input.pairThreshold?.safetyDays != null
      ? Number(input.pairThreshold.safetyDays)
      : criticalDaysEff;

  // Tiêu chí xét nguyên liệu dùng ít: Cơ sở tiêu hao = max(demandMonthKg, actualDailyKg * 28) <= LowUsageKgPerMonth (1.000 kg)
  const usageBasisKg = Math.max(
    demandMonthKg,
    actualDailyKg * standardMonthDays,
  );
  const lowUsageThresholdKg = Number(cfg.lowUsageKgPerMonth ?? 1000);
  const isLowUsageMaterial =
    usageBasisKg > 0 && usageBasisKg <= lowUsageThresholdKg;

  // Nếu cặp có cấu hình ghi đè OverstockDays riêng thì giá trị ghi đè thắng ngưỡng dùng ít
  const overstockDaysEff =
    input.pairThreshold?.overstockDays != null
      ? Number(input.pairThreshold.overstockDays)
      : isLowUsageMaterial
        ? Number(cfg.overstockDaysLowUsage ?? 90)
        : Number(cfg.overstockDays ?? 75);

  let warningLevel: WarningLevel;
  if (dailyKg <= 0 || doi === null) {
    warningLevel = 'NO_DEMAND';
  } else if (availableKg === 0 || doi < criticalDaysEff) {
    warningLevel = 'CRITICAL';
  } else if (doi < warningDaysEff) {
    warningLevel = 'WARNING';
  } else if (doi > overstockDaysEff) {
    warningLevel = 'OVERSTOCK';
  } else {
    warningLevel = 'BALANCED';
  }

  // =========================================================================
  // BƯỚC 8: TÍNH TOÁN CÁC CỜ BẤT THƯỜNG MỞ RỘNG (Flags - Mục 3.4)
  // =========================================================================
  if (input.hasPoPendingInSnapshot === false) {
    addFlag(
      'MISSING_PO_PENDING',
      'WARNING',
      `Ngày chốt ${input.snapshotDate} chưa có dữ liệu PO Pending.`,
    );
  }

  if ((input.latePoCount ?? 0) > 0) {
    addFlag(
      'PO_LATE_RECEIPT',
      'WARNING',
      `Tồn tại ${input.latePoCount} dòng PO Pending có tuổi >= ${cfg.poLateMonths} tháng chưa nhận hết hàng (BR-19c).`,
    );
  }

  if (input.isTracked === false || input.hasPairNotInMasterIssue === true) {
    addFlag(
      'PAIR_NOT_IN_MASTER',
      'WARNING',
      'Cặp Nhà máy - Nguyên liệu phát sinh giao dịch nhưng không nằm trong danh sách theo dõi chuẩn.',
    );
  }

  if (sohKg > 0 && input.hasWipIssueInWindow === false) {
    addFlag(
      'UNUSED_STOCK',
      'WARNING',
      `Có tồn kho (${sohKg.toLocaleString('en-US')} kg) nhưng không phát sinh xuất sản xuất trong ${cfg.unusedStockDays} ngày qua (BR-37).`,
    );
  }

  if (
    dailyKg > 0 &&
    coverDoi !== null &&
    coverDoi < Number(cfg.reorderCoverDays ?? 20)
  ) {
    addFlag(
      'REORDER_NEEDED',
      'WARNING',
      `Số ngày được bảo vệ (Cover DOI = ${coverDoiDisplay} ngày) thấp hơn ngưỡng cần đặt hàng (${cfg.reorderCoverDays} ngày - BR-38).`,
    );
  }

  if (stdDailyKg > 0 && actualDailyKg > 0) {
    const deviationPct = ((actualDailyKg - stdDailyKg) / stdDailyKg) * 100;
    const thresholdPct = Number(cfg.usageDeviationPct ?? 30);
    if (Math.abs(deviationPct) > thresholdPct) {
      const dir = deviationPct > 0 ? 'Tăng' : 'Giảm';
      const roundedPct = Math.round(Math.abs(deviationPct) * 10) / 10;
      addFlag(
        'USAGE_DEVIATION',
        'WARNING',
        `Tiêu hao thực tế lệch ${dir} ${roundedPct}% so với định mức chuẩn (> ${thresholdPct}% - BR-39).`,
      );
    }
  }

  if (input.todayVn && input.latestSnapshotDate) {
    const staleDays = diffDaysIso(input.latestSnapshotDate, input.todayVn);
    if (staleDays > Number(cfg.staleDataDays ?? 2)) {
      addFlag(
        'STALE_DATA',
        'WARNING',
        `Dữ liệu ngày chốt mới nhất (${input.latestSnapshotDate}) đã cũ ${staleDays} ngày so với hiện tại (BR-40).`,
      );
    }
  }

  return {
    snapshotDate: input.snapshotDate.slice(0, 10),
    factoryId: input.factoryId,
    factoryCode: input.factoryCode,
    factoryName: input.factoryName,
    region: input.region || '',

    materialId: input.materialId,
    materialCode: input.materialCode,
    materialName: input.materialName,
    category: input.category,
    itemGroup: input.itemGroup,
    packingSpec: input.packingSpec ?? null,
    bagKg: input.bagKg != null ? Number(input.bagKg) : null,
    uom: input.uom || 'kg',
    pic: input.pic ?? null,
    displayDecimals: Number(input.displayDecimals ?? 1),

    sohKg,
    blockedKg,
    availableKg,
    transitInKg,
    poPendingKg,
    totalCoverKg,

    demandMonthKg,
    demandSource,
    forecastKg,
    demandOverrideKg:
      input.hasActiveOverride && input.demandOverrideKg != null
        ? Number(input.demandOverrideKg)
        : null,

    wipIssueMtdKg,
    activeDays,
    prevMonthWipIssueKg,
    prevMonthActiveDays,

    stdDailyKg: Number(stdDailyKg.toPrecision(12)),
    actualDailyKg: Number(actualDailyKg.toPrecision(12)),
    dailyKg: Number(dailyKg.toPrecision(12)),

    doi,
    doiDisplay,
    coverDoi,
    coverDoiDisplay,
    stockoutDate,

    warningLevel,
    isLowUsageMaterial,
    effectiveThresholds: {
      criticalDays: criticalDaysEff,
      warningDays: warningDaysEff,
      overstockDays: overstockDaysEff,
      safetyDays: safetyDaysEff,
    },

    flags,
    flagCodes: flags.map((f) => f.code),
  };
}
