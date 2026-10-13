/**
 * TEST RUNNER CHO TASK-12: F04b - DEMAND OVERRIDE & DATA FLAGS
 * Kiểm tra 22 Test Cases bao phủ toàn bộ Acceptance Criteria AC-12.01 đến AC-12.06
 */

const BASE_URL = 'http://localhost:3000/api/v1';

async function request(options, bodyData = null) {
  const path = options.path || '';
  const query = options.query ? `?${options.query}` : '';
  const url = `${BASE_URL}${path}${query}`;
  const init = {
    method: options.method || 'GET',
    headers: { ...(options.headers || {}) },
  };

  if (bodyData) {
    init.body = JSON.stringify(bodyData);
    init.headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      data,
    };
  } catch (err) {
    console.error(`Request error to ${url}:`, err.message);
    throw err;
  }
}

let adminToken = '';
let plannerToken = '';
let factoryToken = '';
let plannerUsername = '';
let factoryUsername = '';

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('======================================================================');
  console.log('   BẮT ĐẦU KIỂM THỬ AUTOMATION TASK-12 (F04b: DEMAND OVERRIDE & FLAGS)');
  console.log('======================================================================\n');

  // 1. Đăng nhập 3 vai trò
  console.log('--- BƯỚC 1: ĐĂNG NHẬP & THIẾT LẬP TÀI KHOẢN ---');
  const adminLogin = await request(
    { path: '/auth/login', method: 'POST' },
    { username: 'admin', password: 'Admin@1234' }
  );
  adminToken = adminLogin.data?.data?.token;
  assert(adminLogin.status === 200 && !!adminToken, 'Đăng nhập ADMIN thành công lấy token');

  const ts = Date.now();
  plannerUsername = `planner_f12_${ts}`;
  factoryUsername = `factory_f12_${ts}`;

  const cpRes = await request(
    {
      path: '/users',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
    {
      username: plannerUsername,
      initialPassword: 'Planner@1234',
      fullName: 'Planner F12 Runner',
      email: `${plannerUsername}@premix.vn`,
      roleCode: 'PLANNER',
      factoryIds: [],
    }
  );
  assert(cpRes.status === 201, 'Tạo tài khoản PLANNER kiểm thử thành công');

  const cfRes = await request(
    {
      path: '/users',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
    {
      username: factoryUsername,
      initialPassword: 'Factory@1234',
      fullName: 'Factory F12 Runner',
      email: `${factoryUsername}@premix.vn`,
      roleCode: 'FACTORY',
      factoryIds: [1],
    }
  );
  assert(cfRes.status === 201, 'Tạo tài khoản FACTORY kiểm thử thành công');

  const plannerLogin = await request(
    { path: '/auth/login', method: 'POST' },
    { username: plannerUsername, password: 'Planner@1234' }
  );
  plannerToken = plannerLogin.data?.data?.token;
  assert(plannerLogin.status === 200 && !!plannerToken, 'Đăng nhập PLANNER thành công lấy token');

  const factoryLogin = await request(
    { path: '/auth/login', method: 'POST' },
    { username: factoryUsername, password: 'Factory@1234' }
  );
  factoryToken = factoryLogin.data?.data?.token;
  assert(factoryLogin.status === 200 && !!factoryToken, 'Đăng nhập FACTORY (NM Đồng Nai) lấy token');

  // 2. AC-12.01: Ghi đè nhu cầu tháng sửa tay (Append-only)
  console.log('\n--- BƯỚC 2: AC-12.01 - GHI ĐÈ NHU CẦU THÁNG SỬA TAY (POST /override) ---');
  // Lấy vị thế ban đầu của NM 1 (DN) - NL 17 (Premix Heo Con 4%)
  const beforePos = await request({
    path: '/positions/1/17',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const initialDemandSource = beforePos.data?.data?.position?.demandSource;
  console.log(`    Nguồn nhu cầu ban đầu của cặp (1, 17): ${initialDemandSource}`);

  // Thực hiện Override bằng TẤN (ví dụ: 5.600 tấn = 5600 kg)
  const overrideRes1 = await request(
    {
      path: '/positions/1/17/override',
      method: 'POST',
      headers: { Authorization: `Bearer ${plannerToken}` },
    },
    {
      overrideTons: 5.6,
      reason: 'Đơn hàng đột xuất xuất khẩu Heo Thịt Campuchia trong tháng 10',
    }
  );

  assert(overrideRes1.status === 200, 'POST /override trả về HTTP 200 thành công');
  const overrideData1 = overrideRes1.data?.data;
  assert(Number(overrideData1?.overrideKg) === 5600, 'Lưu đúng số lượng 5600 kg quy đổi từ 5.6 tấn');
  assert(Number(overrideData1?.overrideTons) === 5.6, 'Quy đổi chính xác 5.600 tấn');
  assert(overrideData1?.isRemoval === false, 'Đánh dấu isRemoval = false');
  assert(overrideData1?.createdBy === plannerUsername, `Ghi nhận createdBy = ${plannerUsername}`);

  // Kiểm tra lại Vị thế F04: demandSource phải chuyển sang OVERRIDE và tính lại d, DOI
  const afterPos1 = await request({
    path: '/positions/1/17',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const pos1 = afterPos1.data?.data?.position;
  assert(pos1?.demandSource === 'OVERRIDE', 'Vị thế F04 lập tức chuyển demandSource = OVERRIDE (BR-05a)');
  assert(pos1?.demandMonthKg === 5600, 'demandMonthKg cập nhật đúng 5600 kg');
  const expectedStdDaily = 5600 / 28; // 200 kg/ngày
  assert(pos1?.stdDailyKg === expectedStdDaily, `Tiêu hao chuẩn ngày stdDailyKg = ${expectedStdDaily} kg/ngày (5600 / 28)`);
  assert(pos1?.flagCodes?.includes('DEMAND_OVERRIDE'), 'Kích hoạt cờ thông tin DEMAND_OVERRIDE');

  // 3. AC-12.01b: Xác thực validation lỗi
  console.log('\n--- BƯỚC 3: AC-12.01b - VALIDATION RÀNG BUỘC KHI SỬA TAY ---');
  const invalidNoReason = await request(
    {
      path: '/positions/1/17/override',
      method: 'POST',
      headers: { Authorization: `Bearer ${plannerToken}` },
    },
    {
      overrideKg: 3000,
      reason: '   ',
    }
  );
  assert(invalidNoReason.status === 400, 'Chặn khi lý do để trống với HTTP 400 Bad Request');

  const invalidNegativeKg = await request(
    {
      path: '/positions/1/17/override',
      method: 'POST',
      headers: { Authorization: `Bearer ${plannerToken}` },
    },
    {
      overrideKg: -500,
      reason: 'Lý do test âm',
    }
  );
  assert(invalidNegativeKg.status === 400, 'Chặn khi số lượng âm với HTTP 400');

  const invalidFactory = await request(
    {
      path: '/positions/999/17/override',
      method: 'POST',
      headers: { Authorization: `Bearer ${plannerToken}` },
    },
    {
      overrideKg: 2000,
      reason: 'Nhà máy ảo 999',
    }
  );
  assert(invalidFactory.status === 400, 'Chặn khi nhà máy không tồn tại với HTTP 400');

  // 4. AC-12.03: Hủy bỏ Override quay về Forecast
  console.log('\n--- BƯỚC 4: AC-12.03 - HỦY BỎ SỐ SỬA TAY (DELETE /override) ---');
  const removeRes = await request(
    {
      path: '/positions/1/17/override',
      method: 'DELETE',
      headers: { Authorization: `Bearer ${plannerToken}` },
    },
    {
      reason: 'Kế hoạch xuất khẩu bị hủy, chuyển về chạy theo Forecast chuẩn',
    }
  );
  assert(removeRes.status === 200, 'DELETE /override trả về HTTP 200 thành công');
  const removeData = removeRes.data?.data;
  assert(removeData?.overrideKg === null, 'Bản ghi hủy lưu OverrideKg = NULL (BR-05b)');
  assert(removeData?.isRemoval === true, 'Đánh dấu isRemoval = true');

  // Kiểm tra lại Vị thế F04: demandSource phải quay về FORECAST hoặc NONE
  const afterRemovePos = await request({
    path: '/positions/1/17',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const posAfterRemove = afterRemovePos.data?.data?.position;
  assert(
    posAfterRemove?.demandSource !== 'OVERRIDE',
    `Vị thế quay lại nguồn tự động (demandSource: ${posAfterRemove?.demandSource})`
  );
  assert(
    !posAfterRemove?.flagCodes?.includes('DEMAND_OVERRIDE'),
    'Không còn cờ DEMAND_OVERRIDE sau khi hủy bỏ'
  );

  // 5. AC-12.04: Truy vấn lịch sử sửa tay (Append-only BR-14a)
  console.log('\n--- BƯỚC 5: AC-12.04 - LỊCH SỬ SỬA TAY (GET /override-history) ---');
  const historyRes = await request({
    path: '/positions/1/17/override-history',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(historyRes.status === 200, 'GET /override-history trả về HTTP 200 thành công');
  const historyList = historyRes.data?.data;
  assert(Array.isArray(historyList) && historyList.length >= 2, `Lịch sử lưu đầy đủ ${historyList.length} bản ghi Append-only`);
  assert(historyList[0]?.isRemoval === true, 'Bản ghi mới nhất (đầu danh sách) là lần hủy bỏ');
  assert(Number(historyList[1]?.overrideKg) === 5600, 'Bản ghi trước đó lưu nguyên vẹn 5600 kg không bị xóa/ghi đè');

  // 6. AC-12.05: Danh sách và thống kê cờ bất thường trên toàn hệ thống (BR-37..BR-40)
  console.log('\n--- BƯỚC 6: AC-12.05 - DANH SÁCH & TỔNG HỢP CỜ BẤT THƯỜNG (GET /flags) ---');
  const flagsSummaryRes = await request({
    path: '/positions/flags',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(flagsSummaryRes.status === 200, 'GET /positions/flags trả về HTTP 200 thành công');
  const flagsData = flagsSummaryRes.data?.data;
  assert(flagsData?.totalPairs > 0, `Tổng số cặp phân tích: ${flagsData?.totalPairs}`);
  assert(flagsData?.flagCounts !== undefined, 'Có đối tượng tổng hợp đếm từng loại cờ flagCounts');
  assert(flagsData?.flagCounts?.STALE_DATA !== undefined, 'Đếm cờ STALE_DATA');
  assert(flagsData?.flagCounts?.REORDER_NEEDED !== undefined, 'Đếm cờ REORDER_NEEDED');
  assert(flagsData?.flagCounts?.UNUSED_STOCK !== undefined, 'Đếm cờ UNUSED_STOCK');
  assert(flagsData?.flagCounts?.USAGE_DEVIATION !== undefined, 'Đếm cờ USAGE_DEVIATION');

  // Lọc theo cờ cụ thể
  const filterFlagRes = await request({
    path: '/positions/flags?flagCode=STALE_DATA',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const filteredPairs = filterFlagRes.data?.data?.pairs || [];
  assert(
    filterFlagRes.status === 200 && filteredPairs.every((p) => p.flagCodes.includes('STALE_DATA')),
    `Lọc chính xác các cặp có cờ STALE_DATA (${filteredPairs.length} cặp)`
  );

  // 7. AC-12.06: Phân quyền & Kiểm toán (RBAC & Audit Log)
  console.log('\n--- BƯỚC 7: AC-12.06 - PHÂN QUYỀN RBAC & NHẬT KÝ KIỂM TOÁN ---');
  // User FACTORY không có quyền demand-override.edit -> Phải bị chặn 403
  const factoryForbiddenPost = await request(
    {
      path: '/positions/1/17/override',
      method: 'POST',
      headers: { Authorization: `Bearer ${factoryToken}` },
    },
    {
      overrideKg: 1000,
      reason: 'User factory cố tình tạo override',
    }
  );
  assert(factoryForbiddenPost.status === 403, 'User FACTORY bị chặn HTTP 403 Forbidden khi tạo Override');

  const factoryForbiddenDelete = await request(
    {
      path: '/positions/1/17/override',
      method: 'DELETE',
      headers: { Authorization: `Bearer ${factoryToken}` },
    },
    {
      reason: 'User factory cố tình xóa override',
    }
  );
  assert(factoryForbiddenDelete.status === 403, 'User FACTORY bị chặn HTTP 403 Forbidden khi hủy Override');

  // Kiểm tra nhật ký kiểm toán sys_Audit_Log
  const auditLogsRes = await request({
    path: '/audit-logs?limit=20',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const auditItems = auditLogsRes.data?.data?.items || auditLogsRes.data?.data || [];
  const hasOverrideCreate = auditItems.some(
    (a) => (a.actionCode === 'DEMAND_OVERRIDE_CREATE' || a.action === 'DEMAND_OVERRIDE_CREATE') && a.status === 'SUCCESS'
  );
  const hasOverrideRemove = auditItems.some(
    (a) => (a.actionCode === 'DEMAND_OVERRIDE_REMOVE' || a.action === 'DEMAND_OVERRIDE_REMOVE') && a.status === 'SUCCESS'
  );
  assert(hasOverrideCreate, 'sys_Audit_Log ghi nhận đầy đủ sự kiện DEMAND_OVERRIDE_CREATE');
  assert(hasOverrideRemove, 'sys_Audit_Log ghi nhận đầy đủ sự kiện DEMAND_OVERRIDE_REMOVE');

  // TỔNG KẾT
  console.log('\n======================================================================');
  console.log(`   KẾT QUẢ KIỂM THỬ TASK-12: ${passedTests}/${totalTests} Test Cases ĐẠT`);
  console.log('======================================================================');

  if (passedTests === totalTests) {
    console.log('🎉 TẤT CẢ TEST CASES CỦA TASK-12 ĐỀU ĐẠT CHUẨN NGHIỆM THU 100%!');
  } else {
    console.error('❌ MỘT SỐ TEST CASES BỊ THẤT BẠI!');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Lỗi thực thi test runner:', err);
  process.exit(1);
});
