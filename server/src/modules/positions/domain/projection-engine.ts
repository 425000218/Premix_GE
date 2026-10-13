/**
 * PURE DOMAIN ENGINE: 28-DAY INVENTORY PROJECTION & DELIVERY SUGGESTIONS (BR-34, BR-36)
 * File: server/src/modules/positions/domain/projection-engine.ts
 * Clean Architecture Domain Layer - No DB or Framework dependencies.
 */

export interface ProjectionThresholds {
  criticalDays: number;
  warningDays: number;
  overstockDays: number;
  safetyDays: number;
  deliveryDays?: number;
  deliveryQtyKg?: number;
}

export interface ExistingPlanItem {
  planId: number;
  planDate: string; // YYYY-MM-DD
  poNumber?: string;
  supplierId?: number;
  supplierName?: string;
  planQtyKg: number;
}

export interface TransferOrderItem {
  transferId: number;
  transferNumber: string;
  shippedDate: string;
  shippedQtyKg: number;
}

export interface OpenPoPendingItem {
  poPendingId: number;
  poNumber: string;
  deliveryDate: string;
  supplierId?: number;
  supplierName?: string;
  leadTimeDays: number;
  deliverRemainderKg: number;
}

export interface ProjectionEngineInput {
  snapshotDate: string; // YYYY-MM-DD (Ngày chốt C)
  initialStockKg: number; // SOH khả dụng tại C (availableKg)
  stdDailyKg: number; // Tiêu hao chuẩn ngày d
  bagKg: number; // Quy cách bao (mặc định 25)
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

export interface DeliverySuggestionItem {
  suggestionIndex: number;
  suggestDate: string; // YYYY-MM-DD
  dayIndex: number;
  suggestQtyKg: number;
  suggestQtyTons: number;
  poNumber: string;
  supplierId?: number;
  supplierName?: string;
  reason: string;
  isLateWarning?: boolean;
}

export interface ProjectionMilestones {
  tier1StockoutDate: string | null; // Mốc Hết hàng Tầng 1 (tồn < 0)
  tier1DeliveryRequiredDate: string | null; // Mốc Cần hàng về trước Tầng 1 (tồn < L)
  tier1OrderDeadline: string | null; // Mốc Đặt muộn nhất Tầng 1 (Mốc cần - LeadTime)
  tier2StockoutDate: string | null; // Mốc Hết hàng Tầng 2
  tier2DeliveryRequiredDate: string | null; // Mốc Cần hàng về trước Tầng 2
  tier2OrderDeadline: string | null; // Mốc Đặt muộn nhất Tầng 2
}

export interface ProjectionEngineResult {
  snapshotDate: string;
  initialStockKg: number;
  initialStockTons: number;
  stdDailyKg: number;
  safetyDays: number;
  safetyStockKg: number; // Ngưỡng an toàn L = d * safetyDays
  unitShipmentKg: number; // Định mức 1 chuyến U (BR-36a)
  milestones: ProjectionMilestones;
  suggestions: DeliverySuggestionItem[];
  timeline: ProjectionDay[];
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
  input: ProjectionEngineInput
): ProjectionEngineResult {
  const {
    snapshotDate,
    initialStockKg,
    stdDailyKg,
    bagKg,
    category = '',
    itemGroup = '',
    thresholds,
    existingPlans = [],
    transferOrders = [],
    openPos = [],
  } = input;

  const d = Math.max(0, stdDailyKg || 0);
  const safetyDays = thresholds.safetyDays || thresholds.criticalDays || 7;
  const safetyStockKg = Math.round(d * safetyDays); // Mức bảo vệ an toàn L

  // 1. Tính định mức 1 chuyến giao U (BR-36a)
  const isBulk =
    bagKg === 0 ||
    category.toLowerCase().includes('bulk') ||
    category.toLowerCase().includes('xá') ||
    itemGroup.toLowerCase().includes('bulk') ||
    itemGroup.toLowerCase().includes('xá');

  let unitShipmentKg: number;
  if (thresholds.deliveryQtyKg && thresholds.deliveryQtyKg > 0) {
    unitShipmentKg = thresholds.deliveryQtyKg;
  } else if (thresholds.deliveryDays && thresholds.deliveryDays > 0) {
    unitShipmentKg = Math.round(d * thresholds.deliveryDays);
  } else if (isBulk) {
    unitShipmentKg = 30000; // Định mức hàng xá 30 tấn
  } else {
    unitShipmentKg = Math.round(d * 7); // Mặc định 7 ngày tiêu hao
  }

  // Làm tròn lên theo quy cách bao (bagKg) hoặc 1.000 kg nếu hàng xá
  const roundUnit = isBulk ? 1000 : Math.max(1, bagKg || 25);
  if (unitShipmentKg > 0) {
    unitShipmentKg = Math.ceil(unitShipmentKg / roundUnit) * roundUnit;
  } else {
    unitShipmentKg = roundUnit;
  }

  // 2. Tạo khung 28 ngày t = C+1 .. C+28
  const snapDateObj = new Date(snapshotDate);
  const days: {
    dayIndex: number;
    date: string;
    dayOfWeek: number;
    dayName: string;
    isSunday: boolean;
  }[] = [];

  for (let i = 1; i <= 28; i++) {
    const curDate = new Date(snapDateObj);
    curDate.setDate(curDate.getDate() + i);
    const dateStr = curDate.toISOString().slice(0, 10);
    const dow = curDate.getDay();
    days.push({
      dayIndex: i,
      date: dateStr,
      dayOfWeek: dow,
      dayName: DAY_NAMES[dow],
      isSunday: dow === 0,
    });
  }

  // 3. Tính toán Tầng 1: Đã lên lịch (Scheduled)
  // Tổng TO hàng đi đường xếp vào ngày C+1 (t = 1) theo BR-34
  const totalToKg = transferOrders.reduce(
    (sum, to) => sum + Number(to.shippedQtyKg || 0),
    0
  );

  const tier1InboundByDay: number[] = new Array(28).fill(0);
  if (days.length > 0) {
    tier1InboundByDay[0] += totalToKg; // Day 1 (C+1)
  }

  for (const plan of existingPlans) {
    const pDate = plan.planDate?.slice(0, 10);
    const dayIdx = days.findIndex((d) => d.date === pDate);
    if (dayIdx >= 0) {
      tier1InboundByDay[dayIdx] += Number(plan.planQtyKg || 0);
    }
  }

  const tier1ClosingStock: number[] = new Array(28).fill(0);
  let prevStockT1 = initialStockKg;

  for (let i = 0; i < 28; i++) {
    const closing = prevStockT1 + tier1InboundByDay[i] - d;
    tier1ClosingStock[i] = closing;
    prevStockT1 = closing;
  }

  // 4. Thuật toán Đề xuất Lịch giao (BR-36) cho Tầng 2
  // Sao chép nguồn PO Pending để trừ dần theo FIFO
  const poPool = openPos.map((po) => ({
    ...po,
    remainingKg: Number(po.deliverRemainderKg || 0),
    leadTimeDays: Number(po.leadTimeDays || 7),
  }));

  const suggestions: DeliverySuggestionItem[] = [];
  const tier2InboundByDay: number[] = [...tier1InboundByDay];
  const tier2ClosingStock: number[] = new Array(28).fill(0);

  let prevStockT2 = initialStockKg;

  for (let i = 0; i < 28; i++) {
    let currentClosing = prevStockT2 + tier2InboundByDay[i] - d;

    // Kiểm tra nếu tồn cuối ngày rơi xuống dưới mức an toàn L (và có nhu cầu d > 0)
    if (d > 0 && currentClosing < safetyStockKg) {
      // Tìm ngày giao hợp lệ G: ngày làm việc (Thứ 2 - Thứ 7, tránh Chủ Nhật)
      // trong khoảng [0 .. i]
      let targetDayIdx = -1;
      for (let j = i; j >= 0; j--) {
        if (!days[j].isSunday) {
          targetDayIdx = j;
          break;
        }
      }

      let isLate = false;
      if (targetDayIdx < 0) {
        // Nếu không có ngày nào trước đó không phải CN (ví dụ ngày 1 là CN)
        // Tìm ngày làm việc đầu tiên kế tiếp
        for (let j = i + 1; j < 28; j++) {
          if (!days[j].isSunday) {
            targetDayIdx = j;
            isLate = true;
            break;
          }
        }
      }

      if (targetDayIdx < 0) targetDayIdx = i; // Fallback

      // Tính lượng thiếu hụt cần bổ sung
      const deficit = safetyStockKg - currentClosing;
      const trips = Math.max(1, Math.ceil(deficit / unitShipmentKg));
      let targetAddKg = trips * unitShipmentKg;

      // Lấy từ nguồn PO Pending theo FIFO
      let addedKgForTrip = 0;
      let usedPoNumber = 'PO-PENDING';
      let usedSupplierName = '';
      let usedSupplierId: number | undefined;

      for (const po of poPool) {
        if (po.remainingKg > 0 && targetAddKg > 0) {
          const allocate = Math.min(po.remainingKg, targetAddKg);
          po.remainingKg -= allocate;
          targetAddKg -= allocate;
          addedKgForTrip += allocate;
          usedPoNumber = po.poNumber;
          usedSupplierName = po.supplierName || '';
          usedSupplierId = po.supplierId;

          if (targetAddKg <= 0) break;
        }
      }

      // Nếu PO còn lượng hoặc đã phân bổ được
      if (addedKgForTrip > 0) {
        tier2InboundByDay[targetDayIdx] += addedKgForTrip;

        suggestions.push({
          suggestionIndex: suggestions.length + 1,
          suggestDate: days[targetDayIdx].date,
          dayIndex: targetDayIdx + 1,
          suggestQtyKg: addedKgForTrip,
          suggestQtyTons: Math.round((addedKgForTrip / 1000) * 1000) / 1000,
          poNumber: usedPoNumber,
          supplierId: usedSupplierId,
          supplierName: usedSupplierName,
          reason: `Bổ sung tự động khi tồn rơi xuống dưới mức an toàn (${Math.round(currentClosing)} kg < L=${safetyStockKg} kg)`,
          isLateWarning: isLate,
        });

        // Tính lại closing stock từ targetDayIdx đến i
        let recomputeStock =
          targetDayIdx === 0
            ? initialStockKg
            : tier2ClosingStock[targetDayIdx - 1];
        for (let k = targetDayIdx; k <= i; k++) {
          recomputeStock = recomputeStock + tier2InboundByDay[k] - d;
          tier2ClosingStock[k] = recomputeStock;
        }
        currentClosing = tier2ClosingStock[i];
      }
    }

    tier2ClosingStock[i] = currentClosing;
    prevStockT2 = currentClosing;
  }

  // Helper hàm xác định Warning Level của 1 ngày
  const getWarningLevel = (
    doi: number | null
  ): 'CRITICAL' | 'WARNING' | 'BALANCED' | 'OVERSTOCK' | 'NO_DEMAND' => {
    if (d === 0 || doi === null) return 'NO_DEMAND';
    if (doi < thresholds.criticalDays) return 'CRITICAL';
    if (doi <= thresholds.warningDays) return 'WARNING';
    if (doi > thresholds.overstockDays) return 'OVERSTOCK';
    return 'BALANCED';
  };

  // 5. Tổng hợp Timeline 28 ngày
  const timeline: ProjectionDay[] = days.map((day, idx) => {
    const t1Stock = tier1ClosingStock[idx];
    const t1Doi = d > 0 ? Math.round((t1Stock / d) * 10) / 10 : null;

    const t2Stock = tier2ClosingStock[idx];
    const t2Doi = d > 0 ? Math.round((t2Stock / d) * 10) / 10 : null;

    return {
      dayIndex: day.dayIndex,
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      dayName: day.dayName,
      isSunday: day.isSunday,
      dailyDemandKg: d,
      tier1: {
        inboundKg: tier1InboundByDay[idx],
        inboundTons: Math.round((tier1InboundByDay[idx] / 1000) * 1000) / 1000,
        closingStockKg: Math.round(t1Stock),
        closingStockTons: Math.round((t1Stock / 1000) * 1000) / 1000,
        doi: t1Doi,
        warningLevel: getWarningLevel(t1Doi),
      },
      tier2: {
        inboundKg: tier2InboundByDay[idx],
        inboundTons: Math.round((tier2InboundByDay[idx] / 1000) * 1000) / 1000,
        closingStockKg: Math.round(t2Stock),
        closingStockTons: Math.round((t2Stock / 1000) * 1000) / 1000,
        doi: t2Doi,
        warningLevel: getWarningLevel(t2Doi),
      },
    };
  });

  // 6. Xác định 3 Mốc Thời Gian Trọng Yếu (BR-34a)
  const defaultLeadTimeDays = openPos[0]?.leadTimeDays || 7;

  const findMilestones = (closingStocks: number[]) => {
    let stockoutDate: string | null = null;
    let deliveryRequiredDate: string | null = null;
    let orderDeadline: string | null = null;

    for (let i = 0; i < 28; i++) {
      const stock = closingStocks[i];
      if (stock < 0 && !stockoutDate) {
        stockoutDate = days[i].date;
      }
      if (stock < safetyStockKg && !deliveryRequiredDate) {
        deliveryRequiredDate = days[i].date;
        // Mốc đặt muộn nhất = DeliveryRequiredDate - LeadTimeDays
        const deadlineDate = new Date(deliveryRequiredDate);
        deadlineDate.setDate(deadlineDate.getDate() - defaultLeadTimeDays);
        orderDeadline = deadlineDate.toISOString().slice(0, 10);
      }
    }

    return { stockoutDate, deliveryRequiredDate, orderDeadline };
  };

  const t1Milestones = findMilestones(tier1ClosingStock);
  const t2Milestones = findMilestones(tier2ClosingStock);

  return {
    snapshotDate,
    initialStockKg,
    initialStockTons: Math.round((initialStockKg / 1000) * 1000) / 1000,
    stdDailyKg: d,
    safetyDays,
    safetyStockKg,
    unitShipmentKg,
    milestones: {
      tier1StockoutDate: t1Milestones.stockoutDate,
      tier1DeliveryRequiredDate: t1Milestones.deliveryRequiredDate,
      tier1OrderDeadline: t1Milestones.orderDeadline,
      tier2StockoutDate: t2Milestones.stockoutDate,
      tier2DeliveryRequiredDate: t2Milestones.deliveryRequiredDate,
      tier2OrderDeadline: t2Milestones.orderDeadline,
    },
    suggestions,
    timeline,
  };
}
