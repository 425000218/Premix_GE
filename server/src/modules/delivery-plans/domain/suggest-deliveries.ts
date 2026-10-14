/**
 * PURE DOMAIN ENGINE: DELIVERY SUGGESTIONS & PROJECTION (BR-34, BR-34a, BR-35, BR-36, BR-36a, BR-36b, BR-36c)
 * File: server/src/modules/delivery-plans/domain/suggest-deliveries.ts
 * Clean Architecture Domain Layer - No DB or Framework dependencies.
 */

export interface OpenPoPoolItem {
  poPendingId?: number;
  poNumber: string;
  deliveryDate: string; // YYYY-MM-DD (ngày tạo PO / hẹn giao D365)
  supplierId?: number;
  supplierCode?: string;
  supplierName?: string;
  leadTimeDays: number;
  deliverRemainderKg: number;
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

export interface SuggestDeliveriesInput {
  snapshotDate: string; // Ngày chốt C (YYYY-MM-DD)
  initialStockKg: number; // SOH khả dụng tại C (availableKg)
  dailyDemandKg: number; // Tiêu hao ngày d = MAX(StandardUsage, ActualConsumptionRate) theo BR-08
  safetyDays: number; // Số ngày an toàn của cặp (BR-35: 0-365)
  criticalDays?: number; // Ngưỡng nguy cấp mặc định nếu safetyDays không có (mặc định 7)

  // Chân trời đề xuất [horizonStartDate, horizonEndDate]
  // BR-36: Tầng 2 dự phóng: E = C+1, H = C+28
  // Lưới kế hoạch giao tuần: E = max(C+1, hôm nay), H = Chủ nhật của tuần
  horizonStartDate: string; // E (YYYY-MM-DD)
  horizonEndDate: string; // H (YYYY-MM-DD)
  todayVn?: string; // YYYY-MM-DD (mặc định hôm nay)

  // Quy cách & Định mức U (BR-36a)
  bagKg?: number | null; // Quy cách bao (mặc định 25 kg, null hoặc 0 = hàng xá)
  category?: string;
  itemGroup?: string;
  deliveryDaysPair?: number | null; // N riêng của cặp
  deliveryQtyKgPair?: number | null; // Định mức riêng của cặp (dùng nguyên)
  systemBulkDeliveryKg?: number; // Mặc định 30.000 kg (cfg_System BulkDeliveryKg)
  systemDeliveryDays?: number; // Mặc định 7 ngày (cfg_System DeliveryDays)

  existingPlans?: ExistingPlanItem[]; // Kế hoạch đã lưu trên lưới
  transferOrders?: TransferOrderItem[]; // Hàng đi đường TO (xếp vào C+1 theo BR-34)
  openPos?: OpenPoPoolItem[]; // Danh sách PO Pending bản C
}

export interface DeliverySuggestionLine {
  suggestionIndex: number;
  suggestDate: string; // YYYY-MM-DD (Ngày giao G)
  dayIndex: number; // 1-indexed so với horizon
  suggestQtyKg: number;
  suggestQtyTons: number;
  poNumber: string;
  supplierId?: number;
  supplierCode?: string;
  supplierName?: string;
  leadTimeDays: number;
  reason: string;
  isLateWarning: boolean;
  doiAfterDelivery: number | null;
}

export interface MilestoneResult {
  stockoutDate: string | null; // Mốc hết hàng (tồn cuối ngày < 0)
  deliveryRequiredDate: string | null; // Mốc cần hàng về trước (tồn cuối ngày < L)
  orderDeadline: string | null; // Mốc đặt muộn nhất (Mốc cần - LeadTime)
  orderDeadlineReason?: 'EXACT' | 'NO_SUPPLIER' | 'NO_LEAD_TIME' | 'BEYOND_HORIZON' | 'ALREADY_CRITICAL';
  isAlreadyBelowSafety: boolean; // Tồn(C) đã < L
}

export interface SuggestDeliveriesResult {
  snapshotDate: string;
  horizonStartDate: string;
  horizonEndDate: string;
  dailyDemandKg: number;
  safetyDays: number;
  safetyStockKg: number; // Ngưỡng an toàn L = d * safetyDays
  unitShipmentKg: number; // Định mức một chuyến U (BR-36a)

  milestonesTier1: MilestoneResult;
  milestonesTier2: MilestoneResult;

  suggestions: DeliverySuggestionLine[];

  isShortage: boolean;
  shortageFromDate: string | null;
  shortageQtyKg: number;
  shortageQtyTons: number;

  remainingPoPool: Array<{
    poNumber: string;
    supplierId?: number;
    deliverRemainderKg: number;
  }>;
}

// =============================================================================
// Helper Functions: Xử lý ngày tháng thuần UTC/ISO không phụ thuộc Timezone máy chủ
// =============================================================================

export function parseIsoDate(isoStr: string): Date {
  const parts = isoStr.slice(0, 10).split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

export function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(isoStr: string, days: number): string {
  const d = parseIsoDate(isoStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIsoDate(d);
}

export function diffDaysIso(startIso: string, endIso: string): number {
  const d1 = parseIsoDate(startIso);
  const d2 = parseIsoDate(endIso);
  const msDiff = d2.getTime() - d1.getTime();
  return Math.round(msDiff / (24 * 60 * 60 * 1000));
}

/**
 * Trả về thứ trong tuần theo chuẩn: 0 = Chủ Nhật, 1 = Thứ 2, ..., 6 = Thứ 7
 */
export function getDayOfWeekIso(isoStr: string): number {
  const d = parseIsoDate(isoStr);
  return d.getUTCDay();
}

/**
 * Kiểm tra xem ngày có phải là ngày làm việc Thứ 2 - Thứ 7 (tránh Chủ Nhật) theo BR-36
 */
export function isWorkingDay(isoStr: string): boolean {
  return getDayOfWeekIso(isoStr) !== 0;
}

/**
 * Tìm ngày làm việc kế tiếp sau dateIso (Thứ 2 - Thứ 7)
 */
export function getNextWorkingDay(dateIso: string): string {
  let next = addDaysIso(dateIso, 1);
  while (!isWorkingDay(next)) {
    next = addDaysIso(next, 1);
  }
  return next;
}

// =============================================================================
// THUẬT TOÁN ĐỀ XUẤT LỊCH GIAO HÀNG ĐỘC LẬP TỪNG CẶP (BR-34 -> BR-36c)
// =============================================================================

export function suggestDeliveriesForPair(input: SuggestDeliveriesInput): SuggestDeliveriesResult {
  const {
    snapshotDate,
    initialStockKg,
    dailyDemandKg,
    safetyDays: rawSafetyDays,
    criticalDays = 7,
    horizonStartDate,
    horizonEndDate,
    bagKg,
    category = '',
    itemGroup = '',
    deliveryDaysPair,
    deliveryQtyKgPair,
    systemBulkDeliveryKg = 30000,
    systemDeliveryDays = 7,
    existingPlans = [],
    transferOrders = [],
    openPos = [],
  } = input;

  const d = Math.max(0, dailyDemandKg || 0);

  // BR-35: Số ngày an toàn của cặp = SafetyDays (0-365). Trống hoặc không có -> CriticalDays
  const safetyDays =
    rawSafetyDays !== undefined && rawSafetyDays !== null && !isNaN(Number(rawSafetyDays))
      ? Number(rawSafetyDays)
      : criticalDays;

  const safetyStockKg = Math.round(d * safetyDays); // Ngưỡng an toàn L

  // 1. Tính định mức 1 chuyến giao U (BR-36a)
  const isBulk =
    bagKg === 0 ||
    bagKg === null ||
    bagKg === undefined ||
    category.toLowerCase().includes('bulk') ||
    category.toLowerCase().includes('xá') ||
    itemGroup.toLowerCase().includes('bulk') ||
    itemGroup.toLowerCase().includes('xá');

  let unitShipmentKg: number;
  if (deliveryQtyKgPair && Number(deliveryQtyKgPair) > 0) {
    // (1) Định mức của cặp DeliveryQtyKg — dùng nguyên, không làm tròn
    unitShipmentKg = Number(deliveryQtyKgPair);
  } else if (deliveryDaysPair && Number(deliveryDaysPair) > 0) {
    // (2) N riêng của cặp DeliveryDays -> U = d * N, làm tròn lên bao hoặc 1.000 kg nếu hàng xá
    const rawU = d * Number(deliveryDaysPair);
    const roundStep = isBulk ? 1000 : Math.max(1, Number(bagKg) || 25);
    unitShipmentKg = Math.max(roundStep, Math.ceil(rawU / roundStep) * roundStep);
  } else if (isBulk) {
    // (3) Hàng xá (BagKg trống) -> BulkDeliveryKg chung (mặc định 30.000 kg)
    unitShipmentKg = Number(systemBulkDeliveryKg) || 30000;
  } else {
    // (4) Còn lại -> U = d * N chung (DeliveryDays chung, mặc định 7), làm tròn lên bao
    const roundStep = Math.max(1, Number(bagKg) || 25);
    const rawU = d * (Number(systemDeliveryDays) || 7);
    unitShipmentKg = Math.max(roundStep, Math.ceil(rawU / roundStep) * roundStep);
  }

  // 2. Chuẩn bị nguồn PO Pending và Khấu trừ theo FIFO (BR-34, BR-36c)
  // Sắp xếp PO theo FIFO: DeliveryDate (ngày tạo PO) tăng dần (không ngày tạo xếp cuối), rồi theo PONumber
  const poPool: OpenPoPoolItem[] = openPos
    .map((po) => ({
      ...po,
      leadTimeDays: Number(po.leadTimeDays || 7),
      deliverRemainderKg: Math.max(0, Number(po.deliverRemainderKg || 0)),
    }))
    .sort((a, b) => {
      const dateA = a.deliveryDate || '9999-12-31';
      const dateB = b.deliveryDate || '9999-12-31';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.poNumber || '').localeCompare(b.poNumber || '');
    });

  // BR-36c: Khấu trừ các kế hoạch đã lên lịch sau C vào PO còn lại trước khi đề xuất
  // - Kế hoạch có số PO: trừ vào chính PO đó
  // - Kế hoạch không có số PO: trừ vào PO cùng NCC theo FIFO
  for (const plan of existingPlans) {
    if (diffDaysIso(snapshotDate, plan.planDate) <= 0) continue; // Chỉ tính kế hoạch sau C
    let planKg = Number(plan.planQtyKg || 0);
    if (planKg <= 0) continue;

    if (plan.poNumber && plan.poNumber.trim()) {
      const targetPo = poPool.find((p) => p.poNumber.trim() === plan.poNumber!.trim());
      if (targetPo) {
        const deduct = Math.min(targetPo.deliverRemainderKg, planKg);
        targetPo.deliverRemainderKg -= deduct;
      }
    } else if (plan.supplierId) {
      // Trừ theo FIFO cùng NCC
      for (const po of poPool) {
        if (po.supplierId === plan.supplierId && po.deliverRemainderKg > 0) {
          const deduct = Math.min(po.deliverRemainderKg, planKg);
          po.deliverRemainderKg -= deduct;
          planKg -= deduct;
          if (planKg <= 0) break;
        }
      }
    }
  }

  // 3. Khởi tạo dãy ngày t từ C+1 đến max(H, C+28)
  const maxHorizonEnd =
    diffDaysIso(snapshotDate, horizonEndDate) >= 28 ? horizonEndDate : addDaysIso(snapshotDate, 28);
  const totalDays = diffDaysIso(snapshotDate, maxHorizonEnd);

  const dates: string[] = [];
  for (let i = 1; i <= totalDays; i++) {
    dates.push(addDaysIso(snapshotDate, i));
  }

  // Hàng về Tầng 1 đã có:
  // - Hàng đi đường TO xếp vào ngày C+1 (t=1) theo BR-34
  // - Các kế hoạch existingPlans vào đúng planDate
  const totalToKg = transferOrders.reduce((sum, to) => sum + Number(to.shippedQtyKg || 0), 0);
  const tier1Inbound = new Map<string, number>();
  if (dates.length > 0) {
    tier1Inbound.set(dates[0], totalToKg);
  }
  for (const plan of existingPlans) {
    const pDate = plan.planDate.slice(0, 10);
    const cur = tier1Inbound.get(pDate) || 0;
    tier1Inbound.set(pDate, cur + Number(plan.planQtyKg || 0));
  }

  // Tính dãy tồn cuối ngày Tầng 1 (Scheduled)
  const tier1Closing = new Map<string, number>();
  let prevStock = initialStockKg;
  for (const dateStr of dates) {
    const inbound = tier1Inbound.get(dateStr) || 0;
    const closing = prevStock + inbound - d;
    tier1Closing.set(dateStr, closing);
    prevStock = closing;
  }

  // 4. Tìm mốc Tầng 1 (BR-34a)
  const computeMilestones = (closingMap: Map<string, number>): MilestoneResult => {
    let stockoutDate: string | null = null;
    let deliveryRequiredDate: string | null = null;
    let orderDeadline: string | null = null;
    let orderDeadlineReason: MilestoneResult['orderDeadlineReason'] = 'BEYOND_HORIZON';
    let isAlreadyBelow = false;

    // Kiểm tra tồn tại C đã < L
    if (initialStockKg < safetyStockKg) {
      deliveryRequiredDate = snapshotDate;
      isAlreadyBelow = true;
    }

    for (let i = 0; i < dates.length; i++) {
      const curDate = dates[i];
      const stock = closingMap.get(curDate) ?? 0;

      // Mốc hết hàng L = 0: ngày ngay trước ngày đầu tiên có tồn < 0
      if (stock < 0 && !stockoutDate) {
        stockoutDate = i === 0 ? snapshotDate : dates[i - 1];
      }

      // Mốc cần hàng về trước L: ngày ngay trước ngày đầu tiên có tồn < L
      if (stock < safetyStockKg && !deliveryRequiredDate) {
        deliveryRequiredDate = i === 0 ? snapshotDate : dates[i - 1];
      }
    }

    // Mốc đặt muộn nhất = Mốc cần hàng về trước - LeadTime của dòng PO Pending gần nhất
    const nearestPo = poPool.find((p) => p.deliverRemainderKg > 0) || poPool[0];
    if (deliveryRequiredDate) {
      if (isAlreadyBelow) {
        orderDeadline = snapshotDate;
        orderDeadlineReason = 'ALREADY_CRITICAL';
      } else if (!nearestPo || !nearestPo.supplierId) {
        orderDeadlineReason = 'NO_SUPPLIER';
      } else if (!nearestPo.leadTimeDays || nearestPo.leadTimeDays <= 0) {
        orderDeadlineReason = 'NO_LEAD_TIME';
      } else {
        orderDeadline = addDaysIso(deliveryRequiredDate, -nearestPo.leadTimeDays);
        orderDeadlineReason = 'EXACT';
      }
    }

    return {
      stockoutDate,
      deliveryRequiredDate,
      orderDeadline,
      orderDeadlineReason,
      isAlreadyBelowSafety: isAlreadyBelow,
    };
  };

  const milestonesTier1 = computeMilestones(tier1Closing);

  // 5. Thuật toán Đề xuất Lịch giao (BR-36)
  const suggestions: DeliverySuggestionLine[] = [];
  const tier2Inbound = new Map<string, number>(tier1Inbound);
  const tier2Closing = new Map<string, number>(tier1Closing);

  let isShortage = false;
  let shortageFromDate: string | null = null;
  let shortageQtyKg = 0;

  // Nếu tiêu hao d = 0 thì không đề xuất
  if (d > 0) {
    let searchStart = horizonStartDate;

    // Lặp tìm các mốc vi phạm cho đến khi duyệt hết chân trời horizonEndDate
    while (diffDaysIso(searchStart, horizonEndDate) >= 0) {
      // Tính lại dãy tồn Tầng 2 từ searchStart đến horizonEndDate
      let pStock =
        searchStart === dates[0]
          ? initialStockKg
          : tier2Closing.get(addDaysIso(searchStart, -1)) ?? initialStockKg;

      let violationDate: string | null = null;
      let checkDate = searchStart;

      while (diffDaysIso(checkDate, horizonEndDate) >= 0) {
        const inb = tier2Inbound.get(checkDate) || 0;
        const curClosing = pStock + inb - d;
        tier2Closing.set(checkDate, curClosing);
        pStock = curClosing;

        if (curClosing < safetyStockKg && !violationDate) {
          violationDate = checkDate;
        }
        checkDate = addDaysIso(checkDate, 1);
      }

      if (!violationDate) {
        // Không còn ngày nào vi phạm ngưỡng L trong chân trời
        break;
      }

      // Mốc M (BR-34a): ngày ngay trước ngày đầu tiên có tồn < L
      let milestoneM: string;
      if (violationDate === dates[0]) {
        milestoneM = snapshotDate;
      } else {
        milestoneM = addDaysIso(violationDate, -1);
      }

      // Xác định ngày giao G (BR-36):
      // Ngày Thứ 2 - Thứ 7 muộn nhất trong [E, M]
      let deliveryDateG: string | null = null;
      let isLate = false;

      // Tìm từ M lùi về searchStart
      let candidate = milestoneM;
      while (diffDaysIso(searchStart, candidate) >= 0) {
        if (isWorkingDay(candidate)) {
          deliveryDateG = candidate;
          break;
        }
        candidate = addDaysIso(candidate, -1);
      }

      if (!deliveryDateG) {
        // M < E hoặc trong [E, M] chỉ có Chủ Nhật -> Chọn ngày làm việc đầu tiên >= searchStart
        candidate = searchStart;
        while (diffDaysIso(candidate, horizonEndDate) >= 0) {
          if (isWorkingDay(candidate)) {
            deliveryDateG = candidate;
            isLate = true;
            break;
          }
          candidate = addDaysIso(candidate, 1);
        }
      }

      // Nếu G > horizonEndDate thì dừng đề xuất
      if (!deliveryDateG || diffDaysIso(deliveryDateG, horizonEndDate) < 0) {
        break;
      }

      // Tính số chuyến k và lượng giao tại G (BR-36a):
      // k nhỏ nhất >= 1 sao cho tồn cuối ngày >= L từ G tới hết ngày Thứ 2-7 kế tiếp sau G
      const nextWorkDay = getNextWorkingDay(deliveryDateG);
      const evalEndDay =
        diffDaysIso(nextWorkDay, horizonEndDate) <= 0 ? nextWorkDay : horizonEndDate;

      // Thử tăng dần k từ 1 đến khi thỏa mãn hoặc chạm giới hạn hợp lý
      let chosenK = 1;
      let minDeficit = 0;

      for (let k = 1; k <= 50; k++) {
        const testAdd = k * unitShipmentKg;
        let testStock =
          deliveryDateG === dates[0]
            ? initialStockKg
            : tier2Closing.get(addDaysIso(deliveryDateG, -1)) ?? initialStockKg;

        let ok = true;
        let curD = deliveryDateG;
        while (diffDaysIso(curD, evalEndDay) >= 0) {
          const inb = (tier2Inbound.get(curD) || 0) + (curD === deliveryDateG ? testAdd : 0);
          testStock = testStock + inb - d;
          if (testStock < safetyStockKg) {
            ok = false;
            minDeficit = Math.max(minDeficit, safetyStockKg - testStock);
            break;
          }
          curD = addDaysIso(curD, 1);
        }

        if (ok) {
          chosenK = k;
          break;
        }
        chosenK = k;
      }

      let targetNeededKg = chosenK * unitShipmentKg;

      // Phân bổ từ PO Pending theo FIFO (BR-36)
      // Mỗi PO một dòng, NCC theo PO. Dòng cùng số PO gộp một dòng.
      let allocatedTotalForG = 0;
      const linesForG: DeliverySuggestionLine[] = [];

      for (const po of poPool) {
        if (po.deliverRemainderKg > 0 && targetNeededKg > 0) {
          const takeKg = Math.min(po.deliverRemainderKg, targetNeededKg);
          po.deliverRemainderKg -= takeKg;
          targetNeededKg -= takeKg;
          allocatedTotalForG += takeKg;

          const currentStockAtG = (tier2Closing.get(deliveryDateG) || 0) + takeKg;
          const doi = d > 0 ? Math.round((currentStockAtG / d) * 10) / 10 : null;

          linesForG.push({
            suggestionIndex: suggestions.length + linesForG.length + 1,
            suggestDate: deliveryDateG,
            dayIndex: diffDaysIso(snapshotDate, deliveryDateG),
            suggestQtyKg: takeKg,
            suggestQtyTons: +(takeKg / 1000).toFixed(3),
            poNumber: po.poNumber,
            supplierId: po.supplierId,
            supplierCode: po.supplierCode,
            supplierName: po.supplierName,
            leadTimeDays: po.leadTimeDays,
            reason: `Bổ sung bảo vệ an toàn L=${safetyStockKg.toLocaleString()} kg${
              isLate ? ' (trễ so với mốc M)' : ''
            }`,
            isLateWarning: isLate,
            doiAfterDelivery: doi,
          });

          if (targetNeededKg <= 0) break;
        }
      }

      // Đưa các dòng đề xuất vào danh sách kết quả
      for (const l of linesForG) {
        suggestions.push(l);
      }

      // Cập nhật inbound cho ngày G
      if (allocatedTotalForG > 0) {
        const curInb = tier2Inbound.get(deliveryDateG) || 0;
        tier2Inbound.set(deliveryDateG, curInb + allocatedTotalForG);
      }

      // Xử lý khi PO không đủ lượng (Shortage) (BR-36)
      if (targetNeededKg > 0) {
        isShortage = true;
        shortageFromDate = deliveryDateG;
        const closingAtH = tier2Closing.get(horizonEndDate) || 0;
        shortageQtyKg = Math.max(safetyStockKg - closingAtH, targetNeededKg);
        // Ngừng đề xuất cho cặp này
        break;
      }

      // Tiếp tục tìm mốc từ G + 1
      searchStart = addDaysIso(deliveryDateG, 1);
    }
  }

  // 6. Tính lại toàn bộ dãy tồn Tầng 2 sau đề xuất và tìm mốc Tầng 2
  let pStock2 = initialStockKg;
  for (const dateStr of dates) {
    const inbound = tier2Inbound.get(dateStr) || 0;
    const closing = pStock2 + inbound - d;
    tier2Closing.set(dateStr, closing);
    pStock2 = closing;
  }

  const milestonesTier2 = computeMilestones(tier2Closing);

  return {
    snapshotDate,
    horizonStartDate,
    horizonEndDate,
    dailyDemandKg: d,
    safetyDays,
    safetyStockKg,
    unitShipmentKg,
    milestonesTier1,
    milestonesTier2,
    suggestions,
    isShortage,
    shortageFromDate,
    shortageQtyKg,
    shortageQtyTons: +(shortageQtyKg / 1000).toFixed(3),
    remainingPoPool: poPool.map((p) => ({
      poNumber: p.poNumber,
      supplierId: p.supplierId,
      deliverRemainderKg: p.deliverRemainderKg,
    })),
  };
}
