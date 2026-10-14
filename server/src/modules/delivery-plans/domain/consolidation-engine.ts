/**
 * PURE DOMAIN ENGINE: TRUCKLOAD CONSOLIDATION (BR-36b)
 * Thuật toán Gom Chuyến Xe Tải Theo Nhà Cung Cấp áp dụng Joint Replenishment Problem (JRP)
 * 
 * Hoàn toàn độc lập với Database và Framework (Clean Architecture).
 */

export type TruckloadTier = '5T' | '10T' | '15T' | '30T_BULK';

export interface OpenPoOption {
  poNumber: string;
  remainQtyKg: number;
  etaDate: string;
}

export interface ExistingPlan {
  planDate: string;
  planQtyKg: number;
}

export interface ConsolidationInputItem {
  materialId: number;
  materialCode: string;
  materialName: string;
  supplierId: number;
  supplierCode: string;
  supplierName: string;
  bagKg: number | null;
  isBulk?: boolean;
  stdDailyKg: number;
  currentStockKg: number;
  safetyDays: number;
  warningDays?: number;
  openPos?: OpenPoOption[];
  existingPlans?: ExistingPlan[];
}

export interface ConsolidatedTripItem {
  materialId: number;
  materialCode: string;
  materialName: string;
  planQtyKg: number;
  planQtyTons: number;
  bagCount: number;
  poNumber: string | null;
  isMustOrder: boolean;
  reason: string;
}

export interface ConsolidatedTrip {
  tripId: string;
  supplierId: number;
  supplierCode: string;
  supplierName: string;
  planDate: string; // YYYY-MM-DD
  dayOfWeek: number; // 1: T2, ..., 6: T7
  dayName: string;
  truckloadTier: TruckloadTier;
  truckCapacityKg: number;
  totalTripKg: number;
  totalTripTons: number;
  fillRatePct: number;
  items: ConsolidatedTripItem[];
  tripNotes: string;
}

export interface AcademicJrpCostModel {
  individualTripsCount: number;
  individualEstimatedCostVnd: number;
  consolidatedTripsCount: number;
  consolidatedCostVnd: number;
  costSavingsVnd: number;
  costSavingsPct: number;
  canOrderPolicy: {
    mustOrderThresholdDesc: string;
    canOrderThresholdDesc: string;
    orderUpToLevelDesc: string;
    fixedCostPerTripVnd: Record<TruckloadTier, number>;
  };
}

export interface ConsolidationEngineResult {
  weekStartDate: string;
  factoryId: number;
  totalTrips: number;
  totalVolumeKg: number;
  totalVolumeTons: number;
  averageFillRatePct: number;
  tripsSavedCount: number;
  trips: ConsolidatedTrip[];
  costAnalysis: AcademicJrpCostModel;
}

// Định mức tải trọng xe tải chuẩn (Kg)
export const TRUCK_CAPACITIES: Record<TruckloadTier, number> = {
  '5T': 5000,
  '10T': 10000,
  '15T': 15000,
  '30T_BULK': 30000,
};

// Chi phí vận chuyển cố định ước tính theo chuyến (VNĐ / chuyến)
export const TRUCK_FIXED_COSTS: Record<TruckloadTier, number> = {
  '5T': 900000,
  '10T': 1400000,
  '15T': 1800000,
  '30T_BULK': 3000000,
};

const DAY_NAMES = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

/**
 * Làm tròn lên bội số nguyên bao (hoặc 1000kg nếu hàng xá)
 */
export function roundToPackaging(qtyKg: number, bagKg: number | null, isBulk: boolean = false): number {
  if (qtyKg <= 0) return 0;
  if (isBulk || !bagKg || bagKg <= 0) {
    // Hàng xá làm tròn lên bội số 1.000 kg (1 tấn)
    return Math.ceil(qtyKg / 1000) * 1000;
  }
  // Hàng bao làm tròn lên bội số nguyên bao
  return Math.ceil(qtyKg / bagKg) * bagKg;
}

/**
 * Chọn tải trọng xe tải FTL phù hợp nhất với khối lượng cần chở
 */
export function selectBestTruckTier(totalKg: number, isBulk: boolean): TruckloadTier {
  if (isBulk || totalKg > 15000) {
    return '30T_BULK';
  }
  if (totalKg <= 5000) {
    return '5T';
  }
  if (totalKg <= 10000) {
    return '10T';
  }
  return '15T';
}

/**
 * Thuật toán JRP Truckload Consolidation Engine (BR-36b)
 */
export function consolidateDeliveries(
  weekStartDate: string,
  factoryId: number,
  items: ConsolidationInputItem[],
): ConsolidationEngineResult {
  // Parse ngày bắt đầu tuần (Thứ Hai)
  const [startY, startM, startD] = weekStartDate.split('-').map(Number);
  const weekStart = new Date(Date.UTC(startY, startM - 1, startD));

  // Tập hợp các ngày trong tuần (T2 đến T7, loại bỏ Chủ Nhật)
  const workDays: Array<{ dateStr: string; dayOfWeek: number; dayName: string }> = [];
  for (let offset = 0; offset < 6; offset++) {
    const d = new Date(weekStart);
    d.setUTCDate(weekStart.getUTCDate() + offset);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const dow = d.getUTCDay(); // 1: T2 ... 6: T7
    workDays.push({
      dateStr: `${yyyy}-${mm}-${dd}`,
      dayOfWeek: dow,
      dayName: DAY_NAMES[dow],
    });
  }

  // 1. Phân nhóm theo Nhà Cung Cấp
  const supplierGroups = new Map<number, ConsolidationInputItem[]>();
  for (const item of items) {
    if (!supplierGroups.has(item.supplierId)) {
      supplierGroups.set(item.supplierId, []);
    }
    supplierGroups.get(item.supplierId)!.push(item);
  }

  const generatedTrips: ConsolidatedTrip[] = [];
  let tripCounter = 1;
  let individualTripsCount = 0;

  // 2. Duyệt từng Nhà Cung Cấp để gom chuyến FTL
  for (const [supplierId, supItems] of supplierGroups.entries()) {
    const firstItem = supItems[0];
    const supplierCode = firstItem.supplierCode;
    const supplierName = firstItem.supplierName;

    // Phân tích trạng thái từng mã của NCC này
    interface EvaluatedItem {
      item: ConsolidationInputItem;
      isMustOrder: boolean;
      mustOrderDate: string; // Ngày cần hàng khẩn cấp
      mustOrderDayIndex: number; // 0..5
      deficitKg: number;
      allocatedSoFarKg: number;
    }

    const evaluated: EvaluatedItem[] = [];

    for (const it of supItems) {
      const d = it.stdDailyKg || 0;
      const safetyStock = d * (it.safetyDays || 7);
      const warningStock = d * (it.warningDays || 15);
      const currentStock = it.currentStockKg;

      // Tính tổng hàng đã lên lịch trong tuần
      const scheduledInWeek = (it.existingPlans || []).reduce((acc, p) => acc + p.planQtyKg, 0);
      const netEffective = currentStock + scheduledInWeek;

      // Ước tính số ngày còn đủ hàng
      const remainingDays = d > 0 ? (netEffective - safetyStock) / d : 999;

      let isMust = false;
      let targetDayIndex = 2; // Mặc định giữa tuần (Thứ Tư)
      let deficit = 0;

      if (d > 0) {
        if (remainingDays <= 3) {
          // Rơi xuống ngưỡng an toàn trong 3 ngày đầu tuần -> Cần hàng đầu tuần (Thứ Hai / Thứ Ba)
          isMust = true;
          targetDayIndex = Math.max(0, Math.min(2, Math.floor(remainingDays)));
          deficit = Math.max(safetyStock - currentStock + d * 7, d * 7);
        } else if (remainingDays <= 7) {
          // Rơi xuống ngưỡng an toàn cuối tuần -> Cần hàng giữa/cuối tuần (Thứ Tư / Thứ Năm)
          isMust = true;
          targetDayIndex = Math.min(4, Math.floor(remainingDays));
          deficit = Math.max(safetyStock - currentStock + d * 7, d * 7);
        } else if (remainingDays <= 14) {
          // Vùng Can-Order: Có thể gom thêm nếu xe còn chỗ trống
          isMust = false;
          targetDayIndex = 3;
          deficit = d * 5; // Gom lượng tiêu hao 5 ngày
        }
      }

      if (deficit > 0) {
        evaluated.push({
          item: it,
          isMustOrder: isMust,
          mustOrderDate: workDays[targetDayIndex]?.dateStr || workDays[2].dateStr,
          mustOrderDayIndex: targetDayIndex,
          deficitKg: roundToPackaging(deficit, it.bagKg, it.isBulk),
          allocatedSoFarKg: 0,
        });
      }
    }

    // Nếu không có mã nào cần hàng -> bỏ qua NCC này
    if (evaluated.length === 0) continue;

    // Đếm số chuyến nếu giao đơn lẻ
    individualTripsCount += evaluated.length;

    // Tách riêng các mã Must-Order và Can-Order
    const mustOrders = evaluated.filter((e) => e.isMustOrder);
    const canOrders = evaluated.filter((e) => !e.isMustOrder);

    // Nếu không có Must-Order nào trong tuần này thì không nhất thiết phải điều xe
    if (mustOrders.length === 0) continue;

    // Gom xe: Nhóm theo ngày giao tối ưu
    // Tìm ngày giao khẩn cấp nhất trong nhóm Must-Order
    mustOrders.sort((a, b) => a.mustOrderDayIndex - b.mustOrderDayIndex);
    const primaryDayIndex = mustOrders[0].mustOrderDayIndex;
    const targetWorkDay = workDays[primaryDayIndex] || workDays[2];

    const hasBulk = supItems.some((s) => s.isBulk);

    // Tính tổng nhu cầu Must-Order của NCC này
    const totalMustKg = mustOrders.reduce((sum, m) => sum + m.deficitKg, 0);

    // Chọn tải trọng xe tối ưu
    let tier = selectBestTruckTier(totalMustKg, hasBulk);
    let capacity = TRUCK_CAPACITIES[tier];

    // Xếp hàng vào xe (Bin Packing)
    const tripItems: ConsolidatedTripItem[] = [];
    let currentPayload = 0;

    // 1. Nạp toàn bộ các mã Must-Order vào xe
    for (const m of mustOrders) {
      let loadKg = m.deficitKg;
      // Nếu vượt dung tích xe 15T (và không phải hàng xá 30T), kẹp trần
      if (!hasBulk && currentPayload + loadKg > capacity && tier === '15T') {
        loadKg = capacity - currentPayload;
        loadKg = roundToPackaging(loadKg, m.item.bagKg, m.item.isBulk);
      }

      if (loadKg <= 0) continue;

      // Khấu trừ FIFO PO Pending
      let matchedPo: string | null = null;
      if (m.item.openPos && m.item.openPos.length > 0) {
        matchedPo = m.item.openPos[0].poNumber;
      }

      const bagSize = m.item.bagKg || 25;
      const bagCount = m.item.isBulk ? 0 : Math.round(loadKg / bagSize);

      tripItems.push({
        materialId: m.item.materialId,
        materialCode: m.item.materialCode,
        materialName: m.item.materialName,
        planQtyKg: loadKg,
        planQtyTons: loadKg / 1000,
        bagCount,
        poNumber: matchedPo,
        isMustOrder: true,
        reason: `Mã bắt buộc (Must-Order): Tồn chạm ngưỡng an toàn ngày ${targetWorkDay.dayName}`,
      });

      currentPayload += loadKg;
      m.allocatedSoFarKg += loadKg;
    }

    // 2. Can-Order Fitting: Nếu xe còn dư tải trọng (và chưa đạt tối thiểu 70%), gom thêm các mã Can-Order
    let remainingTruckSpace = capacity - currentPayload;

    if (remainingTruckSpace > 0 && !hasBulk) {
      for (const c of canOrders) {
        if (remainingTruckSpace <= 500) break; // Dư quá ít không đủ 1 bao/pallet thì dừng

        const bagSize = c.item.bagKg || 25;
        let addKg = Math.min(remainingTruckSpace, c.deficitKg);
        addKg = roundToPackaging(addKg, bagSize, false);

        if (addKg > remainingTruckSpace) {
          // Lùi 1 bao nếu bị tràn xe
          addKg = Math.max(0, Math.floor(remainingTruckSpace / bagSize) * bagSize);
        }

        if (addKg >= bagSize * 4) {
          // Tối thiểu 4 bao (100kg) mới gom
          let matchedPo: string | null = null;
          if (c.item.openPos && c.item.openPos.length > 0) {
            matchedPo = c.item.openPos[0].poNumber;
          }

          tripItems.push({
            materialId: c.item.materialId,
            materialCode: c.item.materialCode,
            materialName: c.item.materialName,
            planQtyKg: addKg,
            planQtyTons: addKg / 1000,
            bagCount: Math.round(addKg / bagSize),
            poNumber: matchedPo,
            isMustOrder: false,
            reason: `Gom lấp đầy xe (Can-Order JRP): Bổ sung dự phòng gộp chuyến xe ${tier}`,
          });

          currentPayload += addKg;
          remainingTruckSpace -= addKg;
          c.allocatedSoFarKg += addKg;
        }
      }
    }

    // Nếu sau khi gom mà tải trọng thực tế nhỏ hơn 5T và đã chọn xe lớn, co lại xe nhỏ hơn
    if (!hasBulk) {
      if (currentPayload <= 5000) {
        tier = '5T';
        capacity = 5000;
      } else if (currentPayload <= 10000) {
        tier = '10T';
        capacity = 10000;
      } else {
        tier = '15T';
        capacity = 15000;
      }
    }

    const fillRate = capacity > 0 ? (currentPayload / capacity) * 100 : 100;

    if (tripItems.length > 0) {
      const tripId = `TRIP-${weekStartDate.replace(/-/g, '')}-${supplierCode}-${tripCounter++}`;
      generatedTrips.push({
        tripId,
        supplierId,
        supplierCode,
        supplierName,
        planDate: targetWorkDay.dateStr,
        dayOfWeek: targetWorkDay.dayOfWeek,
        dayName: targetWorkDay.dayName,
        truckloadTier: tier,
        truckCapacityKg: capacity,
        totalTripKg: currentPayload,
        totalTripTons: currentPayload / 1000,
        fillRatePct: Number(fillRate.toFixed(1)),
        items: tripItems,
        tripNotes: `Chuyến xe gom JRP ${tier} (${tripItems.length} mã NL) - Đầy tải ${fillRate.toFixed(1)}%`,
      });
    }
  }

  // 3. Tính toán các chỉ số tổng hợp và Mô hình Chi phí Học thuật (JRP Cost Model)
  const totalVolumeKg = generatedTrips.reduce((sum, t) => sum + t.totalTripKg, 0);
  const totalTrips = generatedTrips.length;
  const averageFillRatePct =
    totalTrips > 0
      ? Number(
          (
            generatedTrips.reduce((sum, t) => sum + t.fillRatePct, 0) / totalTrips
          ).toFixed(1),
        )
      : 0;

  const tripsSavedCount = Math.max(0, individualTripsCount - totalTrips);

  // Tính chi phí kịch bản đơn lẻ (không gom, mỗi mã thiếu tự điều xe)
  let individualEstimatedCostVnd = 0;
  for (const item of items) {
    if (item.stdDailyKg > 0 && item.currentStockKg < (item.stdDailyKg * (item.safetyDays || 7))) {
      const deficit = Math.max(0, (item.stdDailyKg * (item.safetyDays || 7)) - item.currentStockKg + item.stdDailyKg * 7);
      const singleTier = selectBestTruckTier(deficit, item.isBulk || false);
      individualEstimatedCostVnd += TRUCK_FIXED_COSTS[singleTier];
    }
  }
  if (individualEstimatedCostVnd === 0 && individualTripsCount > 0) {
    individualEstimatedCostVnd = individualTripsCount * TRUCK_FIXED_COSTS['10T'];
  }

  // Tính chi phí kịch bản gom chuyến (JRP)
  const consolidatedCostVnd = generatedTrips.reduce(
    (sum, trip) => sum + (TRUCK_FIXED_COSTS[trip.truckloadTier] || TRUCK_FIXED_COSTS['15T']),
    0,
  );

  const costSavingsVnd = Math.max(0, individualEstimatedCostVnd - consolidatedCostVnd);
  const costSavingsPct =
    individualEstimatedCostVnd > 0
      ? Number(((costSavingsVnd / individualEstimatedCostVnd) * 100).toFixed(1))
      : 0;

  return {
    weekStartDate,
    factoryId,
    totalTrips,
    totalVolumeKg,
    totalVolumeTons: totalVolumeKg / 1000,
    averageFillRatePct,
    tripsSavedCount,
    trips: generatedTrips,
    costAnalysis: {
      individualTripsCount,
      individualEstimatedCostVnd,
      consolidatedTripsCount: totalTrips,
      consolidatedCostVnd,
      costSavingsVnd,
      costSavingsPct,
      canOrderPolicy: {
        mustOrderThresholdDesc: 's_i: Mức kích hoạt bắt buộc khi tồn chạm ngưỡng an toàn L = d * SafetyDays',
        canOrderThresholdDesc: 'c_i: Mức có thể đặt kèm khi tồn rơi vào vùng dự phòng 7-14 ngày để lấp đầy xe',
        orderUpToLevelDesc: 'S_i: Mức trần bổ sung tối đa theo tải trọng xe (15T / 30T) và ngưỡng Overstock',
        fixedCostPerTripVnd: TRUCK_FIXED_COSTS,
      },
    },
  };
}

export const runConsolidationEngine = consolidateDeliveries;
