/**
 * Automated Verification Test Suite for TASK-07 (F05: Executive Dashboard & Heatmap Matrix)
 * Run: node test/test-task-07.js
 */

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

async function runTests() {
  console.log('======================================================================');
  console.log('🚀 RUNNING AUTOMATED TESTS FOR TASK-07 (F05: DASHBOARD & HEATMAP)');
  console.log('======================================================================\n');

  // Đăng nhập Admin
  const loginRes = await apiFetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@1234' }),
  });
  const token = loginRes.body?.data?.token;
  assert(Boolean(token), '[Auth] Đăng nhập Admin lấy JWT Token thành công');
  const authHeaders = { Authorization: `Bearer ${token}` };

  // =========================================================================
  // 1. KIỂM TRA GET /api/v1/dashboard/summary (AC-07.01)
  // =========================================================================
  console.log('\n--- [1] Dashboard Summary & Single-Point Calculation (AC-07.01) ---');
  const [summaryRes, posRes] = await Promise.all([
    apiFetch('/dashboard/summary', { headers: authHeaders }),
    apiFetch('/positions?pageSize=all', { headers: authHeaders }),
  ]);

  const sumData = summaryRes.body?.data;
  const posData = posRes.body?.data;

  assert(
    summaryRes.status === 200 && Boolean(sumData),
    '[AC-07.01a] GET /api/v1/dashboard/summary phản hồi HTTP 200 OK',
  );

  const lc = sumData?.levelCounts || {};
  const sumOf5Levels =
    (lc.critical || 0) +
    (lc.warning || 0) +
    (lc.balanced || 0) +
    (lc.overstock || 0) +
    (lc.noDemand || 0);

  assert(
    lc.total > 0 && lc.total === sumOf5Levels,
    `[AC-07.01b] Bảo toàn số lượng 5 thẻ mức cảnh báo: Total (${lc.total}) = CRITICAL (${lc.critical}) + WARNING (${lc.warning}) + BALANCED (${lc.balanced}) + OVERSTOCK (${lc.overstock}) + NO_DEMAND (${lc.noDemand})`,
  );

  assert(
    lc.total === posData?.summaryCounts?.TOTAL &&
      lc.critical === posData?.summaryCounts?.CRITICAL &&
      lc.warning === posData?.summaryCounts?.WARNING &&
      lc.balanced === posData?.summaryCounts?.BALANCED &&
      lc.overstock === posData?.summaryCounts?.OVERSTOCK &&
      lc.noDemand === posData?.summaryCounts?.NO_DEMAND,
    '[AC-07.01c] Số liệu 5 mức trên Dashboard khớp 100% với Bảng vị thế F04 (DEC-04 Single-point Calculation)',
  );

  assert(
    sumData?.lastImport?.batchType === 'DAILY_SET' &&
      sumData?.lastImport?.snapshotDate === '2026-10-06' &&
      sumData?.lastImport?.cutoffDate === '2026-10-07',
    '[AC-07.01d] Hiển thị chính xác thông tin lô nạp DAILY_SET mới nhất (SnapshotDate=2026-10-06, CutoffDate=2026-10-07)',
    `Got lastImport=${JSON.stringify(sumData?.lastImport)}`,
  );

  assert(
    sumData?.isStale === true &&
      typeof sumData?.staleAlertMessage === 'string' &&
      sumData.staleAlertMessage.includes('06/10/2026'),
    '[AC-07.01e] Phát hiện dữ liệu cũ quá 2 ngày (BR-40) và trả về thông điệp cảnh báo chuẩn tiếng Việt',
    `Got isStale=${sumData?.isStale}, msg=${sumData?.staleAlertMessage}`,
  );

  assert(
    typeof sumData?.blockedStock?.pairCount === 'number' &&
      typeof sumData?.blockedStock?.totalKg === 'number' &&
      typeof sumData?.flagCounts?.reorderNeeded === 'number' &&
      typeof sumData?.flagCounts?.usageDeviation === 'number',
    '[AC-07.01f] Trả về đầy đủ thống kê tồn bị khóa (blockedStock) và thống kê cờ dữ liệu (flagCounts)',
  );

  // =========================================================================
  // 2. KIỂM TRA GET /api/v1/dashboard/matrix (AC-07.02)
  // =========================================================================
  console.log('\n--- [2] Heatmap Matrix Structure & Sorting (AC-07.02) ---');
  const matrixRes = await apiFetch('/dashboard/matrix', {
    headers: authHeaders,
  });
  const matData = matrixRes.body?.data;

  assert(
    matrixRes.status === 200 && Boolean(matData),
    '[AC-07.02a] GET /api/v1/dashboard/matrix phản hồi HTTP 200 OK',
  );

  const colCodes = (matData?.columns || []).map((c) => c.factoryCode);
  assert(
    colCodes.length === 6 &&
      colCodes[0] === 'DN' &&
      colCodes[1] === 'BD' &&
      colCodes[2] === 'VL2' &&
      colCodes[3] === 'HG' &&
      colCodes[4] === 'BD1' &&
      colCodes[5] === 'BD2',
    '[AC-07.02b] Trục cột Ma trận nhiệt hiển thị đủ 6 nhà máy theo đúng thứ tự chuẩn: DN, BD, VL2, HG, BD1, BD2',
    `Got columns=${colCodes.join(', ')}`,
  );

  const rows = matData?.rows || [];
  assert(
    rows.length >= 4 &&
      rows[0].worstSeverity <= rows[rows.length - 1].worstSeverity,
    '[AC-07.02c] Trục dòng Nguyên liệu tự động sắp xếp ưu tiên nguyên liệu có mức cảnh báo nghiêm trọng nhất lên đầu bảng',
  );

  const row0014 = rows.find((r) => r.materialCode === '0014');
  const cellDn0014 = row0014?.cells?.find((c) => c.factoryCode === 'DN');
  const cellUntracked = row0014?.cells?.find((c) => c.isTracked === false);

  assert(
    Boolean(cellDn0014) &&
      cellDn0014.isTracked === true &&
      cellDn0014.warningLevel === 'CRITICAL' &&
      cellDn0014.doi === 5 &&
      cellDn0014.doiDisplay === 5 &&
      cellDn0014.hasWarningDot === true,
    '[AC-07.02d] Ô (DN, 0014) trên Ma trận nhiệt hiển thị đúng isTracked=true, CRITICAL, DOI=5.0 và hasWarningDot=true',
    `Got cell=${JSON.stringify(cellDn0014)}`,
  );

  assert(
    Boolean(cellUntracked) &&
      cellUntracked.isTracked === false &&
      cellUntracked.warningLevel === null &&
      cellUntracked.doi === null,
    '[AC-07.02e] Ô của cặp không nằm trong Plant Items có isTracked=false, warningLevel=null (ô gạch chéo)',
  );

  assert(
    matData?.meta?.trackedCellCount === lc.total,
    `[AC-07.02f] Tổng số ô đang theo dõi trên Ma trận nhiệt (${matData?.meta?.trackedCellCount}) khớp đúng tổng số cặp trên Thẻ chỉ số (${lc.total})`,
  );

  // =========================================================================
  // 3. KIỂM TRA BỘ LỌC TRÊN DASHBOARD (AC-07.03)
  // =========================================================================
  console.log('\n--- [3] Dashboard Filters Synchronization (AC-07.03) ---');
  const [filterSumRes, filterMatRes] = await Promise.all([
    apiFetch('/dashboard/summary?search=0014', { headers: authHeaders }),
    apiFetch('/dashboard/matrix?search=0014', { headers: authHeaders }),
  ]);

  assert(
    filterSumRes.status === 200 &&
      filterMatRes.status === 200 &&
      filterMatRes.body?.data?.rows?.length === 1 &&
      filterMatRes.body.data.rows[0].materialCode === '0014' &&
      filterSumRes.body?.data?.levelCounts?.total ===
        filterMatRes.body?.data?.meta?.trackedCellCount,
    '[AC-07.03a] Lọc theo từ khóa search=0014 cập nhật đồng bộ cả Thẻ chỉ số và Ma trận nhiệt',
  );

  const dnFactoryId = matData.columns[0].factoryId;
  const factoryMatRes = await apiFetch(
    `/dashboard/matrix?factoryId=${dnFactoryId}`,
    { headers: authHeaders },
  );
  assert(
    factoryMatRes.status === 200 &&
      factoryMatRes.body?.data?.columns?.length === 1 &&
      factoryMatRes.body.data.columns[0].factoryCode === 'DN',
    '[AC-07.03b] Lọc theo factoryId trên Ma trận nhiệt thu gọn trục cột về đúng nhà máy đang chọn',
  );

  // =========================================================================
  // 4. KIỂM TRA PHẠM VI NHÀ MÁY CHO VAI TRÒ FACTORY (AC-07.04)
  // =========================================================================
  console.log('\n--- [4] Factory Scope Isolation on Dashboard (AC-07.04) ---');
  const factoryUsername = `factory_f05_${Date.now()}`;
  const createUserRes = await apiFetch('/users', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: factoryUsername,
      initialPassword: 'Factory@1234',
      fullName: 'Nhân viên Nhà máy ĐN (F05)',
      email: `${factoryUsername}@premix.vn`,
      roleCode: 'FACTORY',
      factoryIds: [dnFactoryId],
    }),
  });
  const createdUserId =
    createUserRes.body?.data?.user?.userId || createUserRes.body?.data?.userId;

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

  const [facSumRes, facMatRes] = await Promise.all([
    apiFetch('/dashboard/summary', { headers: factoryHeaders }),
    apiFetch('/dashboard/matrix', { headers: factoryHeaders }),
  ]);

  assert(
    facMatRes.status === 200 &&
      facMatRes.body?.data?.columns?.length === 1 &&
      facMatRes.body.data.columns[0].factoryCode === 'DN' &&
      facSumRes.body?.data?.levelCounts?.total ===
        facMatRes.body?.data?.meta?.trackedCellCount,
    '[AC-07.04a] Tài khoản vai trò FACTORY chỉ nhìn thấy cột nhà máy được phân công (DN) trên Ma trận nhiệt và Thẻ chỉ số',
  );

  const otherFactoryId = matData.columns[1].factoryId;
  const forbiddenSumRes = await apiFetch(
    `/dashboard/summary?factoryId=${otherFactoryId}`,
    { headers: factoryHeaders },
  );
  assert(
    forbiddenSumRes.status === 403,
    '[AC-07.04b] Tài khoản FACTORY truy vấn Dashboard của nhà máy không được phân công bị chặn HTTP 403 Forbidden',
  );

  // Dọn dẹp user test
  if (createdUserId) {
    await apiFetch(`/users/${createdUserId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
  }

  console.log('\n======================================================================');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test error:', err);
  process.exit(1);
});
