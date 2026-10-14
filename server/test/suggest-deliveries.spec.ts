import { describe, it, expect } from 'vitest';
import {
  suggestDeliveriesForPair,
  addDaysIso,
  diffDaysIso,
  getDayOfWeekIso,
  isWorkingDay,
} from '../src/modules/delivery-plans/domain/suggest-deliveries.js';

describe('Domain: Delivery Suggestions Engine (BR-34 -> BR-36c)', () => {
  it('Xử lý ngày ISO và tránh Chủ Nhật chuẩn xác', () => {
    // 2026-10-06 là Thứ Ba (Day 2)
    expect(getDayOfWeekIso('2026-10-06')).toBe(2);
    expect(isWorkingDay('2026-10-06')).toBe(true);

    // 2026-10-11 là Chủ Nhật (Day 0)
    expect(getDayOfWeekIso('2026-10-11')).toBe(0);
    expect(isWorkingDay('2026-10-11')).toBe(false);

    // Cộng ngày thuần ISO
    expect(addDaysIso('2026-10-06', 1)).toBe('2026-10-07');
    expect(diffDaysIso('2026-10-06', '2026-10-10')).toBe(4);
  });

  it('BR-36a: Tính định mức một chuyến U chuẩn theo 4 nguồn ưu tiên', () => {
    // Nguồn 1: Định mức cặp deliveryQtyKgPair dùng nguyên
    const r1 = suggestDeliveriesForPair({
      snapshotDate: '2026-10-06',
      initialStockKg: 50000,
      dailyDemandKg: 1000,
      safetyDays: 7,
      horizonStartDate: '2026-10-07',
      horizonEndDate: '2026-11-03',
      deliveryQtyKgPair: 28500,
      bagKg: 25,
    });
    expect(r1.unitShipmentKg).toBe(28500);

    // Nguồn 3: Hàng xá mặc định 30.000 kg (BulkDeliveryKg)
    const r2 = suggestDeliveriesForPair({
      snapshotDate: '2026-10-06',
      initialStockKg: 50000,
      dailyDemandKg: 1000,
      safetyDays: 7,
      horizonStartDate: '2026-10-07',
      horizonEndDate: '2026-11-03',
      bagKg: null,
      category: 'Bulk Raw Material',
    });
    expect(r2.unitShipmentKg).toBe(30000);

    // Nguồn 4: Hàng bao làm tròn lên bội số bao (d = 1.200, N = 7 -> 8.400 -> làm tròn theo bao 25kg là 8.400)
    const r3 = suggestDeliveriesForPair({
      snapshotDate: '2026-10-06',
      initialStockKg: 50000,
      dailyDemandKg: 1203,
      safetyDays: 7,
      horizonStartDate: '2026-10-07',
      horizonEndDate: '2026-11-03',
      bagKg: 25,
      systemDeliveryDays: 7,
    });
    // 1203 * 7 = 8421 -> làm tròn lên bội số 25 là 8425
    expect(r3.unitShipmentKg).toBe(8425);
  });

  it('BR-34a & BR-36: Tìm mốc M và đề xuất ngày giao G tránh Chủ Nhật', () => {
    // Tồn khả dụng 15.000 kg, tiêu hao d = 2.000 kg/ngày, an toàn L = 7 ngày = 14.000 kg
    // Ngày C: 2026-10-06 (Thứ 3)
    // Tồn cuối C+1 (2026-10-07, Thứ 4): 15.000 - 2.000 = 13.000 kg (< L 14.000 kg)
    // => Ngày đầu tiên < L là C+1 (2026-10-07).
    // => Mốc M = ngày trước đó = C (2026-10-06).
    // Horizon [E=2026-10-07, H=2026-11-03]. Do M < E, giao trễ vào ngày làm việc đầu tiên >= E: G = 2026-10-07
    const result = suggestDeliveriesForPair({
      snapshotDate: '2026-10-06',
      initialStockKg: 15000,
      dailyDemandKg: 2000,
      safetyDays: 7,
      horizonStartDate: '2026-10-07',
      horizonEndDate: '2026-11-03',
      bagKg: 25,
      systemBulkDeliveryKg: 30000,
      openPos: [
        {
          poNumber: 'PO-TEST-01',
          deliveryDate: '2026-10-01',
          deliverRemainderKg: 50000,
          leadTimeDays: 7,
          supplierId: 10,
        },
      ],
    });

    expect(result.suggestions.length).toBeGreaterThan(0);
    const firstSug = result.suggestions[0];
    expect(firstSug.suggestDate).toBe('2026-10-07');
    expect(firstSug.isLateWarning).toBe(true); // Trễ so với mốc M (do mốc M = C)
    expect(firstSug.poNumber).toBe('PO-TEST-01');
  });

  it('BR-36c: Khấu trừ kế hoạch không PO vào PO cùng NCC theo FIFO, chống đếm trùng', () => {
    // Có 2 PO cùng NCC 10:
    // PO-01: ngày tạo 2026-09-20, dư 10.000 kg
    // PO-02: ngày tạo 2026-09-25, dư 20.000 kg
    // Kế hoạch đã có ngày C+2: 8.000 kg (không có số PO, nhưng cùng NCC 10)
    // Sau khấu trừ BR-36c:
    // PO-01 còn 2.000 kg, PO-02 còn 20.000 kg
    const result = suggestDeliveriesForPair({
      snapshotDate: '2026-10-06',
      initialStockKg: 10000,
      dailyDemandKg: 1000,
      safetyDays: 7, // L = 7.000
      horizonStartDate: '2026-10-07',
      horizonEndDate: '2026-10-15',
      existingPlans: [
        {
          planDate: '2026-10-08',
          planQtyKg: 8000,
          supplierId: 10,
        },
      ],
      openPos: [
        {
          poNumber: 'PO-02',
          deliveryDate: '2026-09-25',
          deliverRemainderKg: 20000,
          leadTimeDays: 7,
          supplierId: 10,
        },
        {
          poNumber: 'PO-01',
          deliveryDate: '2026-09-20',
          deliverRemainderKg: 10000,
          leadTimeDays: 7,
          supplierId: 10,
        },
      ],
    });

    const po1Remain = result.remainingPoPool.find((p) => p.poNumber === 'PO-01')?.deliverRemainderKg;
    // PO-01 ban đầu 10.000, bị trừ 8.000 của kế hoạch không PO -> còn 2.000 kg
    expect(po1Remain).toBeLessThanOrEqual(2000);
  });

  it('BR-36: Báo cờ thiếu nguồn (Shortage) và dừng đề xuất khi hết PO', () => {
    // Tồn 5.000, tiêu hao 2.000/ngày, an toàn 14.000 kg
    // PO chỉ có 5.000 kg
    const result = suggestDeliveriesForPair({
      snapshotDate: '2026-10-06',
      initialStockKg: 5000,
      dailyDemandKg: 2000,
      safetyDays: 7,
      horizonStartDate: '2026-10-07',
      horizonEndDate: '2026-11-03',
      openPos: [
        {
          poNumber: 'PO-LIMITED',
          deliveryDate: '2026-10-01',
          deliverRemainderKg: 5000,
          leadTimeDays: 7,
          supplierId: 5,
        },
      ],
    });

    expect(result.isShortage).toBe(true);
    expect(result.shortageQtyKg).toBeGreaterThan(0);
    expect(result.shortageFromDate).toBeDefined();
  });
});
