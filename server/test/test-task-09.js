/**
 * Automated Test Runner for TASK-09 (F02b: Cấu hình chung hệ thống & Ngưỡng tồn kho theo cặp - BR-12, BR-12a, BR-12b)
 * Chạy: node test/test-task-09.js
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
  console.log(' BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TASK-09: CẤU HÌNH CHUNG & NGƯỠNG CẶP (F02b)');
  console.log('========================================================================\n');

  // 1. Đăng nhập Admin
  const loginRes = await request('POST', '/auth/login', null, {
    username: 'admin',
    password: 'Admin@1234',
  });
  const adminToken = loginRes.body?.data?.token;
  assert(
    loginRes.status === 200 && !!adminToken,
    'SETUP-01',
    'Đăng nhập tài khoản Admin thành công',
  );

  // =========================================================================
  // 1. KIỂM THỬ CẤU HÌNH CHUNG & RÀNG BUỘC THỨ TỰ BR-12 (AC-09.01)
  // =========================================================================
  console.log('\n--- 1. Kiểm thử Cấu hình chung hệ thống & Ràng buộc BR-12 (AC-09.01) ---');
  const getCfgRes = await request('GET', '/system-config', adminToken);
  const baseCfg = getCfgRes.body?.data;
  assert(
    getCfgRes.status === 200 &&
      baseCfg &&
      baseCfg.standardMonthDays === 28 &&
      baseCfg.criticalDays === 7 &&
      baseCfg.warningDays === 15 &&
      baseCfg.overstockDays === 75 &&
      baseCfg.overstockDaysLowUsage === 90,
    'AC-09.01a',
    `GET /api/v1/system-config trả về đầy đủ 16 tham số chuẩn (7 < 15 < 75 <= 90)`,
    JSON.stringify(baseCfg),
  );

  // 1b. Vi phạm BR-12: CriticalDays (15) >= WarningDays (10)
  const badBr12aRes = await request('PUT', '/system-config', adminToken, {
    ...baseCfg,
    criticalDays: 15,
    warningDays: 10,
  });
  const badBr12aMsg = badBr12aRes.body?.error?.message || '';
  assert(
    badBr12aRes.status === 400 && badBr12aMsg.includes('CriticalDays phải nhỏ hơn WarningDays'),
    'AC-09.01b',
    `Chặn CriticalDays (15) >= WarningDays (10) theo BR-12 -> HTTP 400: "${badBr12aMsg}"`,
  );

  // 1c. Vi phạm BR-12: WarningDays (80) >= OverstockDays (75)
  const badBr12bRes = await request('PUT', '/system-config', adminToken, {
    ...baseCfg,
    warningDays: 80,
    overstockDays: 75,
  });
  const badBr12bMsg = badBr12bRes.body?.error?.message || '';
  assert(
    badBr12bRes.status === 400 && badBr12bMsg.includes('WarningDays phải nhỏ hơn OverstockDays'),
    'AC-09.01c',
    `Chặn WarningDays (80) >= OverstockDays (75) theo BR-12 -> HTTP 400: "${badBr12bMsg}"`,
  );

  // 1d. Vi phạm BR-12: OverstockDays (95) > OverstockDaysLowUsage (90)
  const badBr12cRes = await request('PUT', '/system-config', adminToken, {
    ...baseCfg,
    overstockDays: 95,
    overstockDaysLowUsage: 90,
  });
  const badBr12cMsg = badBr12cRes.body?.error?.message || '';
  assert(
    badBr12cRes.status === 400 &&
      badBr12cMsg.includes('OverstockDays không được lớn hơn OverstockDaysLowUsage'),
    'AC-09.01d',
    `Chặn OverstockDays (95) > OverstockDaysLowUsage (90) theo BR-12 -> HTTP 400: "${badBr12cMsg}"`,
  );

  // 1e. Cập nhật hợp lệ và khôi phục
  const updateCfgRes = await request('PUT', '/system-config', adminToken, {
    ...baseCfg,
    reorderCoverDays: 22,
  });
  assert(
    updateCfgRes.status === 200 && updateCfgRes.body?.data?.reorderCoverDays === 22,
    'AC-09.01e',
    'PUT /api/v1/system-config cập nhật hợp lệ tham số reorderCoverDays = 22 thành công',
  );
  // Khôi phục về 20
  await request('PUT', '/system-config', adminToken, {
    ...baseCfg,
    reorderCoverDays: 20,
  });

  // =========================================================================
  // 2. KIỂM THỬ GHI ĐÈ NGƯỠNG THEO CẶP & RÀNG BUỘC BR-12a (AC-09.02)
  // =========================================================================
  console.log('\n--- 2. Kiểm thử Ghi đè ngưỡng theo cặp & Ràng buộc BR-12a (AC-09.02) ---');
  const posRes = await request('GET', '/positions?search=0014', adminToken);
  const targetPair = (posRes.body?.data?.items || [])[0];
  const targetFactoryId = targetPair?.factoryId;
  const targetMaterialId = targetPair?.materialId;

  // 2a. Vi phạm BR-12a: WarningDays (6) <= CriticalDays chung (7)
  const badTh1Res = await request('POST', '/thresholds', adminToken, {
    factoryId: targetFactoryId,
    materialId: targetMaterialId,
    warningDays: 6,
    overstockDays: 60,
  });
  const badTh1Msg = badTh1Res.body?.error?.message || '';
  assert(
    badTh1Res.status === 400 && badTh1Msg.includes('BR-12a'),
    'AC-09.02a',
    `Chặn ghi đè WarningDays (6) <= Critical chung (7) theo BR-12a -> HTTP 400: "${badTh1Msg}"`,
  );

  // 2b. Vi phạm BR-12a: WarningDays (50) >= OverstockDays (45)
  const badTh2Res = await request('POST', '/thresholds', adminToken, {
    factoryId: targetFactoryId,
    materialId: targetMaterialId,
    warningDays: 50,
    overstockDays: 45,
  });
  const badTh2Msg = badTh2Res.body?.error?.message || '';
  assert(
    badTh2Res.status === 400 && badTh2Msg.includes('BR-12a'),
    'AC-09.02b',
    `Chặn ghi đè WarningDays (50) >= OverstockDays (45) theo BR-12a -> HTTP 400: "${badTh2Msg}"`,
  );

  // 2c. Upsert ngưỡng ghi đè hợp lệ: WarningDays = 10, OverstockDays = 60, SafetyDays = 8.5
  const upsertRes = await request('POST', '/thresholds', adminToken, {
    factoryId: targetFactoryId,
    materialId: targetMaterialId,
    warningDays: 10,
    overstockDays: 60,
    safetyDays: 8.5,
    deliveryDays: 7,
    deliveryQtyKg: 5000,
    note: 'Ngưỡng riêng cho Premix 0014 tại nhà máy ĐN (Test TASK-09)',
  });
  const createdTh = upsertRes.body?.data;
  const thresholdId = createdTh?.thresholdId;

  assert(
    upsertRes.status === 200 &&
      thresholdId > 0 &&
      createdTh?.warningDays === 10 &&
      createdTh?.overstockDays === 60 &&
      createdTh?.effectiveThresholds?.criticalDays === 7 &&
      createdTh?.effectiveThresholds?.warningDays === 10 &&
      createdTh?.effectiveThresholds?.overstockDays === 60,
    'AC-09.02c',
    `POST /api/v1/thresholds lưu thành công ThresholdID #${thresholdId} (Effective: 7 < 10 < 60)`,
    JSON.stringify(createdTh),
  );

  // 2d. Kiểm tra phản ánh tức thời vào effectiveThresholds trên Bảng vị thế F04
  const posAfterThRes = await request(
    'GET',
    `/positions?factoryId=${targetFactoryId}&search=0014`,
    adminToken,
  );
  const pairAfterTh = posAfterThRes.body?.data?.items?.[0];
  assert(
    pairAfterTh &&
      pairAfterTh.effectiveThresholds?.warningDays === 10 &&
      pairAfterTh.effectiveThresholds?.overstockDays === 60 &&
      pairAfterTh.effectiveThresholds?.safetyDays === 8.5,
    'AC-09.02d',
    `Vị thế F04 cập nhật tức thời effectiveThresholds = ${JSON.stringify(pairAfterTh?.effectiveThresholds)}`,
  );

  // =========================================================================
  // 3. KIỂM THỬ BẢO VỆ TOÀN VẸN KHI SỬA CẤU HÌNH CHUNG - BR-12b (AC-09.03)
  // =========================================================================
  console.log('\n--- 3. Kiểm thử Chặn xung đột ngược BR-12b khi sửa Cấu hình chung (AC-09.03) ---');
  // Cặp (DN, 0014) đang có WarningDays ghi đè = 10.
  // Admin cố tình tăng CriticalDays chung từ 7 lên 12 (12 < 15 hợp lệ với BR-12, nhưng 12 >= 10 xung đột với cặp ghi đè!)
  const conflictRes = await request('PUT', '/system-config', adminToken, {
    ...baseCfg,
    criticalDays: 12,
    warningDays: 15,
  });
  const conflictErr = conflictRes.body?.error;
  const conflictDetails = conflictErr?.details || [];

  assert(
    conflictRes.status === 400 &&
      conflictErr?.code === 'THRESHOLD_CONFLICT_BR12B' &&
      Array.isArray(conflictDetails) &&
      conflictDetails.some(
        (c) => c.factoryCode === targetPair.factoryCode && c.materialCode === '0014',
      ),
    'AC-09.03a',
    `Chặn sửa CriticalDays = 12 gây xung đột BR-12b với cặp (${targetPair.factoryCode}, 0014) đang có WarningDays = 10 -> Trả về đúng danh sách cặp xung đột`,
    JSON.stringify(conflictRes.body),
  );

  // =========================================================================
  // 4. DANH SÁCH NGƯỠNG, PHÂN QUYỀN PLANNER & XÓA NGƯỠNG GHI ĐÈ (AC-09.04)
  // =========================================================================
  console.log('\n--- 4. Kiểm thử Danh sách ngưỡng, Phân quyền PLANNER & Xóa ngưỡng (AC-09.04) ---');
  const listThRes = await request('GET', '/thresholds?page=1&pageSize=10', adminToken);
  const thItems = listThRes.body?.data?.items || [];
  assert(
    listThRes.status === 200 && thItems.some((t) => t.thresholdId === thresholdId),
    'AC-09.04a',
    `GET /api/v1/thresholds trả về danh sách phân trang chuẩn có chứa ThresholdID #${thresholdId}`,
  );

  // Tạo user PLANNER để kiểm tra phân quyền (có quyền threshold.edit nhưng KHÔNG có system-config.edit)
  const plannerUsername = `planner_f02b_${Date.now()}`;
  const createPlannerRes = await request('POST', '/users', adminToken, {
    username: plannerUsername,
    initialPassword: 'Planner@1234',
    fullName: 'Nhân viên Kế hoạch (F02b Test)',
    email: `${plannerUsername}@premix.vn`,
    roleCode: 'PLANNER',
  });
  const plannerUserId =
    createPlannerRes.body?.data?.user?.userId || createPlannerRes.body?.data?.userId;

  const plannerLoginRes = await request('POST', '/auth/login', null, {
    username: plannerUsername,
    password: 'Planner@1234',
  });
  const plannerToken = plannerLoginRes.body?.data?.token;

  // Planner được phép sửa ngưỡng theo cặp (threshold.edit)
  const plannerUpsertRes = await request('POST', '/thresholds', plannerToken, {
    factoryId: targetFactoryId,
    materialId: targetMaterialId,
    warningDays: 11,
    overstockDays: 65,
    note: 'Planner cập nhật ngưỡng ghi đè',
  });
  assert(
    plannerUpsertRes.status === 200 && plannerUpsertRes.body?.data?.warningDays === 11,
    'AC-09.04b',
    'Vai trò PLANNER (có quyền threshold.edit) cập nhật ngưỡng theo cặp thành công (HTTP 200)',
  );

  // Planner KHÔNG được phép sửa cấu hình chung (system-config.edit)
  const plannerConfigRes = await request('PUT', '/system-config', plannerToken, {
    ...baseCfg,
  });
  assert(
    plannerConfigRes.status === 403,
    'AC-09.04c',
    'Vai trò PLANNER cố tình gọi PUT /api/v1/system-config bị chặn với HTTP 403 Forbidden',
  );

  // Xóa ngưỡng ghi đè (DELETE /api/v1/thresholds/:id)
  const delRes = await request('DELETE', `/thresholds/${thresholdId}`, adminToken);
  assert(
    delRes.status === 200 && delRes.body?.data?.deleted === true,
    'AC-09.04d',
    `DELETE /api/v1/thresholds/${thresholdId} xóa ngưỡng ghi đè thành công`,
  );

  // Kiểm tra Vị thế F04 quay về ngưỡng mặc định hệ thống (7, 15, 75)
  const posRestoredRes = await request(
    'GET',
    `/positions?factoryId=${targetFactoryId}&search=0014`,
    adminToken,
  );
  const pairRestored = posRestoredRes.body?.data?.items?.[0];
  assert(
    pairRestored &&
      pairRestored.effectiveThresholds?.criticalDays === 7 &&
      pairRestored.effectiveThresholds?.warningDays === 15 &&
      pairRestored.effectiveThresholds?.overstockDays === 75,
    'AC-09.04e',
    `Sau khi xóa ngưỡng ghi đè, cặp (${targetPair.factoryCode}, 0014) quay về ngưỡng mặc định hệ thống (7 < 15 < 75)`,
  );

  if (plannerUserId) {
    await request('DELETE', `/users/${plannerUserId}`, adminToken);
  }

  // =========================================================================
  // 5. KIỂM TRA NHẬT KÝ KIỂM TOÁN AUDIT LOG (AC-09.05)
  // =========================================================================
  console.log('\n--- 5. Kiểm thử Nhật ký kiểm toán Audit Log (AC-09.05) ---');
  const [auditCfgRes, auditUpsertRes, auditDelRes] = await Promise.all([
    request('GET', '/audit-logs?actionCode=SYSTEM_CONFIG_UPDATE&page=1&pageSize=10', adminToken),
    request('GET', '/audit-logs?actionCode=THRESHOLD_UPSERT&page=1&pageSize=10', adminToken),
    request('GET', '/audit-logs?actionCode=THRESHOLD_DELETE&page=1&pageSize=10', adminToken),
  ]);

  const cfgLogs = Array.isArray(auditCfgRes.body?.data) ? auditCfgRes.body.data : [];
  const upsertLogs = Array.isArray(auditUpsertRes.body?.data) ? auditUpsertRes.body.data : [];
  const delLogs = Array.isArray(auditDelRes.body?.data) ? auditDelRes.body.data : [];

  assert(
    auditCfgRes.status === 200 && cfgLogs.length >= 1,
    'AC-09.05a',
    `sys_Audit_Log ghi nhận đầy đủ sự kiện SYSTEM_CONFIG_UPDATE (${cfgLogs.length} bản ghi)`,
  );
  assert(
    auditUpsertRes.status === 200 &&
      upsertLogs.some((a) => String(a.targetId) === String(thresholdId)),
    'AC-09.05b',
    `sys_Audit_Log ghi nhận đầy đủ sự kiện THRESHOLD_UPSERT cho ThresholdID #${thresholdId}`,
  );
  assert(
    auditDelRes.status === 200 &&
      delLogs.some((a) => String(a.targetId) === String(thresholdId)),
    'AC-09.05c',
    `sys_Audit_Log ghi nhận đầy đủ sự kiện THRESHOLD_DELETE cho ThresholdID #${thresholdId}`,
  );

  console.log('\n========================================================================');
  console.log(` KẾT QUẢ KIỂM THỬ TASK-09: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Lỗi thực thi kiểm thử:', err);
  process.exit(1);
});
