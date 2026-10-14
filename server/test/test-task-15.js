/**
 * TEST RUNNER TASK-15 (F07b: JRP Truckload Consolidation Engine - BR-36b)
 * 
 * Kiểm thử toàn diện 6 tiêu chí nghiệp vụ:
 * 1. AC-15.01: Pure Domain JRP Heuristic (Must-Order triggers trip, Can-Order fills truck)
 * 2. AC-15.02: FTL Tier Selection & Fill Rate % (5T, 10T, 15T, 30T Bulk)
 * 3. AC-15.03: Packaging Rounding (Bội số bao 25kg/50kg)
 * 4. AC-15.04: Sunday Ban (BR-36 - Cấm giao Chủ Nhật)
 * 5. AC-15.05: FIFO Open PO Allocation
 * 6. AC-15.06: API Endpoint /api/v1/delivery-plans/suggest-week integration
 */

import { consolidateDeliveries, roundToPackaging } from '../dist/modules/delivery-plans/domain/consolidation-engine.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName} - ${details}`);
    failedCount++;
  }
}

async function runTask15Tests() {
  console.log('================================================================');
  console.log('RUNNING AUTOMATED TEST SUITE: TASK-15 (F07b JRP CONSOLIDATION)');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // TEST SUITE 1: Quy cách bao & Làm tròn (AC-15.03)
  // -------------------------------------------------------------------------
  console.log('--- SUITE 1: Packaging Spec & Rounding (AC-15.03) ---');
  {
    const r1 = roundToPackaging(480, 25, false);
    assert(r1 === 500, 'AC-15.03a: 480 kg làm tròn lên bội số 25 kg thành 500 kg', `Got: ${r1}`);

    const r2 = roundToPackaging(1010, 50, false);
    assert(r2 === 1050, 'AC-15.03b: 1010 kg làm tròn lên bội số 50 kg thành 1050 kg', `Got: ${r2}`);

    const r3 = roundToPackaging(12345, null, true);
    assert(r3 === 13000, 'AC-15.03c: Hàng xá (Bulk) 12345 kg làm tròn lên 1000 kg thành 13000 kg', `Got: ${r3}`);
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 2: Pure Domain JRP Heuristic & FTL Fitting (AC-15.01, AC-15.02)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Pure Domain JRP & FTL Selection (AC-15.01, AC-15.02) ---');
  {
    const mockItems = [
      {
        materialId: 17,
        materialCode: '0014',
        materialName: 'Premix Heo Con 4%',
        supplierId: 14,
        supplierCode: 'VEND001',
        supplierName: 'Công ty CP Dược Thú Y TW',
        bagKg: 25,
        isBulk: false,
        stdDailyKg: 500,
        currentStockKg: 1000, // Cạn hàng sau 2 ngày -> MUST ORDER
        safetyDays: 3,
        warningDays: 5,
        openPos: [
          { poNumber: 'PO-2026-001', remainQtyKg: 5000, etaDate: '2026-10-14' }
        ],
        existingPlans: []
      },
      {
        materialId: 18,
        materialCode: '0025',
        materialName: 'Premix Gà Đẻ 2.5%',
        supplierId: 14,
        supplierCode: 'VEND001',
        supplierName: 'Công ty CP Dược Thú Y TW',
        bagKg: 25,
        isBulk: false,
        stdDailyKg: 300,
        currentStockKg: 3500, // Còn đủ ~11 ngày, nằm trong ngưỡng CAN-ORDER
        safetyDays: 3,
        warningDays: 15,
        openPos: [
          { poNumber: 'PO-2026-002', remainQtyKg: 4000, etaDate: '2026-10-16' }
        ],
        existingPlans: []
      }
    ];

    const result = consolidateDeliveries('2026-10-12', 1, mockItems);

    assert(result.totalTrips >= 1, 'AC-15.01a: Engine sinh ra ít nhất 1 chuyến xe gom JRP', `Trips: ${result.totalTrips}`);
    const trip1 = result.trips[0];
    assert(trip1.supplierCode === 'VEND001', 'AC-15.01b: Chuyến xe gom đúng mã nhà cung cấp VEND001', `Got: ${trip1.supplierCode}`);
    
    // Kiểm tra xe có gom cả mã 17 và mã 18
    const hasMat17 = trip1.items.some(it => it.materialId === 17);
    const hasMat18 = trip1.items.some(it => it.materialId === 18);
    assert(hasMat17 && hasMat18, 'AC-15.01c: JRP Can-Order gom cả 2 mã nguyên liệu của cùng NCC vào 1 chuyến', `hasMat17=${hasMat17}, hasMat18=${hasMat18}`);

    // Kiểm tra cỡ xe FTL và Fill Rate
    assert(['5T', '10T', '15T'].includes(trip1.truckloadTier), 'AC-15.02a: Cỡ xe thuộc dải FTL tiêu chuẩn (5T, 10T, 15T)', `Tier: ${trip1.truckloadTier}`);
    assert(trip1.fillRatePct >= 50 && trip1.fillRatePct <= 100, `AC-15.02b: Tỷ lệ lấp đầy hợp lệ (Đạt ${trip1.fillRatePct}%)`, `FillRate: ${trip1.fillRatePct}%`);
    assert(trip1.totalTripKg <= trip1.truckCapacityKg, 'AC-15.02c: Tổng tải trọng không vượt trần tải trọng xe', `${trip1.totalTripKg} <= ${trip1.truckCapacityKg}`);
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 3: Sunday Ban & FIFO PO Matching (AC-15.04, AC-15.05)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Sunday Ban & FIFO PO Matching (AC-15.04, AC-15.05) ---');
  {
    const mockItems = [
      {
        materialId: 20,
        materialCode: 'BULK01',
        materialName: 'Cám Xá Cao Cấp',
        supplierId: 99,
        supplierCode: 'VEND-BULK',
        supplierName: 'Tổng kho Cám Xá Miền Nam',
        bagKg: null,
        isBulk: true,
        stdDailyKg: 4000,
        currentStockKg: 2000, // Cạn hàng ngay lập tức
        safetyDays: 2,
        warningDays: 5,
        openPos: [
          { poNumber: 'PO-OLD-001', remainQtyKg: 10000, etaDate: '2026-10-10' },
          { poNumber: 'PO-NEW-002', remainQtyKg: 20000, etaDate: '2026-10-20' },
        ],
        existingPlans: []
      }
    ];

    const result = consolidateDeliveries('2026-10-12', 1, mockItems);

    for (const trip of result.trips) {
      assert(trip.dayOfWeek !== 0, `AC-15.04: Chuyến ${trip.tripId} tuân thủ cấm giao Chủ Nhật (Ngày giao: ${trip.planDate}, DoW: ${trip.dayOfWeek})`, `Failed on: ${trip.planDate}`);
    }

    const bulkTrip = result.trips[0];
    assert(bulkTrip.truckloadTier === '30T_BULK', 'AC-15.02d: Hàng xá tự động chọn xe bồn 30T_BULK', `Got: ${bulkTrip.truckloadTier}`);
    assert(bulkTrip.items[0].poNumber === 'PO-OLD-001', 'AC-15.05: Ưu tiên gắn số PO cũ theo nguyên tắc FIFO', `Po: ${bulkTrip.items[0].poNumber}`);
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 4: Tích hợp API Backend (AC-15.06)
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: API Endpoint Integration (AC-15.06) ---');
  try {
    // Đăng nhập lấy Bearer token
    const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'Admin@1234',
      }),
    });

    const loginData = await loginRes.json();
    const token = loginData?.data?.token || loginData?.token || loginData?.data?.accessToken;
    assert(Boolean(token), 'Đăng nhập Admin API thành công để lấy token');

    // Gọi API suggest với cờ consolidateBySupplier: true
    const suggestRes = await fetch('http://127.0.0.1:3000/api/v1/delivery-plans/suggest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        weekStartDate: '2026-10-12',
        factoryId: 1,
        consolidateBySupplier: true,
      }),
    });

    const suggestJson = await suggestRes.json();
    const data = suggestJson?.data || suggestJson;
    assert(suggestRes.status === 200 || suggestRes.status === 201, 'AC-15.06a: API trả về HTTP 200/201 OK');
    assert(data.consolidated === true, 'AC-15.06b: Kết quả trả về cờ consolidated: true');
    assert(data.summary !== undefined, 'AC-15.06c: Có thông tin tổng kết summary (totalTrips, fillRate, v.v.)');
    assert(Array.isArray(data.trips), 'AC-15.06d: Có danh sách các chuyến xe gom FTL (trips array)');
    assert(Array.isArray(data.suggestedPlans), 'AC-15.06e: Có danh sách suggestedPlans tương thích lưới tuần');

    console.log(`\n  >> Thống kê API: ${data.summary?.totalTrips || 0} chuyến xe, ` +
                `Tổng ${data.summary?.totalVolumeTons || 0} tấn, ` +
                `Tỷ lệ lấp đầy TB ${data.summary?.averageFillRatePct || 0}%, ` +
                `Số chuyến tiết kiệm: ${data.summary?.tripsSavedCount || 0} chuyến`);

  } catch (apiErr) {
    assert(false, 'AC-15.06: API Endpoint suggest execution', apiErr.message);
  }

  // -------------------------------------------------------------------------
  // TỔNG KẾT
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTask15Tests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
