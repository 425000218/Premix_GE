/**
 * Automated Test Runner for TASK-10 (F07: Kế hoạch giao hàng tuần & Đối chiếu thực nhận từ POR - BR-26b)
 * Chạy: node test/test-task-10.js
 */
const BASE_URL = 'http://localhost:3000/api/v1';

let passed = 0;
let failed = 0;

function assert(condition, code, message, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS [${code}]: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL [${code}]: ${message}${detail ? ' -> ' + detail : ''}`);
  }
}

async function request(method, path, token = null, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function runTests() {
  console.log('========================================================================');
  console.log(' BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TASK-10: KẾ HOẠCH GIAO HÀNG TUẦN & POR (F07)');
  console.log('========================================================================\n');

  // 1. SETUP: Đăng nhập Admin
  const loginAdminRes = await request('POST', '/auth/login', null, {
    username: 'admin',
    password: 'Admin@1234',
  });
  const adminToken = loginAdminRes.body?.data?.token;
  assert(
    loginAdminRes.status === 200 && !!adminToken,
    'SETUP-01',
    'Đăng nhập tài khoản Admin thành công',
  );

  // 2. SETUP: Tạo tài khoản PLANNER và FACTORY (gán NM 1 - Đồng Nai)
  const timestamp = Date.now();
  const plannerUsername = `planner_f07_${timestamp}`;
  const createPlannerRes = await request('POST', '/users', adminToken, {
    username: plannerUsername,
    initialPassword: 'Planner@1234',
    fullName: 'Nhân viên Kế hoạch F07',
    email: `${plannerUsername}@premix.vn`,
    roleCode: 'PLANNER',
    factoryIds: [],
  });
  assert(
    createPlannerRes.status === 201,
    'SETUP-02',
    `Tạo user PLANNER (${plannerUsername}) thành công`,
  );

  const loginPlannerRes = await request('POST', '/auth/login', null, {
    username: plannerUsername,
    password: 'Planner@1234',
  });
  const plannerToken = loginPlannerRes.body?.data?.token;

  const factoryUsername = `factory_f07_${timestamp}`;
  const createFactoryRes = await request('POST', '/users', adminToken, {
    username: factoryUsername,
    initialPassword: 'Factory@1234',
    fullName: 'Nhân viên NM Đồng Nai F07',
    email: `${factoryUsername}@premix.vn`,
    roleCode: 'FACTORY',
    factoryIds: [1], // Chỉ gán NM 1 (Đồng Nai)
  });
  assert(
    createFactoryRes.status === 201,
    'SETUP-03',
    `Tạo user FACTORY (${factoryUsername}) gán NM 1 (Đồng Nai) thành công`,
  );

  const loginFactoryRes = await request('POST', '/auth/login', null, {
    username: factoryUsername,
    password: 'Factory@1234',
  });
  const factoryToken = loginFactoryRes.body?.data?.token;

  // =========================================================================
  // 1. KIỂM THỬ PO OPTIONS & LẬP KẾ HOẠCH THEO TẤN / LƯU KG (AC-10.01)
  // =========================================================================
  console.log('\n--- 1. Kiểm thử PO Options & Lưu kế hoạch TẤN/KG (AC-10.01) ---');

  // Lấy danh sách PO còn mở của cặp (DN, 0014)
  const poOptionsRes = await request(
    'GET',
    '/delivery-plans/po-options?factoryId=1&materialId=17',
    plannerToken,
  );
  assert(
    poOptionsRes.status === 200 && Array.isArray(poOptionsRes.body?.data),
    'AC-10.01a',
    'GET /api/v1/delivery-plans/po-options trả về danh sách PO còn mở của cặp (DN, 0014)',
  );

  const poList = poOptionsRes.body?.data || [];
  const poSample = poList.find((p) => p.poNumber === 'PO-2026-001');
  assert(
    !!poSample && poSample.deliverRemainderKg === 1000 && poSample.deliverRemainderTons === 1.0,
    'AC-10.01b',
    `Tìm thấy PO-2026-001 với DeliverRemainder = 1.000 tấn (1.000 kg)`,
  );

  // Lưu kế hoạch tuần 2026-10-05 (Thứ 2 đến CN)
  // Dòng 1: PO-2026-001 giao Thứ 2 (2026-10-05) = 1.500 tấn (1500 kg)
  // Dòng 2: PO-2026-001 giao Thứ 4 (2026-10-07) = 0.750 tấn (750 kg)
  // Dòng 3: Không PO giao Thứ 5 (2026-10-08) = 0.500 tấn (500 kg)
  // Tổng = 2.750 tấn (2750 kg)
  const savePlanRes = await request('POST', '/delivery-plans/week', plannerToken, {
    weekStartDate: '2026-10-05',
    factoryId: 1,
    plans: [
      {
        planDate: '2026-10-05',
        materialId: 17,
        supplierId: 14,
        poNumber: 'PO-2026-001',
        planQtyTons: 1.5,
        note: 'Giao đợt 1 sáng Thứ 2',
      },
      {
        planDate: '2026-10-07',
        materialId: 17,
        supplierId: 14,
        poNumber: 'PO-2026-001',
        planQtyTons: 0.75,
        note: 'Giao đợt 2 chiều Thứ 4',
      },
      {
        planDate: '2026-10-08',
        materialId: 17,
        supplierId: 14,
        planQtyTons: 0.5,
        note: 'Dự kiến không có PO',
      },
    ],
  });

  const saveResult = savePlanRes.body?.data;
  assert(
    savePlanRes.status === 200 &&
      saveResult?.savedCount === 3 &&
      saveResult?.totalPlanKg === 2750 &&
      saveResult?.totalPlanTons === 2.75,
    'AC-10.01c',
    `Lưu thành công 3 dòng kế hoạch tuần: savedCount = 3, totalPlanKg = 2750, totalPlanTons = 2.75 tấn`,
    JSON.stringify(savePlanRes.body),
  );

  // Tải lại lưới kế hoạch tuần
  const getWeekRes = await request(
    'GET',
    '/delivery-plans/week?weekStartDate=2026-10-05&factoryId=1&materialId=17',
    plannerToken,
  );
  const weekData = getWeekRes.body?.data;
  assert(
    getWeekRes.status === 200 &&
      weekData &&
      Array.isArray(weekData.days) &&
      weekData.days.length === 7 &&
      weekData.days[0] === '2026-10-05' &&
      weekData.days[6] === '2026-10-11',
    'AC-10.01d',
    `GET /api/v1/delivery-plans/week trả về đầy đủ 7 ngày liên tiếp từ Thứ 2 (2026-10-05) đến CN (2026-10-11)`,
  );

  const poItem = weekData?.items?.find((it) => it.poNumber === 'PO-2026-001');
  const noPoItem = weekData?.items?.find((it) => it.poNumber === null);

  assert(
    !!poItem &&
      poItem.daily['2026-10-05']?.planQtyTons === 1.5 &&
      poItem.daily['2026-10-05']?.planQtyKg === 1500 &&
      poItem.daily['2026-10-07']?.planQtyTons === 0.75 &&
      poItem.daily['2026-10-07']?.planQtyKg === 750,
    'AC-10.01e',
    `Tải lại dòng PO-2026-001 hiển thị đúng ngày Thứ 2 = 1.500 tấn (1500 kg), Thứ 4 = 0.750 tấn (750 kg)`,
  );

  assert(
    !!noPoItem &&
      noPoItem.daily['2026-10-08']?.planQtyTons === 0.5 &&
      noPoItem.daily['2026-10-08']?.planQtyKg === 500,
    'AC-10.01f',
    `Tải lại dòng không PO hiển thị đúng ngày Thứ 5 = 0.500 tấn (500 kg)`,
  );

  // =========================================================================
  // 2. KIỂM THỬ ĐỐI CHIẾU THỰC NHẬN POR (RECONCILIATION - BR-26b) (AC-10.02)
  // =========================================================================
  console.log('\n--- 2. Kiểm thử Thuật toán Đối chiếu Thực nhận POR (BR-26b) (AC-10.02) ---');

  // Trong database có phiếu POR-10001 nhận 1750 kg vào ngày 2026-10-05 cho PO-2026-001
  const dayMon = poItem?.daily['2026-10-05'];
  const dayWed = poItem?.daily['2026-10-07'];
  const summaryPo = poItem?.weeklySummary;

  assert(
    dayMon &&
      dayMon.planQtyTons === 1.5 &&
      dayMon.receivedQtyTons === 1.75 &&
      dayMon.receivedQtyKg === 1750 &&
      dayMon.missingQtyTons === -0.25 &&
      dayMon.missingQtyKg === -250,
    'AC-10.02a',
    `Ngày Thứ 2 (2026-10-05) đối chiếu chính xác: Kế hoạch = 1.500 tấn, Đã nhận = 1.750 tấn, Giao dư = -0.250 tấn (-250 kg)`,
  );

  assert(
    dayWed &&
      dayWed.planQtyTons === 0.75 &&
      dayWed.receivedQtyTons === 0 &&
      dayWed.missingQtyTons === 0.75,
    'AC-10.02b',
    `Ngày Thứ 4 (2026-10-07) chưa nhận hàng: Kế hoạch = 0.750 tấn, Đã nhận = 0 tấn, Còn thiếu = 0.750 tấn`,
  );

  assert(
    summaryPo &&
      summaryPo.totalPlanTons === 2.25 &&
      summaryPo.totalReceivedTons === 1.75 &&
      summaryPo.totalMissingTons === 0.5 &&
      summaryPo.totalMissingKg === 500,
    'AC-10.02c',
    `Tổng kết tuần dòng PO-2026-001 bù trừ tự do giữa các ngày: Tổng kế hoạch = 2.250 tấn, Tổng nhận = 1.750 tấn, Còn thiếu = 0.500 tấn`,
  );

  // =========================================================================
  // 3. KIỂM THỬ CẢNH BÁO MỀM VƯỢT ĐƠN MUA HÀNG - BR-26d (AC-10.03)
  // =========================================================================
  console.log('\n--- 3. Kiểm thử Cảnh báo mềm Vượt PO (BR-26d) (AC-10.03) ---');

  // Tổng kế hoạch của PO-2026-001 là 2.250 tấn (2250 kg) > DeliverRemainderKg = 1000 kg (1.000 tấn)
  assert(
    poItem?.hasOverPoWarning === true &&
      poItem?.deliverRemainderTons === 1.0 &&
      typeof poItem?.overPoWarningMessage === 'string' &&
      poItem?.overPoWarningMessage.includes('vượt quá lượng còn lại trên PO'),
    'AC-10.03a',
    `Hiển thị cờ cảnh báo mềm hasOverPoWarning: true và thông điệp: "${poItem?.overPoWarningMessage}"`,
  );

  // Dòng không PO không bị cảnh báo Over-PO
  assert(
    noPoItem?.hasOverPoWarning === false,
    'AC-10.03b',
    'Dòng kế hoạch không có PO không bị kích hoạt cảnh báo Over-PO',
  );

  // =========================================================================
  // 4. KIỂM THỬ PHÂN QUYỀN, PHẠM VI NHÀ MÁY & RÀNG BUỘC BR-26a (AC-10.04)
  // =========================================================================
  console.log('\n--- 4. Kiểm thử Phân quyền, Phạm vi Nhà máy & Ràng buộc BR-26a (AC-10.04) ---');

  // 4a. User FACTORY chỉ có quyền xem (Read-only), cố tình lưu bị chặn HTTP 403 Forbidden
  const factorySaveRes = await request('POST', '/delivery-plans/week', factoryToken, {
    weekStartDate: '2026-10-05',
    factoryId: 1,
    plans: [
      {
        planDate: '2026-10-05',
        materialId: 17,
        supplierId: 14,
        planQtyTons: 1.0,
      },
    ],
  });
  assert(
    factorySaveRes.status === 403,
    'AC-10.04a',
    'User vai trò FACTORY không có quyền delivery-plan.edit -> Bị chặn với HTTP 403 Forbidden khi cố tình lưu lưới tuần',
  );

  // 4b. User FACTORY xem kế hoạch nhà máy được phân công (NM 1 - Đồng Nai) -> Thành công HTTP 200
  const factoryViewOwnRes = await request(
    'GET',
    '/delivery-plans/week?weekStartDate=2026-10-05&factoryId=1',
    factoryToken,
  );
  assert(
    factoryViewOwnRes.status === 200 && Array.isArray(factoryViewOwnRes.body?.data?.items),
    'AC-10.04b',
    'User vai trò FACTORY xem kế hoạch của nhà máy được phân công (NM 1) -> HTTP 200 OK',
  );

  // 4c. User FACTORY cố tình xem kế hoạch nhà máy khác (NM 2 - Bình Dương) -> Bị chặn HTTP 403
  const factoryViewOtherRes = await request(
    'GET',
    '/delivery-plans/week?weekStartDate=2026-10-05&factoryId=2',
    factoryToken,
  );
  assert(
    factoryViewOtherRes.status === 403,
    'AC-10.04c',
    'User vai trò FACTORY cố tình xem nhà máy khác (NM 2) -> Bị chặn với HTTP 403 Forbidden theo phạm vi FactoryScope',
  );

  // 4d. Kiểm tra vi phạm ràng buộc BR-26a: Trùng lặp dòng có cùng số PO trong một ngày
  const dupPoRes = await request('POST', '/delivery-plans/week', plannerToken, {
    weekStartDate: '2026-10-05',
    factoryId: 1,
    plans: [
      {
        planDate: '2026-10-05',
        materialId: 17,
        supplierId: 14,
        poNumber: 'PO-2026-001',
        planQtyTons: 1.0,
      },
      {
        planDate: '2026-10-05',
        materialId: 17,
        supplierId: 14,
        poNumber: 'PO-2026-001', // Cùng ngày 2026-10-05, cùng PO
        planQtyTons: 0.5,
      },
    ],
  });
  const dupErrMsg = dupPoRes.body?.error?.message || dupPoRes.body?.message || '';
  assert(
    dupPoRes.status === 400 && dupErrMsg.includes('BR-26a'),
    'AC-10.04d',
    'Chặn lưu trùng lặp 2 dòng có cùng số PO trong một ngày với HTTP 400 Bad Request theo quy tắc BR-26a',
    JSON.stringify(dupPoRes.body),
  );

  // =========================================================================
  // 5. KIỂM THỬ ĐỀ XUẤT LỊCH GIAO NHÁP BR-36b & NHẬT KÝ KIỂM TOÁN (AC-10.05)
  // =========================================================================
  console.log('\n--- 5. Kiểm thử Đề xuất Lịch giao nháp BR-36b & Audit Log (AC-10.05) ---');

  // Gọi API đề xuất lịch giao nháp
  const suggestRes = await request('POST', '/delivery-plans/suggest', plannerToken, {
    weekStartDate: '2026-10-05',
    factoryId: 1,
    materialId: 17,
  });
  const suggestData = suggestRes.body?.data;
  assert(
    suggestRes.status === 200 &&
      suggestData &&
      Array.isArray(suggestData.suggestedPlans),
    'AC-10.05a',
    'POST /api/v1/delivery-plans/suggest trả về cấu trúc đề xuất hợp lệ (HTTP 200)',
  );

  // Xác nhận rằng việc đề xuất nháp KHÔNG ghi đè CSDL
  const getWeekAfterSuggestRes = await request(
    'GET',
    '/delivery-plans/week?weekStartDate=2026-10-05&factoryId=1&materialId=17',
    plannerToken,
  );
  const weekDataAfterSuggest = getWeekAfterSuggestRes.body?.data;
  assert(
    weekDataAfterSuggest?.weeklyTotals?.totalPlanKg === 2750,
    'AC-10.05b',
    'Đề xuất lịch giao chỉ tạo bản nháp trên giao diện, giữ nguyên 100% dữ liệu đã lưu trong CSDL (totalPlanKg = 2750)',
  );

  // Kiểm tra nhật ký kiểm toán DELIVERY_PLAN_SAVE_WEEK
  const auditRes = await request(
    'GET',
    '/audit-logs?actionCode=DELIVERY_PLAN_SAVE_WEEK&page=1&pageSize=5',
    adminToken,
  );
  const auditLogs = Array.isArray(auditRes.body?.data)
    ? auditRes.body.data
    : auditRes.body?.data?.items || [];
  const latestAudit = auditLogs[0];

  assert(
    auditRes.status === 200 &&
      latestAudit &&
      latestAudit.actionCode === 'DELIVERY_PLAN_SAVE_WEEK' &&
      latestAudit.targetEntity === 'fact_Delivery_Plan' &&
      latestAudit.status === 'SUCCESS',
    'AC-10.05c',
    `Nhật ký kiểm toán sys_Audit_Log ghi nhận đầy đủ sự kiện DELIVERY_PLAN_SAVE_WEEK bởi user ${latestAudit?.username}`,
  );

  // TỔNG KẾT
  console.log('\n========================================================================');
  console.log(` KẾT QUẢ KIỂM THỬ TASK-10: ${passed} PASSED / ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled Test Error:', err);
  process.exit(1);
});
