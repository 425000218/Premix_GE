/**
 * Automated Verification Test Suite for TASK-06 (F04a: Stock Position Engine & Table)
 * Run: node test/test-task-06.js
 */
import {
  calculatePosition,
  normalizeDoi12,
  DEFAULT_SYSTEM_POSITION_CONFIG,
} from '../dist/modules/positions/domain/position-calculator.js';

const BASE_URL = 'http://localhost:3000/api/v1';
let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `-> ${detail}` : ''}`);
    failed++;
  }
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function makeBaseInput(overrides = {}) {
  return {
    snapshotDate: '2026-10-11',
    todayVn: '2026-10-12',
    latestSnapshotDate: '2026-10-11',
    hasPoPendingInSnapshot: true,
    factoryId: 1,
    factoryCode: 'DN',
    factoryName: 'Nhà máy Đồng Nai',
    region: 'SOUTH',
    materialId: 1,
    materialCode: '0014',
    materialName: 'Vitamin Premix Broiler',
    category: 'PREMIX',
    itemGroup: 'Premix',
    packingSpec: 'Bao 25kg',
    bagKg: 25,
    uom: 'kg',
    pic: 'Nguyễn Kế Hoạch',
    displayDecimals: 1,
    isTracked: true,
    sohKg: 2800,
    blockedKg: 0,
    activeBlockCount: 0,
    forecastKg: 2800, // stdDailyKg = 2800 / 28 = 100 kg/ngày
    forecastVersionDate: '2026-10-01T00:00:00Z',
    demandOverrideKg: null,
    hasActiveOverride: false,
    overrideEffectiveDate: null,
    wipIssueMtdKg: 500,
    activeDays: 5, // actualDailyKg = 500 / 5 = 100 kg/ngày
    prevMonthWipIssueKg: 2500,
    prevMonthActiveDays: 25,
    hasWipIssueInWindow: true,
    poPendingKg: 2000,
    poPendingCount: 1,
    latePoCount: 0,
    transitInKg: 0,
    transitCount: 0,
    hasPairNotInMasterIssue: false,
    systemConfig: { ...DEFAULT_SYSTEM_POSITION_CONFIG },
    pairThreshold: null,
    ...overrides,
  };
}

async function runTests() {
  console.log('=================================================================');
  console.log('🚀 RUNNING AUTOMATED TESTS FOR TASK-06 (F04a: POSITION ENGINE)');
  console.log('=================================================================\n');

  // =========================================================================
  // PHẦN 1: UNIT TESTS PURE DOMAIN ENGINE (AC-06.01)
  // =========================================================================
  console.log('--- [1] Pure Domain Engine Unit Tests (AC-06.01) ---');

  // 1.1: Chuẩn hóa 12 chữ số có nghĩa (BR-09a)
  const noisyBelow7 = 6.999999999999999;
  const noisyAbove7 = 7.000000000000001;
  assert(
    normalizeDoi12(noisyBelow7) === 7 && normalizeDoi12(noisyAbove7) === 7,
    '[AC-06.01a] normalizeDoi12 khử triệt để sai số dấu phẩy động IEEE 754 quanh mốc 7.0',
  );

  // 1.2: Biên phân loại CRITICAL vs WARNING tại mốc 7.0 ngày
  const posExact7 = calculatePosition(
    makeBaseInput({ sohKg: 700, forecastKg: 2800, wipIssueMtdKg: 500, activeDays: 5 }), // d = 100, doi = 7.0
  );
  assert(
    posExact7.doi === 7 && posExact7.warningLevel === 'WARNING',
    '[AC-06.01b] DOI = 7.0 ngày (CriticalDays = 7 <= DOI < 15) phân loại chính xác là WARNING',
    `Got doi=${posExact7.doi}, level=${posExact7.warningLevel}`,
  );
  assert(
    posExact7.stockoutDate === '2026-10-18',
    '[AC-06.01c] Ngày hết hàng dự kiến = C (2026-10-11) + floor(7.0) = 2026-10-18',
    `Got stockoutDate=${posExact7.stockoutDate}`,
  );

  const posBelow7 = calculatePosition(
    makeBaseInput({ sohKg: 690, forecastKg: 2800, wipIssueMtdKg: 500, activeDays: 5 }), // d = 100, doi = 6.9
  );
  assert(
    posBelow7.doi === 6.9 && posBelow7.warningLevel === 'CRITICAL',
    '[AC-06.01d] DOI = 6.9 ngày (< 7) phân loại chính xác là CRITICAL',
  );

  // 1.3: Tồn bị khóa vượt SOH (BR-03, BR-04a)
  const posBlockedExceeds = calculatePosition(
    makeBaseInput({ sohKg: 1000, blockedKg: 1500 }),
  );
  assert(
    posBlockedExceeds.availableKg === 0 &&
      posBlockedExceeds.warningLevel === 'CRITICAL' &&
      posBlockedExceeds.flagCodes.includes('BLOCKED_EXCEEDS_SOH'),
    '[AC-06.01e] BlockedKg > SohKg -> availableKg = 0, mức CRITICAL và bật cờ BLOCKED_EXCEEDS_SOH (BR-04a)',
  );

  // 1.4: Fallback đầu tháng khi ActiveDays < 3 (BR-07)
  const posEarlyMonth = calculatePosition(
    makeBaseInput({
      sohKg: 1800,
      forecastKg: 2800, // stdDaily = 100
      wipIssueMtdKg: 160,
      activeDays: 2, // nhịp tháng này = 80
      prevMonthWipIssueKg: 3000,
      prevMonthActiveDays: 20, // nhịp tháng trước = 150
    }),
  );
  assert(
    posEarlyMonth.actualDailyKg === 150 &&
      posEarlyMonth.dailyKg === 150 &&
      posEarlyMonth.flagCodes.includes('FEW_ACTIVE_DAYS') &&
      posEarlyMonth.flagCodes.includes('PREV_MONTH_USAGE'),
    '[AC-06.01f] Đầu tháng ActiveDays = 2 (< 3) mượn nhịp tiêu hao tháng trước (150 kg/ngày) và bật cờ PREV_MONTH_USAGE + FEW_ACTIVE_DAYS (BR-07)',
    `Got actualDailyKg=${posEarlyMonth.actualDailyKg}, flags=${posEarlyMonth.flagCodes}`,
  );

  // 1.5: Quy tắc nguyên liệu dùng ít <= 1.000 kg/tháng (BR-10, Q-011)
  const posLowUsage80Days = calculatePosition(
    makeBaseInput({
      sohKg: 1600,
      forecastKg: 560, // stdDaily = 20 kg/ngày (cơ sở tiêu hao = 560 <= 1000 -> dùng ít)
      wipIssueMtdKg: 100,
      activeDays: 5, // actualDaily = 20 kg/ngày
    }), // d = 20, doi = 1600 / 20 = 80 ngày (75 < 80 <= 90)
  );
  assert(
    posLowUsage80Days.isLowUsageMaterial === true &&
      posLowUsage80Days.effectiveThresholds.overstockDays === 90 &&
      posLowUsage80Days.warningLevel === 'BALANCED',
    '[AC-06.01g] Nguyên liệu dùng ít (560 kg/tháng <= 1000) có ngưỡng Overstock = 90 ngày -> DOI = 80 ngày vẫn là BALANCED (BR-10)',
    `Got isLow=${posLowUsage80Days.isLowUsageMaterial}, level=${posLowUsage80Days.warningLevel}`,
  );

  const posLowUsage95Days = calculatePosition(
    makeBaseInput({
      sohKg: 1900,
      forecastKg: 560,
      wipIssueMtdKg: 100,
      activeDays: 5,
    }), // doi = 95 > 90
  );
  assert(
    posLowUsage95Days.warningLevel === 'OVERSTOCK',
    '[AC-06.01h] Nguyên liệu dùng ít khi DOI = 95 ngày (> 90) phân loại là OVERSTOCK',
  );

  // 1.6: Cấu hình ghi đè OverstockDays riêng theo cặp thắng quy tắc dùng ít (Mục 3.3.5)
  const posLowUsageWithOverride = calculatePosition(
    makeBaseInput({
      sohKg: 1600, // doi = 80
      forecastKg: 560,
      wipIssueMtdKg: 100,
      activeDays: 5,
      pairThreshold: { overstockDays: 60 },
    }),
  );
  assert(
    posLowUsageWithOverride.effectiveThresholds.overstockDays === 60 &&
      posLowUsageWithOverride.warningLevel === 'OVERSTOCK',
    '[AC-06.01i] Ngưỡng OverstockDays ghi đè riêng của cặp (60 ngày) thắng ngưỡng dùng ít (90 ngày)',
  );

  // 1.7: Trường hợp không có nhu cầu (d = 0 -> NO_DEMAND, BR-11)
  const posNoDemand = calculatePosition(
    makeBaseInput({
      sohKg: 500,
      forecastKg: 0,
      wipIssueMtdKg: 0,
      activeDays: 5,
      prevMonthWipIssueKg: 0,
      prevMonthActiveDays: 0,
      hasWipIssueInWindow: false,
    }),
  );
  assert(
    posNoDemand.dailyKg === 0 &&
      posNoDemand.doi === null &&
      posNoDemand.stockoutDate === null &&
      posNoDemand.warningLevel === 'NO_DEMAND' &&
      posNoDemand.flagCodes.includes('UNUSED_STOCK'),
    '[AC-06.01j] Khi d = 0 -> doi = null, stockoutDate = null, warningLevel = NO_DEMAND, bật cờ UNUSED_STOCK khi SOH > 0',
  );

  // 1.8: Demand Override & Cờ mở rộng (DEMAND_OVERRIDE, FORECAST_NEWER_THAN_OVERRIDE, USAGE_DEVIATION, PO_LATE_RECEIPT, REORDER_NEEDED, STALE_DATA)
  const posFlags = calculatePosition(
    makeBaseInput({
      snapshotDate: '2026-10-10',
      latestSnapshotDate: '2026-10-10',
      todayVn: '2026-10-15', // lệch 5 ngày > 2 -> STALE_DATA
      sohKg: 500,
      poPendingKg: 500,
      transitInKg: 0,
      latePoCount: 2, // -> PO_LATE_RECEIPT
      forecastKg: 2800,
      forecastVersionDate: '2026-10-08T00:00:00Z',
      hasActiveOverride: true,
      demandOverrideKg: 5600, // stdDaily = 200
      overrideEffectiveDate: '2026-10-05T00:00:00Z', // forecastVersionDate > overrideEffectiveDate -> FORECAST_NEWER_THAN_OVERRIDE
      wipIssueMtdKg: 1500,
      activeDays: 5, // actualDaily = 300 (lệch +50% so với 200 > 30% -> USAGE_DEVIATION)
    }),
  );
  assert(
    posFlags.demandSource === 'OVERRIDE' &&
      posFlags.stdDailyKg === 200 &&
      posFlags.actualDailyKg === 300 &&
      posFlags.dailyKg === 300 &&
      posFlags.flagCodes.includes('DEMAND_OVERRIDE') &&
      posFlags.flagCodes.includes('FORECAST_NEWER_THAN_OVERRIDE') &&
      posFlags.flagCodes.includes('USAGE_DEVIATION') &&
      posFlags.flagCodes.includes('PO_LATE_RECEIPT') &&
      posFlags.flagCodes.includes('REORDER_NEEDED') &&
      posFlags.flagCodes.includes('STALE_DATA'),
    '[AC-06.01k] Kích hoạt đầy đủ 6 cờ nghiệp vụ: DEMAND_OVERRIDE, FORECAST_NEWER_THAN_OVERRIDE, USAGE_DEVIATION, PO_LATE_RECEIPT, REORDER_NEEDED, STALE_DATA',
    `Got flags=${posFlags.flagCodes.join(', ')}`,
  );

  // =========================================================================
  // PHẦN 2: API INTEGRATION TESTS (AC-06.02, AC-06.03, AC-06.04)
  // =========================================================================
  console.log('\n--- [2] API Integration Tests (AC-06.02 .. AC-06.04) ---');

  // Đăng nhập Admin
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@1234' }),
  });
  const token = loginRes.body?.data?.token;
  assert(Boolean(token), '[Auth] Đăng nhập Admin lấy JWT Token thành công');

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2.1: GET /api/v1/positions/snapshot-dates
  const snapRes = await apiFetch('/positions/snapshot-dates', {
    headers: authHeaders,
  });
  assert(
    snapRes.status === 200 &&
      Array.isArray(snapRes.body?.data?.items) &&
      snapRes.body.data.items.length >= 1,
    '[AC-06.02a] GET /api/v1/positions/snapshot-dates trả về danh sách ngày chốt hợp lệ',
    `Status=${snapRes.status}`,
  );
  const latestSnap = snapRes.body?.data?.meta?.latestSnapshotDate;
  assert(
    latestSnap === '2026-10-06',
    '[AC-06.02b] Ngày chốt mới nhất trong hệ thống là 2026-10-06 (Cut off 07/10 -> C = 06/10 từ TASK-05)',
    `Got latestSnapshotDate=${latestSnap}`,
  );

  // 2.2: GET /api/v1/positions (Bảng vị thế tồn kho)
  const listRes = await apiFetch('/positions?pageSize=all', {
    headers: authHeaders,
  });
  const listData = listRes.body?.data;
  assert(
    listRes.status === 200 &&
      listData?.snapshotDate === '2026-10-06' &&
      Array.isArray(listData?.items) &&
      listData.items.length >= 4,
    '[AC-06.02c] GET /api/v1/positions trả về danh sách vị thế các cặp theo dõi tại ngày chốt 2026-10-06',
    `Count=${listData?.items?.length}`,
  );

  const dn0014 = listData.items.find(
    (p) => p.factoryCode === 'DN' && p.materialCode === '0014',
  );
  assert(
    Boolean(dn0014) &&
      dn0014.sohKg === 5000 &&
      dn0014.availableKg === 5000 &&
      dn0014.demandMonthKg === 14000 &&
      dn0014.stdDailyKg === 500 &&
      dn0014.actualDailyKg === 1000 &&
      dn0014.dailyKg === 1000 &&
      dn0014.doi === 5 &&
      dn0014.coverDoi === 6 &&
      dn0014.stockoutDate === '2026-10-11' &&
      dn0014.warningLevel === 'CRITICAL',
    '[AC-06.02d] Cặp (DN, 0014) tính toán đúng SOH=5000, Forecast=14000, stdDaily=500, actualDaily=1000, d=1000, DOI=5.0, CoverDOI=6.0, Stockout=2026-10-11, Mức CRITICAL',
    `Got ${JSON.stringify(dn0014)}`,
  );

  // Kiểm tra lọc theo nhà máy (factoryId) & tìm kiếm (search) & phân trang
  const filterFactoryRes = await apiFetch(
    `/positions?factoryId=${dn0014.factoryId}&search=0014&pageSize=2&page=1`,
    { headers: authHeaders },
  );
  assert(
    filterFactoryRes.status === 200 &&
      filterFactoryRes.body?.data?.items?.length === 1 &&
      filterFactoryRes.body.data.items[0].materialCode === '0014',
    '[AC-06.02e] Bộ lọc factoryId + search + phân trang hoạt động chính xác',
  );

  // Kiểm tra lọc theo mức cảnh báo (level)
  const filterLevelRes = await apiFetch(
    `/positions?level=${dn0014.warningLevel}`,
    { headers: authHeaders },
  );
  assert(
    filterLevelRes.status === 200 &&
      filterLevelRes.body?.data?.items?.every(
        (x) => x.warningLevel === dn0014.warningLevel,
      ),
    `[AC-06.02f] Bộ lọc theo mức cảnh báo level=${dn0014.warningLevel} chính xác`,
  );

  // Kiểm tra sắp xếp theo DOI giảm dần
  const sortDoiDescRes = await apiFetch('/positions?sort=doi&order=DESC', {
    headers: authHeaders,
  });
  const doiItems = (sortDoiDescRes.body?.data?.items || []).filter(
    (x) => x.doi !== null,
  );
  const isSortedDesc =
    doiItems.length < 2 || doiItems[0].doi >= doiItems[doiItems.length - 1].doi;
  assert(
    sortDoiDescRes.status === 200 && isSortedDesc,
    '[AC-06.02g] Sắp xếp bảng vị thế theo sort=doi&order=DESC hoạt động chính xác',
  );

  // =========================================================================
  // 2.3: KIỂM SOÁT PHẠM VI NHÀ MÁY CHO VAI TRÒ FACTORY (AC-06.03)
  // =========================================================================
  console.log('\n--- [3] Factory Scope Isolation Tests (AC-06.03) ---');
  const factoryUsername = `factory_f04_${Date.now()}`;
  const createUserRes = await apiFetch('/users', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: factoryUsername,
      initialPassword: 'Factory@1234',
      fullName: 'Nhân viên Nhà máy ĐN',
      email: `${factoryUsername}@premix.vn`,
      roleCode: 'FACTORY',
      factoryIds: [dn0014.factoryId], // Chỉ gán nhà máy DN
    }),
  });
  const createdFactoryUserId =
    createUserRes.body?.data?.user?.userId || createUserRes.body?.data?.userId;
  assert(
    createUserRes.status === 201 && Boolean(createdFactoryUserId),
    '[AC-06.03a] Tạo tài khoản vai trò FACTORY chỉ gán nhà máy DN thành công',
    `Status=${createUserRes.status}, body=${JSON.stringify(createUserRes.body)}`,
  );

  const factoryLoginRes = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: factoryUsername,
      password: 'Factory@1234',
    }),
  });
  const factoryToken = factoryLoginRes.body?.data?.token;
  const factoryHeaders = { Authorization: `Bearer ${factoryToken}` };

  const factoryPosRes = await apiFetch('/positions?pageSize=all', {
    headers: factoryHeaders,
  });
  const factoryPosItems = factoryPosRes.body?.data?.items || [];
  assert(
    factoryPosRes.status === 200 &&
      factoryPosItems.length > 0 &&
      factoryPosItems.every((p) => p.factoryId === dn0014.factoryId),
    '[AC-06.03b] Tài khoản FACTORY khi gọi GET /api/v1/positions chỉ nhìn thấy các cặp thuộc nhà máy được gán (DN)',
  );

  // Thử cố tình truyền factoryId của nhà máy khác (BD = 2) -> Phải bị chặn 403 Forbidden
  const otherFactoryId = dn0014.factoryId === 1 ? 2 : 1;
  const forbiddenPosRes = await apiFetch(
    `/positions?factoryId=${otherFactoryId}`,
    { headers: factoryHeaders },
  );
  assert(
    forbiddenPosRes.status === 403,
    '[AC-06.03c] Tài khoản FACTORY truy cập vị thế nhà máy không được phân công bị chặn HTTP 403 Forbidden',
    `Got status=${forbiddenPosRes.status}`,
  );

  // Dọn dẹp tài khoản test
  await apiFetch(`/users/${createdFactoryUserId}`, {
    method: 'DELETE',
    headers: authHeaders,
  });

  // =========================================================================
  // 2.4: CHI TIẾT CẶP VỊ THẾ (AC-06.04)
  // =========================================================================
  console.log('\n--- [4] Pair Position Detail Endpoint Tests (AC-06.04) ---');
  const detailRes = await apiFetch(
    `/positions/${dn0014.factoryId}/${dn0014.materialId}?snapshotDate=2026-10-06`,
    { headers: authHeaders },
  );
  const detailData = detailRes.body?.data;
  assert(
    detailRes.status === 200 &&
      detailData?.position?.factoryCode === 'DN' &&
      detailData?.position?.materialCode === '0014' &&
      Array.isArray(detailData?.poPendingList) &&
      detailData.poPendingList.length >= 1 &&
      Array.isArray(detailData?.poReceipts) &&
      Array.isArray(detailData?.movementHistory) &&
      Boolean(detailData?.thresholdConfig?.effectiveThresholds),
    '[AC-06.04a] GET /api/v1/positions/:factoryId/:materialId trả về đầy đủ position, poPendingList (kèm tuổi PO), poReceipts, movementHistory, thresholdConfig',
    `Status=${detailRes.status}, body=${JSON.stringify(detailRes.body)}`,
  );

  const notFoundRes = await apiFetch('/positions/99999/99999', {
    headers: authHeaders,
  });
  assert(
    notFoundRes.status === 404,
    '[AC-06.04b] Truy vấn cặp không tồn tại trả về HTTP 404 Not Found',
    `Status=${notFoundRes.status}, body=${JSON.stringify(notFoundRes.body)}`,
  );

  console.log('\n=================================================================');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
