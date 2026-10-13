/**
 * Test Runner cho TASK-05: F03b - Nạp Bộ 5 File ERP Ngày Chốt & Forecast Trong 1 Transaction Nguyên Tử
 * Kiểm tra toàn diện các tiêu chí nghiệm thu:
 * - AC-05.01: Nạp đồng thời 5 file ERP (SOH, Movement, PO Pending, POR, TO) thành công, trích xuất ngày C = D - 1 (BR-15e).
 * - AC-05.02: Tính nguyên tử (BR-17) & Chặn lỗi dòng/mã lạ (BR-21, BR-22a) -> Rollback toàn bộ khi thiếu file hoặc có mã lạ/số âm/sai ĐVT.
 * - AC-05.03: Tự động kiểm tra chéo 5 quy tắc BR-15d + BR-21a và ghi nhận vào sys_Data_Quality_Issue.
 * - AC-05.04: Nạp file Forecast (Sheet RM Usage) xoay ma trận Nhà máy - Nguyên liệu theo tháng & version (BR-15b).
 */

import * as XLSX from 'xlsx';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

function makeSheetBuffer(sheetName, rows, leadingAoA = null) {
  const wb = XLSX.utils.book_new();
  let ws;
  if (leadingAoA) {
    ws = XLSX.utils.aoa_to_sheet(leadingAoA);
    XLSX.utils.sheet_add_json(ws, rows, { origin: -1 });
  } else {
    ws = XLSX.utils.json_to_sheet(rows);
  }
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function createDailySetBuffers({
  onHandRows = [
    // Kho 1001 (DN) - NL 0014: SOH RAW = 5000 kg (khớp Closed Onhand)
    { 'WAREHOUSE': 'DN', 'ORG CODE': '1001', 'SUB INV': 'RAW', 'ITEM CODE': '0014', 'SOH': 5000 },
    // Dòng tồn = 0 (sẽ bị bỏ qua theo BR-15c)
    { 'WAREHOUSE': 'DN', 'ORG CODE': '1001', 'SUB INV': 'RAW', 'ITEM CODE': '0025', 'SOH': 0 },
    // Kho 1002 (BD) - NL 0014: SOH RAW = 2800 kg (cố tình lệch với Closed Onhand = 3000 để test Check #2 CLOSED_SOH_MISMATCH)
    { 'WAREHOUSE': 'BD', 'ORG CODE': '1002', 'SUB INV': 'RAW', 'ITEM CODE': '0014', 'SOH': 2800 },
    // Kho 1001 (DN) - NL 0014: SOH TRANSIT = 1500 kg (cố tình lệch với TO Shipped = 1000 để test Check #4 TRANSIT_TO_MISMATCH)
    { 'WAREHOUSE': 'DN', 'ORG CODE': '1001', 'SUB INV': 'TRANSIT', 'ITEM CODE': '0014', 'SOH': 1500 },
    // Kho 1003 (VL2) - NL 0038: Cặp không nằm trong Plant Items để test BR-21a PAIR_NOT_IN_MASTER
    { 'WAREHOUSE': 'VL2', 'ORG CODE': '1003', 'SUB INV': 'RAW', 'ITEM CODE': '0038', 'SOH': 400 },
  ],
  movementRows = [
    // Kho 1001 - NL 0014: Phương trình cân đối: 4000 + 2000 + 0 - 1000 - 0 + 0 = 5000 (Chuẩn)
    {
      'OU': 'CPV', 'Org Code': '1001', 'Item code': '0014',
      'Begin Onhand': 4000, 'Qty Receive': 2000, 'Wip Issue': 1000,
      'Transfer In': 0, 'Transfer Out': 0, 'Adjust': 0, 'Closed Onhand': 5000,
    },
    // Kho 1002 - NL 0014: Cố tình lệch phương trình Movement (2000 + 1500 - 400 = 3100 != 3000) -> Check #1 MOVEMENT_EQUATION_MISMATCH
    {
      'OU': 'CPV', 'Org Code': '1002', 'Item code': '0014',
      'Begin Onhand': 2000, 'Qty Receive': 1500, 'Wip Issue': 400,
      'Transfer In': 0, 'Transfer Out': 0, 'Adjust': 0, 'Closed Onhand': 3000,
    },
  ],
  poPendingRows = [
    // Đơn PO hợp lệ, quy cách bao 25kg (1000 chia hết cho 25)
    {
      'Site': 'SOUTH', 'Warehouse': '1001', 'Vendor account': 'VEND001',
      'Purchase order/PAG': 'PO-2026-001', 'Item number': '0014', 'Unit': 'kg',
      'Quantity': 3000, 'Received/Release': 2000, 'Deliver remainder': 1000,
      'Delivery date': '2026-09-25', 'Line status': 'Open order',
    },
    // Đơn PAG từ Nhà cung cấp mới VEND_NEW_AUTO (test tự động thêm NCC theo BR-21)
    // Deliver remainder = 510 kg (NL 0014 bao 25kg -> 510 không chia hết cho 25 -> Check #5 BAG_WEIGHT_MISMATCH)
    {
      'Site': 'SOUTH', 'Warehouse': '1002', 'Vendor account': 'VEND_NEW_AUTO',
      'Vendor name': 'Công ty TNHH Premix Mới Tự Động', 'Group': 'LOC_NEW',
      'Purchase order/PAG': 'PAG-2026-009', 'Item number': '0014', 'Unit': 'kg',
      'Quantity': 1000, 'Received/Release': 490, 'Deliver remainder': 510,
      'Delivery date': '2026-10-01', 'Line status': 'Open order',
    },
  ],
  poReceiptRows = [
    // Kho 1001 - NL 0014: Tổng nhận = 1750 kg (lệch với Movement Qty Receive = 2000 -> Check #3 POR_RECEIVE_MISMATCH)
    {
      'Site': 'SOUTH', 'WH': '1001', 'Code Vendor': 'VEND001',
      'PO Number': 'PO-2026-001', 'POR': 'POR-10001', 'Date Delivery': '2026-10-05',
      'Code RM': '0014', 'Unit': 'kg', 'Quantity': 1750, 'PAG': '', 'Truck number': '51C-123.45',
    },
  ],
  transferRows = [
    // TO xuất từ 1001 sang 1002 trạng thái Shipped = 1000 kg (lệch với SOH TRANSIT = 1500 -> Check #4 TRANSIT_TO_MISMATCH)
    {
      'Transfer Number': 'TO-2026-001', 'Item No': '0014',
      'From Warehouse': '1001', 'To Warehouse': '1002',
      'Transfer status': 'Shipped', 'Shipped Date': '2026-10-06',
      'Received Date': '', 'Shipped Qty': 1000, 'Posted Qty to onhand': 0,
    },
  ],
} = {}) {
  // File On Hand có dòng tổng ở trên để kiểm tra khả năng dò tìm dòng tiêu đề động
  const onHandLeading = [
    ['BÁO CÁO TỒN KHO ON HAND - CUT OFF 06H 07/10/2026'],
    ['Tổng cộng toàn hệ thống', '', '', '', '9700'],
    [],
  ];

  return {
    onHand: makeSheetBuffer('SOH', onHandRows, onHandLeading),
    movement: makeSheetBuffer('INV46', movementRows, [['TOTAL SUMMARY ROW', '', '', 6000, 3500, 1400, 0, 0, 0, 8000]]),
    poPending: makeSheetBuffer('FINISH PENDING', poPendingRows),
    poReceipt: makeSheetBuffer('POR', poReceiptRows),
    transfer: makeSheetBuffer('Sheet1', transferRows),
  };
}

function createForecastBuffer() {
  const wb = XLSX.utils.book_new();
  const aoa = [
    ['DỰ BÁO NHU CẦU NGUYÊN LIỆU THÁNG 2026-10'],
    ['Version Date: 2026-10-05'],
    [],
    ['Item code', 'Item name', 'DN', 'BD', 'VL2', 'HG', 'BD1', 'BD2', 'Total'],
    ['0014', 'Premix Heo Con 4%', '14000', '8400', '0', '', '5600', '2800', '30800'],
    ['0025', 'Premix Gà Đẻ 2.5%', '7.000,0', '4200', '1400', '2800', '', '', '15400'],
    ['0038', 'Vitamin C 99%', '2800', '1400', '560', '840', '0', '0', '5600'],
    ['Total', 'Tổng cộng', '23800', '14000', '1960', '3640', '5600', '2800', '51800'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'RM Usage');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function appendDailySetForm(buffers, fileNames = {}) {
  const fd = new FormData();
  if (buffers.onHand) {
    fd.append('onHand', new Blob([buffers.onHand]), fileNames.onHand || 'On Hand Cut off 06h 071026.xlsx');
  }
  if (buffers.movement) {
    fd.append('movement', new Blob([buffers.movement]), fileNames.movement || 'Movement Cut off 06h 071026.xlsx');
  }
  if (buffers.poPending) {
    fd.append('poPending', new Blob([buffers.poPending]), fileNames.poPending || 'PO Pending Cut off 06h 071026.xlsx');
  }
  if (buffers.poReceipt) {
    fd.append('poReceipt', new Blob([buffers.poReceipt]), fileNames.poReceipt || 'PO receipt 011026-061026.xlsx');
  }
  if (buffers.transfer) {
    fd.append('transfer', new Blob([buffers.transfer]), fileNames.transfer || 'Transfer Order 071026.xlsx');
  }
  return fd;
}

async function runTests() {
  console.log('======================================================================');
  console.log('CHƯƠNG TRÌNH KIỂM THỬ TỰ ĐỘNG TASK-05: F03b - BỘ 5 FILE ERP & FORECAST');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const getErrorMessage = (data) => data?.error?.message || data?.message || '';

  // Bước 0: Đăng nhập lấy Admin Token
  console.log('--- BƯỚC 0: ĐĂNG NHẬP HỆ THỐNG ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@1234' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.token;
  assert(loginRes.status === 200 && !!token, 'Lấy Admin JWT Token thành công');

  // Test 1: Xem trước (Preview / Dry-Run) Bộ 5 File ERP & Quy tắc Ngày chốt C = D - 1 (BR-15e)
  console.log('\n--- TEST 1: XEM TRƯỚC BỘ 5 FILE ERP (DRY-RUN) & TRÍCH XUẤT NGÀY C = D - 1 (BR-15e) ---');
  const validBuffers = createDailySetBuffers();
  const previewForm = appendDailySetForm(validBuffers);

  const previewRes = await fetch(`${BASE_URL}/import/preview/daily-set`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: previewForm,
  });
  const previewData = await previewRes.json();
  assert(previewRes.status === 200, `Preview trả về HTTP 200 (Status: ${previewRes.status})`);
  assert(previewData.data?.isDryRun === true, 'isDryRun = true');
  assert(previewData.data?.status === 'PREVIEW', `Trạng thái là PREVIEW (nhận: ${previewData.data?.status})`);
  assert(
    previewData.data?.cutoffDate === '2026-10-07' && previewData.data?.snapshotDate === '2026-10-06',
    `BR-15e: Trích xuất đúng Cutoff D = 2026-10-07 và Snapshot C = D - 1 = 2026-10-06 (nhận C=${previewData.data?.snapshotDate}, D=${previewData.data?.cutoffDate})`,
  );
  assert(
    previewData.data?.porStartDate === '2026-10-01' && previewData.data?.porEndDate === '2026-10-06',
    `BR-18: Trích xuất đúng khoảng ngày POR [2026-10-01 .. 2026-10-06] từ tên file`,
  );
  assert(previewData.data?.onHandRows === 3, `BR-15c: Chỉ đếm 3 dòng SOH RAW > 0 (bỏ dòng tồn=0 và dòng TRANSIT)`);
  assert(previewData.data?.issueCount >= 5, `Phát hiện trước ${previewData.data?.issueCount} cảnh báo kiểm chéo BR-15d/BR-21a`);

  // Test 2: Nạp chính thức Bộ 5 File ERP trong 1 Transaction (AC-05.01)
  console.log('\n--- TEST 2: THỰC THI NẠP CHÍNH THỨC BỘ 5 FILE ERP (AC-05.01) ---');
  const execForm = appendDailySetForm(validBuffers);
  const execRes = await fetch(`${BASE_URL}/import/execute/daily-set`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: execForm,
  });
  const execData = await execRes.json();
  assert(execRes.status === 200, `Execute Daily Set trả về HTTP 200 (Status: ${execRes.status})`);
  const dailyBatchId = execData.data?.batchId;
  assert(dailyBatchId > 0, `Tạo BatchID thành công: #${dailyBatchId}`);
  assert(execData.data?.status === 'COMPLETED', 'Trạng thái: COMPLETED');
  assert(execData.data?.onHandRows === 3, 'Ghi nhận 3 dòng fact_Inventory_SOH (RAW)');
  assert(execData.data?.movementRows === 2, 'Ghi nhận 2 dòng fact_Inventory_Movement');
  assert(execData.data?.poPendingRows === 2, 'Ghi nhận 2 dòng fact_PO_Pending');
  assert(execData.data?.poReceiptRows === 1, 'Ghi nhận 1 dòng fact_PO_Receipt');
  assert(execData.data?.transferRows === 1, 'Ghi nhận 1 dòng fact_Internal_Transfer');

  // Kiểm tra Nhà cung cấp mới VEND_NEW_AUTO đã được tự động thêm vào dim_Supplier theo BR-21
  const supRes = await fetch(`${BASE_URL}/catalog/suppliers?search=VEND_NEW_AUTO`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const supData = await supRes.json();
  const autoSup = supData.data?.find((s) => s.supplierCode === 'VEND_NEW_AUTO');
  assert(!!autoSup, 'BR-21: Tự động bổ sung Nhà cung cấp mới (VEND_NEW_AUTO) từ file PO Pending vào dim_Supplier');

  // Test 3: Kiểm tra đủ 5 loại cảnh báo kiểm chéo BR-15d & BR-21a (AC-05.03)
  console.log('\n--- TEST 3: KIỂM TRA 5 BÀI KIỂM TRA CHÉO BR-15d & BR-21a (AC-05.03) ---');
  const issuesRes = await fetch(`${BASE_URL}/import/batches/${dailyBatchId}/issues`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const issuesData = await issuesRes.json();
  assert(issuesRes.status === 200, `Truy vấn GET /import/batches/${dailyBatchId}/issues trả về HTTP 200`);
  const issueTypes = new Set((issuesData.data || []).map((i) => i.issueType));

  assert(issueTypes.has('PAIR_NOT_IN_MASTER'), 'BR-21a: Phát hiện cảnh báo PAIR_NOT_IN_MASTER');
  assert(issueTypes.has('MOVEMENT_EQUATION_MISMATCH'), 'BR-15d #1: Phát hiện cảnh báo MOVEMENT_EQUATION_MISMATCH');
  assert(issueTypes.has('CLOSED_SOH_MISMATCH'), 'BR-15d #2: Phát hiện cảnh báo CLOSED_SOH_MISMATCH');
  assert(issueTypes.has('POR_RECEIVE_MISMATCH'), 'BR-15d #3: Phát hiện cảnh báo POR_RECEIVE_MISMATCH');
  assert(issueTypes.has('TRANSIT_TO_MISMATCH'), 'BR-15d #4: Phát hiện cảnh báo TRANSIT_TO_MISMATCH');
  assert(issueTypes.has('BAG_WEIGHT_MISMATCH'), 'BR-15d #5: Phát hiện cảnh báo BAG_WEIGHT_MISMATCH');

  // Test 4: Tính nguyên tử BR-17 & Chặn lỗi mã lạ / lỗi dòng (AC-05.02)
  console.log('\n--- TEST 4: KIỂM TRA TÍNH NGUYÊN TỬ BR-17 & CHẶN MÃ LẠ / SỐ ÂM (AC-05.02) ---');

  // 4a. Thiếu 1 trong 5 file (bỏ file transfer)
  const incompleteForm = appendDailySetForm({
    onHand: validBuffers.onHand,
    movement: validBuffers.movement,
    poPending: validBuffers.poPending,
    poReceipt: validBuffers.poReceipt,
    transfer: null,
  });
  const incompleteRes = await fetch(`${BASE_URL}/import/execute/daily-set`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: incompleteForm,
  });
  const incompleteMsg = getErrorMessage(await incompleteRes.json());
  assert(
    incompleteRes.status === 400 && incompleteMsg.includes('BR-17'),
    `BR-17: Thiếu 1 trong 5 file bị chặn ngay lập tức với HTTP 400 ("${incompleteMsg}")`,
  );

  // 4b. Chứa mã Nguyên liệu lạ chưa có trong Master Data (BR-21) -> ROLLBACK
  const unknownItemBuffers = createDailySetBuffers({
    onHandRows: [
      { 'WAREHOUSE': 'DN', 'ORG CODE': '1001', 'SUB INV': 'RAW', 'ITEM CODE': 'RM_UNKNOWN_999', 'SOH': 1000 },
    ],
  });
  const unknownItemForm = appendDailySetForm(unknownItemBuffers);
  const unknownItemRes = await fetch(`${BASE_URL}/import/execute/daily-set?snapshotDate=2026-10-08`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: unknownItemForm,
  });
  const unknownItemMsg = getErrorMessage(await unknownItemRes.json());
  assert(
    unknownItemRes.status === 400 && unknownItemMsg.includes('BR-21'),
    `BR-21: Mã nguyên liệu lạ bị chặn và ROLLBACK với HTTP 400 ("${unknownItemMsg}")`,
  );

  // 4c. Chứa đơn vị tính khác 'kg' trên POR (BR-18a / BR-22a)
  const badUnitBuffers = createDailySetBuffers({
    poReceiptRows: [
      {
        'Site': 'SOUTH', 'WH': '1001', 'Code Vendor': 'VEND001',
        'PO Number': 'PO-2026-001', 'POR': 'POR-999', 'Date Delivery': '2026-10-05',
        'Code RM': '0014', 'Unit': 'TON', 'Quantity': 10, 'PAG': '', 'Truck number': '',
      },
    ],
  });
  const badUnitForm = appendDailySetForm(badUnitBuffers);
  const badUnitRes = await fetch(`${BASE_URL}/import/execute/daily-set`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: badUnitForm,
  });
  const badUnitMsg = getErrorMessage(await badUnitRes.json());
  assert(
    badUnitRes.status === 400 && badUnitMsg.includes('khác "kg"'),
    `BR-22a: Đơn vị tính khác "kg" bị từ chối với HTTP 400 ("${badUnitMsg}")`,
  );

  // Test 5: Nạp file Forecast RM Usage xoay ma trận (AC-05.04 - BR-15b)
  console.log('\n--- TEST 5: NẠP FILE FORECAST RM USAGE XOAY MA TRẬN (AC-05.04) ---');
  const forecastBuf = createForecastBuffer();

  // 5a. Forecast Dry-Run
  const fcDryForm = new FormData();
  fcDryForm.append('file', new Blob([forecastBuf]), 'RM Usage 2026-10.xlsx');
  const fcDryRes = await fetch(`${BASE_URL}/import/forecast?dryRun=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fcDryForm,
  });
  const fcDryData = await fcDryRes.json();
  assert(fcDryRes.status === 200 && fcDryData.data?.status === 'PREVIEW', 'Forecast Dry-run trả về HTTP 200 PREVIEW');
  assert(fcDryData.data?.periodMonth === '2026-10-01', `Trích xuất đúng PeriodMonth = 2026-10-01`);
  assert(fcDryData.data?.totalRows === 12, `Xoay ma trận đúng 12 ô có nhu cầu > 0 (nhận: ${fcDryData.data?.totalRows})`);
  assert(fcDryData.data?.totalForecastKg === 51800, `Tổng nhu cầu xoay ma trận đúng 51,800 kg (hỗ trợ cả số kiểu châu Âu 7.000,0)`);

  // 5b. Forecast Nạp chính thức
  const fcExecForm = new FormData();
  fcExecForm.append('file', new Blob([forecastBuf]), 'RM Usage 2026-10.xlsx');
  const fcExecRes = await fetch(`${BASE_URL}/import/forecast`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fcExecForm,
  });
  const fcExecData = await fcExecRes.json();
  assert(fcExecRes.status === 200 && fcExecData.data?.status === 'COMPLETED', `Nạp Forecast chính thức thành công (Batch #${fcExecData.data?.batchId})`);
  assert(fcExecData.data?.totalForecastKg === 51800, 'Ghi nhận tổng nhu cầu 51,800 kg vào fact_Demand_Forecast');

  // Test 6: Kiểm tra Lịch sử nạp & Audit Log
  console.log('\n--- TEST 6: KIỂM TRA LỊCH SỬ NẠP & AUDIT LOG ---');
  const histRes = await fetch(`${BASE_URL}/import/history?batchType=DAILY_SET`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const histData = await histRes.json();
  assert(histRes.status === 200 && histData.data?.length >= 1, `Lịch sử nạp DAILY_SET ghi nhận đầy đủ (${histData.data?.length} lô)`);

  const auditRes = await fetch(`${BASE_URL}/audit-logs?pageSize=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const auditData = await auditRes.json();
  const auditCodes = new Set((auditData.data || []).map((a) => a.actionCode));
  assert(auditCodes.has('IMPORT_DAILY_SET_SUCCESS'), 'Audit Log ghi nhận sự kiện IMPORT_DAILY_SET_SUCCESS');
  assert(auditCodes.has('IMPORT_DAILY_SET_FAILED'), 'Audit Log ghi nhận sự kiện IMPORT_DAILY_SET_FAILED khi rollback');
  assert(auditCodes.has('IMPORT_FORECAST'), 'Audit Log ghi nhận sự kiện IMPORT_FORECAST');

  console.log('\n======================================================================');
  console.log(`KẾT QUẢ KIỂM THỬ TASK-05: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Lỗi ngoại lệ khi chạy test:', err);
  process.exit(1);
});
