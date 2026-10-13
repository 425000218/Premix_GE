/**
 * Automated Test Runner for TASK-11 (F08: Quản lý Đề nghị mua hàng PR & Gợi ý mua BR-25, BR-25a)
 * Chạy: node test/test-task-11.js
 */
import * as XLSX from 'xlsx';

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

async function request(method, path, token = null, body = null, isBinary = false) {
  const headers = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (isBinary) {
    const arrayBuffer = await res.arrayBuffer();
    return {
      status: res.status,
      headers: res.headers,
      buffer: Buffer.from(arrayBuffer),
    };
  }

  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, body: json };
}

async function runTests() {
  console.log('========================================================================');
  console.log(' BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TASK-11: ĐỀ NGHỊ MUA HÀNG PR & GỢI Ý MUA (F08)');
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

  // 2. SETUP: Tạo tài khoản PLANNER và FACTORY
  const timestamp = Date.now();
  const plannerUsername = `planner_f08_${timestamp}`;
  const createPlannerRes = await request('POST', '/users', adminToken, {
    username: plannerUsername,
    initialPassword: 'Planner@1234',
    fullName: 'Nhân viên Kế hoạch F08',
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

  const factoryUsername = `factory_f08_${timestamp}`;
  const createFactoryRes = await request('POST', '/users', adminToken, {
    username: factoryUsername,
    initialPassword: 'Factory@1234',
    fullName: 'Nhân viên NM Đồng Nai F08',
    email: `${factoryUsername}@premix.vn`,
    roleCode: 'FACTORY',
    factoryIds: [1],
  });
  assert(
    createFactoryRes.status === 201,
    'SETUP-03',
    `Tạo user FACTORY (${factoryUsername}) gán NM 1 thành công`,
  );

  const loginFactoryRes = await request('POST', '/auth/login', null, {
    username: factoryUsername,
    password: 'Factory@1234',
  });
  const factoryToken = loginFactoryRes.body?.data?.token;

  // =========================================================================
  // 1. KIỂM THỬ THUẬT TOÁN GỢI Ý MUA HÀNG - BR-25, BR-25a (AC-11.01)
  // =========================================================================
  console.log('\n--- 1. Kiểm thử Thuật toán Gợi ý Mua hàng (BR-25, BR-25a) (AC-11.01) ---');

  const suggRes = await request(
    'GET',
    '/purchase-requests/suggestions?factoryId=1',
    plannerToken,
  );
  const suggData = suggRes.body?.data;
  const suggItems = suggData?.items || [];

  assert(
    suggRes.status === 200 && Array.isArray(suggItems),
    'AC-11.01a',
    `GET /api/v1/purchase-requests/suggestions trả về danh sách gợi ý mua (HTTP 200, tổng ${suggItems.length} gợi ý)`,
    JSON.stringify(suggRes.body),
  );

  // Kiểm tra từng gợi ý thỏa mãn BR-25 & BR-25a
  for (const s of suggItems) {
    const isCritical = s.doi < 7.0;
    const isWarning = s.doi >= 7.0 && s.doi <= 15.0;

    assert(
      isCritical || isWarning,
      'AC-11.01b',
      `Gợi ý cặp (${s.factoryCode}, ${s.materialCode}): DOI = ${s.doi} nằm trong ngưỡng Critical (<7) hoặc Warning (7-15)`,
    );

    const expectedRaw = isCritical ? Math.round(10 * s.dailyUsageKg) : Math.round(8 * s.dailyUsageKg);
    assert(
      s.rawQtyKg === expectedRaw,
      'AC-11.01c',
      `Lượng thô cặp (${s.factoryCode}, ${s.materialCode}) tính đúng định mức thô BR-25: ${s.rawQtyKg} kg (kỳ vọng ${expectedRaw} kg)`,
    );

    const expectedNet = Math.max(0, s.rawQtyKg - s.openPoKg - s.sentPrKg);
    let expectedSuggested = expectedNet;
    if (s.bagKg && s.bagKg > 0) {
      expectedSuggested = Math.ceil(expectedNet / s.bagKg) * s.bagKg;
    }
    assert(
      s.suggestedQtyKg === expectedSuggested && s.suggestedQtyKg > 0,
      'AC-11.01d',
      `Lượng gợi ý ròng khấu trừ PO & PR đang SENT và làm tròn theo bao (${s.bagKg || 'xá'} kg): ${s.suggestedQtyKg} kg (${s.suggestedQtyTons} tấn)`,
    );

    assert(
      !!s.needByDate && !!s.suggestedOrderDate && s.leadTimeDays > 0,
      'AC-11.01e',
      `Xác định đúng Ngày cần hàng ${s.needByDate}, LeadTime = ${s.leadTimeDays} ngày -> Ngày đặt muộn nhất ${s.suggestedOrderDate}`,
    );
    break; // Kiểm tra chi tiết 1 phần tử đại diện
  }

  // =========================================================================
  // 2. KIỂM THỬ TẠO MỚI PHIẾU ĐỀ NGHỊ MUA HÀNG PR (AC-11.02)
  // =========================================================================
  console.log('\n--- 2. Kiểm thử Tạo mới Phiếu Đề nghị Mua hàng PR (AC-11.02) ---');

  // Lấy lượng gợi ý trước khi tạo PR
  const initialSuggRes = await request(
    'GET',
    '/purchase-requests/suggestions?factoryId=1&materialId=17',
    plannerToken,
  );
  const initialSugg = initialSuggRes.body?.data?.items?.[0];
  const initialSentPrKg = initialSugg?.sentPrKg || 0;
  const initialSuggestedKg = initialSugg?.suggestedQtyKg || 0;

  // Tạo PR 1: 5.500 tấn (5500 kg)
  const createPr1Res = await request('POST', '/purchase-requests', plannerToken, {
    factoryId: 1,
    materialId: 17,
    supplierId: 14,
    requestedQtyTons: 5.5,
    needByDate: '2026-10-25',
    note: 'Đề nghị mua đợt 1 theo gợi ý F08',
  });

  const pr1 = createPr1Res.body?.data;
  assert(
    createPr1Res.status === 201 &&
      !!pr1?.requestId &&
      /^PR-\d{8}-\d{4}$/.test(pr1?.requestCode) &&
      pr1?.status === 'SENT' &&
      pr1?.requestedQtyKg === 5500 &&
      pr1?.requestedQtyTons === 5.5,
    'AC-11.02a',
    `Tạo PR #1 thành công: Mã = ${pr1?.requestCode}, Trạng thái = ${pr1?.status}, Số lượng = 5.500 tấn (5500 kg)`,
    JSON.stringify(createPr1Res.body),
  );

  // Tạo PR 2: 2.000 tấn (2000 kg)
  const createPr2Res = await request('POST', '/purchase-requests', plannerToken, {
    factoryId: 1,
    materialId: 17,
    supplierId: 14,
    requestedQtyKg: 2000,
    needByDate: '2026-10-28',
    note: 'Đề nghị mua đợt 2 thử nghiệm chuyển trạng thái',
  });

  const pr2 = createPr2Res.body?.data;
  assert(
    createPr2Res.status === 201 &&
      !!pr2?.requestId &&
      pr2?.requestCode !== pr1?.requestCode &&
      pr2?.status === 'SENT' &&
      pr2?.requestedQtyKg === 2000,
    'AC-11.02b',
    `Tạo PR #2 thành công: Mã = ${pr2?.requestCode} (số thứ tự tự tăng chống trùng lặp)`,
  );

  // Kiểm tra phản ánh khấu trừ tức thời vào gợi ý mua (BR-25a)
  const suggAfterPrRes = await request(
    'GET',
    '/purchase-requests/suggestions?factoryId=1&materialId=17',
    plannerToken,
  );
  const suggAfterPr = suggAfterPrRes.body?.data?.items?.[0];
  const expectedNewSentPrKg = initialSentPrKg + 5500 + 2000;

  assert(
    suggAfterPr?.sentPrKg === expectedNewSentPrKg,
    'AC-11.02c',
    `Thuật toán BR-25a lập tức khấu trừ tổng PR đang SENT = ${suggAfterPr?.sentPrKg} kg (tăng thêm 7.500 kg so với ban đầu)`,
  );

  // =========================================================================
  // 3. KIỂM THỬ VÒNG ĐỜI TRẠNG THÁI PR - BR-27, BR-27a (AC-11.03)
  // =========================================================================
  console.log('\n--- 3. Kiểm thử Vòng đời Trạng thái PR & Khóa Trạng thái Cuối (BR-27, BR-27a) (AC-11.03) ---');

  // 3a. Chuyển sang MATCHED nhưng thiếu số PO -> Từ chối HTTP 400 Bad Request (BR-27)
  const matchWithoutPoRes = await request(
    'PATCH',
    `/purchase-requests/${pr2.requestId}/status`,
    plannerToken,
    { status: 'MATCHED' },
  );
  const matchWithoutPoErr = matchWithoutPoRes.body?.error?.message || matchWithoutPoRes.body?.message || '';
  assert(
    matchWithoutPoRes.status === 400 && matchWithoutPoErr.includes('bắt buộc phải cung cấp số PO'),
    'AC-11.03a',
    'Chặn chuyển sang MATCHED khi thiếu số PO với HTTP 400 Bad Request (BR-27)',
    JSON.stringify(matchWithoutPoRes.body),
  );

  // 3b. Chuyển sang MATCHED kèm số PO hợp lệ -> Thành công HTTP 200 (BR-27)
  const matchWithPoRes = await request(
    'PATCH',
    `/purchase-requests/${pr2.requestId}/status`,
    plannerToken,
    { status: 'MATCHED', poNumber: 'PO-2026-999' },
  );
  const matchedPr2 = matchWithPoRes.body?.data;
  assert(
    matchWithPoRes.status === 200 &&
      matchedPr2?.status === 'MATCHED' &&
      matchedPr2?.poNumber === 'PO-2026-999',
    'AC-11.03b',
    `Chuyển PR #2 sang MATCHED thành công kèm số PO = ${matchedPr2?.poNumber}`,
  );

  // 3c. Thử thay đổi trạng thái từ MATCHED (trạng thái kết thúc) sang CANCELLED hoặc SENT -> Bị từ chối HTTP 409 Conflict (BR-27a)
  const changeFromMatchedRes = await request(
    'PATCH',
    `/purchase-requests/${pr2.requestId}/status`,
    plannerToken,
    { status: 'CANCELLED', cancelReason: 'Cố tình đổi lại' },
  );
  assert(
    changeFromMatchedRes.status === 409,
    'AC-11.03c',
    'Khóa bất biến trạng thái cuối: Không thể thay đổi trạng thái từ MATCHED -> Bị từ chối với HTTP 409 Conflict (BR-27a)',
    JSON.stringify(changeFromMatchedRes.body),
  );

  // 3d. Hủy PR #1 (SENT -> CANCELLED) kèm lý do hủy
  const cancelPr1Res = await request(
    'PATCH',
    `/purchase-requests/${pr1.requestId}/status`,
    plannerToken,
    { status: 'CANCELLED', cancelReason: 'Kế hoạch sản xuất dời sang tháng sau' },
  );
  const cancelledPr1 = cancelPr1Res.body?.data;
  assert(
    cancelPr1Res.status === 200 &&
      cancelledPr1?.status === 'CANCELLED' &&
      cancelledPr1?.note?.includes('Lý do hủy'),
    'AC-11.03d',
    `Hủy PR #1 thành công: Trạng thái = CANCELLED, Ghi chú cập nhật lý do hủy`,
  );

  // 3e. Thử thay đổi từ CANCELLED sang EXPIRED -> Bị từ chối HTTP 409 Conflict (BR-27a)
  const changeFromCancelledRes = await request(
    'PATCH',
    `/purchase-requests/${pr1.requestId}/status`,
    plannerToken,
    { status: 'EXPIRED' },
  );
  assert(
    changeFromCancelledRes.status === 409,
    'AC-11.03e',
    'Khóa bất biến trạng thái cuối: Không thể thay đổi trạng thái từ CANCELLED -> Bị từ chối với HTTP 409 Conflict (BR-27a)',
  );

  // =========================================================================
  // 4. KIỂM THỬ XUẤT FILE EXCEL PR (AC-11.04)
  // =========================================================================
  console.log('\n--- 4. Kiểm thử Xuất File Excel Đề nghị Mua hàng (AC-11.04) ---');

  const exportRes = await request(
    'POST',
    '/purchase-requests/export',
    plannerToken,
    { requestIds: [pr1.requestId, pr2.requestId] },
    true, // binary mode
  );

  assert(
    exportRes.status === 200 && exportRes.buffer?.length > 1000,
    'AC-11.04a',
    `POST /api/v1/purchase-requests/export trả về file Excel hợp lệ (${exportRes.buffer?.length} bytes)`,
  );

  const workbook = XLSX.read(exportRes.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const exportedRows = XLSX.utils.sheet_to_json(worksheet);

  assert(
    sheetName === 'Purchase_Requests' &&
      Array.isArray(exportedRows) &&
      exportedRows.length === 2 &&
      exportedRows.some((r) => r['Mã Đề Nghị'] === pr1.requestCode) &&
      exportedRows.some((r) => r['Mã Đề Nghị'] === pr2.requestCode),
    'AC-11.04b',
    `Đọc file Excel thành công: Sheet 'Purchase_Requests' chứa đủ 2 dòng PR với đầy đủ các cột chuẩn ERP`,
  );

  // =========================================================================
  // 5. KIỂM THỬ PHÂN QUYỀN, DANH SÁCH & AUDIT LOG (AC-11.05)
  // =========================================================================
  console.log('\n--- 5. Kiểm thử Phân quyền, Danh sách PR & Nhật ký Kiểm toán (AC-11.05) ---');

  // 5a. User FACTORY không có quyền purchase-request.view -> Bị chặn HTTP 403 Forbidden
  const factoryViewRes = await request(
    'GET',
    '/purchase-requests/suggestions',
    factoryToken,
  );
  assert(
    factoryViewRes.status === 403,
    'AC-11.05a',
    'User vai trò FACTORY không có quyền purchase-request.view -> Bị chặn với HTTP 403 Forbidden khi xem gợi ý mua',
  );

  // 5b. User FACTORY không có quyền purchase-request.create -> Bị chặn HTTP 403 Forbidden
  const factoryCreateRes = await request('POST', '/purchase-requests', factoryToken, {
    factoryId: 1,
    materialId: 17,
    supplierId: 14,
    requestedQtyKg: 1000,
    needByDate: '2026-10-30',
  });
  assert(
    factoryCreateRes.status === 403,
    'AC-11.05b',
    'User vai trò FACTORY không có quyền purchase-request.create -> Bị chặn với HTTP 403 Forbidden khi tạo PR',
  );

  // 5c. User PLANNER truy vấn danh sách PR phân trang chuẩn
  const listPrRes = await request(
    'GET',
    '/purchase-requests?page=1&pageSize=10',
    plannerToken,
  );
  const listData = listPrRes.body?.data;
  assert(
    listPrRes.status === 200 &&
      Array.isArray(listData?.items) &&
      listData?.meta?.total >= 2,
    'AC-11.05c',
    `GET /api/v1/purchase-requests trả về danh sách PR phân trang chuẩn (total = ${listData?.meta?.total})`,
  );

  // 5d. Kiểm tra nhật ký kiểm toán sys_Audit_Log ghi nhận đầy đủ các sự kiện F08
  const auditRes = await request(
    'GET',
    '/audit-logs?actionCode=PURCHASE_REQUEST_CREATE&page=1&pageSize=5',
    adminToken,
  );
  const auditLogs = Array.isArray(auditRes.body?.data)
    ? auditRes.body.data
    : auditRes.body?.data?.items || [];
  const latestPrCreateAudit = auditLogs.find((a) => a.actionCode === 'PURCHASE_REQUEST_CREATE');

  assert(
    auditRes.status === 200 &&
      !!latestPrCreateAudit &&
      latestPrCreateAudit.targetEntity === 'fact_Purchase_Request' &&
      latestPrCreateAudit.status === 'SUCCESS',
    'AC-11.05d',
    `sys_Audit_Log ghi nhận sự kiện PURCHASE_REQUEST_CREATE thành công bởi user ${latestPrCreateAudit?.username}`,
  );

  const statusAuditRes = await request(
    'GET',
    '/audit-logs?actionCode=PURCHASE_REQUEST_STATUS_CHANGE&page=1&pageSize=5',
    adminToken,
  );
  const statusAuditLogs = Array.isArray(statusAuditRes.body?.data)
    ? statusAuditRes.body.data
    : statusAuditRes.body?.data?.items || [];
  const latestStatusAudit = statusAuditLogs.find((a) => a.actionCode === 'PURCHASE_REQUEST_STATUS_CHANGE');

  assert(
    statusAuditRes.status === 200 &&
      !!latestStatusAudit &&
      latestStatusAudit.status === 'SUCCESS',
    'AC-11.05e',
    `sys_Audit_Log ghi nhận sự kiện PURCHASE_REQUEST_STATUS_CHANGE thành công`,
  );

  // TỔNG KẾT
  console.log('\n========================================================================');
  console.log(` KẾT QUẢ KIỂM THỬ TASK-11: ${passed} PASSED / ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled Test Error:', err);
  process.exit(1);
});
