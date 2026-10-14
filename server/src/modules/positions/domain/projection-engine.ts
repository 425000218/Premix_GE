/**
 * PURE DOMAIN ENGINE: 28-DAY INVENTORY PROJECTION & DELIVERY SUGGESTIONS (BR-34, BR-36)
 * File: server/src/modules/positions/domain/projection-engine.ts
 * Clean Architecture Domain Layer - No DB or Framework dependencies.
 */

import {
  suggestDeliveriesForPair,
  addDaysIso,
  diffDaysIso,
  getDayOfWeekIso,
  DeliverySuggestionLine,
  MilestoneResult,
} from '../../delivery-plans/domain/suggest-deliveries.js';

export interface ProjectionThresholds {
  criticalDays: number;
  warningDays: number;
  overstockDays: number;
  safetyDays: number;
  deliveryDays?: number;
  deliveryQtyKg?: number;
}

export interface ExistingPlanItem {
  planId?: number;
  planDate: string; // YYYY-MM-DD
  poNumber?: string | null;
  supplierId?: number;
  supplierName?: string;
  planQtyKg: number;
}

export interface TransferOrderItem {
  transferId?: number;
  transferNumber?: string;
  shippedDate: string;
  shippedQtyKg: number;
}

export interface OpenPoPendingItem {
  poPendingId?: number;
  poNumber: string;
  deliveryDate: string;
  supplierId?: number;
  supplierCode?: string;
  supplierName?: string;
  leadTimeDays: number;
  deliverRemainderKg: number;
}

export interface ProjectionEngineInput {
  snapshotDate: string; // YYYY-MM-DD (Ngày chốt C)
  initialStockKg: number; // SOH khả dụng tại C (availableKg)
  dailyDemandKg: number; // Tiêu hao ngày d = MAX(StandardUsage, ActualConsumptionRate) theo BR-08
  bagKg: number | null; // Quy cách bao
  category?: string;
  itemGroup?: string;
  thresholds: ProjectionThresholds;
  existingPlans: ExistingPlanItem[];
  transferOrders: TransferOrderItem[]; // TO đang đi đường (cộng vào C+1 theo BR-34)
  openPos: OpenPoPendingItem[]; // PO Pending còn lượng dư tại C (nguồn FIFO)
}

export interface DayTierMetric {
  inboundKg: number;
  inboundTons: number;
  closingStockKg: number;
  closingStockTons: number;
  doi: number | null;
  warningLevel: 'CRITICAL' | 'WARNING' | 'BALANCED' | 'OVERSTOCK' | 'NO_DEMAND';
}

export interface ProjectionDay {
  dayIndex: number; // 1 .. 28
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 0 = Chủ Nhật, 1 = Thứ Hai, ..., 6 = Thứ Bảy
  dayName: string; // Thứ Hai, Thứ Ba, ..., Chủ Nhật
  isSunday: boolean;
  dailyDemandKg: number;
  tier1: DayTierMetric; // Đã lên lịch (Scheduled)
  tier2: DayTierMetric; // Đề xuất tự động (Suggested)
}

export interface ProjectionMilestones {
  tier1StockoutDate: string | null; // Mốc Hết hàng Tầng 1 (tồn < 0)
  tier1DeliveryRequiredDate: string | null; // Mốc Cần hàng về trước Tầng 1 (tồn < L)
  tier1OrderDeadline: string | null; // Mốc Đặt muộn nhất Tầng 1 (Mốc cần - LeadTime)
  tier1OrderDeadlineReason?: string;
  tier1IsAlreadyBelowSafety?: boolean;

  tier2StockoutDate: string | null; // Mốc Hết hàng Tầng 2
  tier2DeliveryRequiredDate: string | null; // Mốc Cần hàng về trước Tầng 2
  tier2OrderDeadline: string | null; // Mốc Đặt muộn nhất Tầng 2
  tier2OrderDeadlineReason?: string;
  tier2IsAlreadyBelowSafety?: boolean;
}

export interface ProjectionEngineResult {
  snapshotDate: string;
  initialStockKg: number;
  initialStockTons: number;
  dailyDemandKg: number;
  safetyDays: number;
  safetyStockKg: number; // Ngưỡng an toàn L = d * safetyDays
  unitShipmentKg: number; // Định mức 1 chuyến U (BR-36a)
  milestones: ProjectionMilestones;
  suggestions: DeliverySuggestionLine[];
  timeline: ProjectionDay[];
  isShortage: boolean;
  shortageFromDate: string | null;
  shortageQtyKg: number;
  shortageQtyTons: number;
}

const DAY_NAMES = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

export function calculate28DayProjection(
  input: ProjectionEngineInput,
): ProjectionEngineResult {
  const {
    snapshotDate,
    initialStockKg,
    dailyDemandKg,
    bagKg,
    category = '',
    itemGroup = '',
    thresholds,
    existingPlans = [],
    transferOrders = [],
    openPos = [],
  } = input;

  const d = Math.max(0, dailyDemandKg || 0);
  const horizonStartDate = addDaysIso(snapshotDate, 1);
  const horizonEndDate = addDaysIso(snapshotDate, 28);

  // Gọi Pure Domain Engine duy nhất cho Đề xuất và Dự phóng (BR-34 -> BR-36c)
  const domainResult = suggestDeliveriesForPair({
    snapshotDate,
    initialStockKg,
    dailyDemandKg: d,
    safetyDays: thresholds.safetyDays,
    criticalDays: thresholds.criticalDays || 7,
    horizonStartDate,
    horizonEndDate,
    bagKg,
    category,
    itemGroup,
    deliveryDaysPair: thresholds.deliveryDays,
    deliveryQtyKgPair: thresholds.deliveryQtyKg,
    existingPlans,
    transferOrders,
    openPos,
  });

  // Xây dựng bản đồ Inbound cho Tầng 1 và Tầng 2
  const tier1InboundMap = new Map<string, number>();
  const tier2InboundMap = new Map<string, number>();

  // Tầng 1: TO đi đường xếp vào C+1
  const totalToKg = transferOrders.reduce(
    (sum, to) => sum + Number(to.shippedQtyKg || 0),
    0,
  );
  if (totalToKg > 0) {
    tier1InboundMap.set(horizonStartDate, totalToKg);
    tier2InboundMap.set(horizonStartDate, totalToKg);
  }

  // Tầng 1: Kế hoạch đã có
  for (const plan of existingPlans) {
    const pDate = plan.planDate?.slice(0, 10);
    if (!pDate) continue;
    const cur1 = tier1InboundMap.get(pDate) || 0;
    const planKg = Number(plan.planQtyKg || 0);
    tier1InboundMap.set(pDate, cur1 + planKg);

    const cur2 = tier2InboundMap.get(pDate) || 0;
    tier2InboundMap.set(pDate, cur2 + planKg);
  }

  // Tầng 2: Cộng thêm các chuyến đề xuất
  for (const sug of domainResult.suggestions) {
    const sDate = sug.suggestDate;
    const cur = tier2InboundMap.get(sDate) || 0;
    tier2InboundMap.set(sDate, cur + sug.suggestQtyKg);
  }

  // Helper hàm xác định Warning Level của 1 ngày
  const getWarningLevel = (
    doi: number | null,
  ): 'CRITICAL' | 'WARNING' | 'BALANCED' | 'OVERSTOCK' | 'NO_DEMAND' => {
    if (d === 0 || doi === null) return 'NO_DEMAND';
    if (doi < thresholds.criticalDays) return 'CRITICAL';
    if (doi <= thresholds.warningDays) return 'WARNING';
    if (doi > thresholds.overstockDays) return 'OVERSTOCK';
    return 'BALANCED';
  };

  // Tạo khung 28 ngày
  const timeline: ProjectionDay[] = [];
  let prevStockT1 = initialStockKg;
  let prevStockT2 = initialStockKg;

  for (let i = 1; i <= 28; i++) {
    const dateStr = addDaysIso(snapshotDate, i);
    const dow = getDayOfWeekIso(dateStr);

    const inb1 = tier1InboundMap.get(dateStr) || 0;
    const closing1 = prevStockT1 + inb1 - d;
    prevStockT1 = closing1;

    const inb2 = tier2InboundMap.get(dateStr) || 0;
    const closing2 = prevStockT2 + inb2 - d;
    prevStockT2 = closing2;

    const doi1 = d > 0 ? Math.round((closing1 / d) * 10) / 10 : null;
    const doi2 = d > 0 ? Math.round((closing2 / d) * 10) / 10 : null;

    timeline.push({
      dayIndex: i,
      date: dateStr,
      dayOfWeek: dow,
      dayName: DAY_NAMES[dow],
      isSunday: dow === 0,
      dailyDemandKg: d,
      tier1: {
        inboundKg: inb1,
        inboundTons: Math.round((inb1 / 1000) * 1000) / 1000,
        closingStockKg: Math.round(closing1),
        closingStockTons: Math.round((closing1 / 1000) * 1000) / 1000,
        doi: doi1,
        warningLevel: getWarningLevel(doi1),
      },
      tier2: {
        inboundKg: inb2,
        inboundTons: Math.round((inb2 / 1000) * 1000) / 1000,
        closingStockKg: Math.round(closing2),
        closingStockTons: Math.round((closing2 / 1000) * 1000) / 1000,
        doi: doi2,
        warningLevel: getWarningLevel(doi2),
      },
    });
  }

  return {
    snapshotDate,
    initialStockKg,
    initialStockTons: Math.round((initialStockKg / 1000) * 1000) / 1000,
    dailyDemandKg: d,
    safetyDays: domainResult.safetyDays,
    safetyStockKg: domainResult.safetyStockKg,
    unitShipmentKg: domainResult.unitShipmentKg,
    milestones: {
      tier1StockoutDate: domainResult.milestonesTier1.stockoutDate,
      tier1DeliveryRequiredDate: domainResult.milestonesTier1.deliveryRequiredDate,
      tier1OrderDeadline: domainResult.milestonesTier1.orderDeadline,
      tier1OrderDeadlineReason: domainResult.milestonesTier1.orderDeadlineReason,
      tier1IsAlreadyBelowSafety: domainResult.milestonesTier1.isAlreadyBelowSafety,

      tier2StockoutDate: domainResult.milestonesTier2.stockoutDate,
      tier2DeliveryRequiredDate: domainResult.milestonesTier2.deliveryRequiredDate,
      tier2OrderDeadline: domainResult.milestonesTier2.orderDeadline,
      tier2OrderDeadlineReason: domainResult.milestonesTier2.orderDeadlineReason,
      tier2IsAlreadyBelowSafety: domainResult.milestonesTier2.isAlreadyBelowSafety,
    },
    suggestions: domainResult.suggestions,
    timeline,
    isShortage: domainResult.isShortage,
    shortageFromDate: domainResult.shortageFromDate,
    shortageQtyKg: domainResult.shortageQtyKg,
    shortageQtyTons: domainResult.shortageQtyTons,
  };
}
