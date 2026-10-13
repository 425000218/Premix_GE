/**
 * Test Runner cho TASK-04: F03a - Nạp File Master Data (5 sheets) vào CSDL
 * Kiểm tra các tiêu chí nghiệm thu:
 * - AC-04.01: Nạp file Master Data hợp lệ (5 sheets) nguyên tử thành công.
 * - AC-04.02: BR-31a (Ngừng dùng mã vắng mặt IsActive = 0, tái kích hoạt IsActive = 1).
 * - AC-04.03: Chặn file sai định dạng, thiếu sheet bắt buộc, thiếu cột bắt buộc (HTTP 400).
 * - AC-04.04: Chế độ xem trước Dry-Run không ghi CSDL.
 * - AC-04.05: Tra cứu lịch sử nạp GET /api/v1/import/history và chi tiết batch.
 * - AC-04.06: Ghi nhận nhật ký kiểm toán sys_Audit_Log.
 */

import * as XLSX from 'xlsx';

const BASE_URL = 'http://127.0.0.1:3000/api/v1';

function createMasterDataWorkbook({
  plants = [
    { 'Mã nhà máy': 'DN', 'Tên': 'Nhà máy Đồng Nai', 'Region': 'SOUTH', 'Type': 'Feed', 'Org codes': '1001' },
    { 'Mã nhà máy': 'BD', 'Tên': 'Nhà máy Bình Dương', 'Region': 'SOUTH', 'Type': 'Feed', 'Org codes': '1002' },
    { 'Mã nhà máy': 'VL2', 'Tên': 'Nhà máy Vĩnh Long 2', 'Region': 'SOUTH', 'Type': 'Aqua', 'Org codes': '1003' },
    { 'Mã nhà máy': 'HG', 'Tên': 'Nhà máy Hậu Giang', 'Region': 'SOUTH', 'Type': 'Aqua', 'Org codes': '1004' },
    { 'Mã nhà máy': 'BD1', 'Tên': 'Nhà máy Bình Định 1', 'Region': 'CENTRAL', 'Type': 'Feed', 'Org codes': '1005' },
    { 'Mã nhà máy': 'BD2', 'Tên': 'Nhà máy Bình Định 2', 'Region': 'CENTRAL', 'Type': 'Feed', 'Org codes': '1006' },
  ],
  items = [
    { 'Item code': '0014', 'Item name': 'Premix Heo Con 4%', 'Category': 'PREMIX', 'Nhóm': 'Premix', 'Quy cách': 'Bao 25kg', 'Bao (kg)': 25, 'UOM': 'kg', 'Item type': 'Finished' },
    { 'Item code': '0025', 'Item name': 'Premix Gà Đẻ 2.5%', 'Category': 'PREMIX', 'Nhóm': 'Premix', 'Quy cách': 'Bao 25kg', 'Bao (kg)': 25, 'UOM': 'kg', 'Item type': 'Finished' },
    { 'Item code': '0038', 'Item name': 'Vitamin C 99%', 'Category': 'VITAMIN', 'Nhóm': 'Ngoài premix', 'Quy cách': 'Thùng 20kg', 'Bao (kg)': 20, 'UOM': 'kg', 'Item type': 'Raw' },
    { 'Item code': '0099', 'Item name': 'Khoáng Vi Lượng Kẽm', 'Category': 'MINERAL', 'Nhóm': 'Ngoài premix', 'Quy cách': '', 'Bao (kg)': '', 'UOM': 'kg', 'Item type': 'Raw' },
  ],
  plantItems = [
    { 'OU': 'CPV', 'Org code': '1001', 'Item code': '0014' },
    { 'OU': 'CPV', 'Org code': '1001', 'Item code': '0025' },
    { 'OU': 'CPV', 'Org code': '1002', 'Item code': '0014' },
    { 'OU': 'CPV', 'Org code': '1002', 'Item code': '0038' },
    { 'OU': 'CPV', 'Org code': '1003', 'Item code': '0099' },
  ],
  vendors = [
    { 'Vendor account': 'VEND001', 'Vendor name': 'Công ty CP Dược Thú Y TW', 'Group': 'LOC_PHARMA', 'Country': 'Vietnam' },
    { 'Vendor account': 'VEND002', 'Vendor name': 'BASF Nutrition GmbH', 'Group': 'FOR_EU', 'Country': 'Germany' },
    { 'Vendor account': 'VEND003', 'Vendor name': 'Adisseo Asia Pacific', 'Group': 'FOR_ASIA', 'Country': 'Singapore' },
  ],
  substitutions = [
    { 'Material code': '0014', 'Sub material code': '0025', 'Ratio': 1.0, 'Note': 'Thay thế khẩn cấp' },
  ],
  vendorItems = [
    { 'Item code': '0014', 'Vendor account': 'VEND001' },
    { 'Item code': '0038', 'Vendor account': 'VEND002' },
  ],
  includeSheet5 = 'Vendor Items', // 'Vendor Items' | 'Substitutions' | 'none'
} = {}) {
  const wb = XLSX.utils.book_new();

  if (plants) {
    const ws = XLSX.utils.json_to_sheet(plants);
    XLSX.utils.book_append_sheet(wb, ws, 'Plants');
  }

  if (items) {
    const ws = XLSX.utils.json_to_sheet(items);
    XLSX.utils.book_append_sheet(wb, ws, 'Items');
  }

  if (plantItems) {
    const ws = XLSX.utils.json_to_sheet(plantItems);
    XLSX.utils.book_append_sheet(wb, ws, 'Plant Items');
  }

  if (vendors) {
    const ws = XLSX.utils.json_to_sheet(vendors);
    XLSX.utils.book_append_sheet(wb, ws, 'Vendors');
  }

  if (includeSheet5 === 'Vendor Items' && vendorItems) {
    const ws = XLSX.utils.json_to_sheet(vendorItems);
    XLSX.utils.book_append_sheet(wb, ws, 'Vendor Items');
  } else if (includeSheet5 === 'Substitutions' && substitutions) {
    const ws = XLSX.utils.json_to_sheet(substitutions);
    XLSX.utils.book_append_sheet(wb, ws, 'Substitutions');
  }

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function runTests() {
  console.log('================================================================');
  console.log('CHƯƠNG TRÌNH KIỂM THỬ TỰ ĐỘNG TASK-04: F03a - NẠP MASTER DATA');
  console.log('================================================================\n');

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

  // 1. Đăng nhập để lấy Admin Token
  console.log('--- BƯỚC 0: ĐĂNG NHẬP HỆ THỐNG ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin@1234' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.token || loginData.data?.accessToken;
  assert(loginRes.status === 200 && !!token, 'Lấy Admin JWT Token thành công');

  // Test 1: Chế độ xem trước Dry-Run (AC-04.04)
  console.log('\n--- TEST 1: CHẾ ĐỘ XEM TRƯỚC (DRY-RUN) ---');
  const validBuffer = createMasterDataWorkbook();
  const formDataDry = new FormData();
  formDataDry.append('file', new Blob([validBuffer]), 'Master Data.xlsx');

  const dryRes = await fetch(`${BASE_URL}/import/master-data?dryRun=true`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formDataDry,
  });
  const dryData = await dryRes.json();
  assert(dryRes.status === 200, `Dry-run trả về HTTP 200 (Status: ${dryRes.status})`);
  assert(dryData.data?.isDryRun === true, 'isDryRun = true');
  assert(dryData.data?.status === 'PREVIEW', `Trạng thái là PREVIEW (nhận: ${dryData.data?.status})`);
  assert(dryData.data?.plantsCount === 6, `Đếm đúng 6 nhà máy (nhận: ${dryData.data?.plantsCount})`);
  assert(dryData.data?.materialsCount === 4, `Đếm đúng 4 nguyên liệu (nhận: ${dryData.data?.materialsCount})`);

  // Test 2: Nạp file Master Data hợp lệ lần 1 (AC-04.01)
  console.log('\n--- TEST 2: NẠP MASTER DATA CHÍNH THỨC (AC-04.01) ---');
  const formData1 = new FormData();
  formData1.append('file', new Blob([validBuffer]), 'Master Data.xlsx');

  const importRes1 = await fetch(`${BASE_URL}/import/master-data`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData1,
  });
  const importData1 = await importRes1.json();
  assert(importRes1.status === 200, `Nạp Master Data trả về HTTP 200 (Status: ${importRes1.status})`);
  const batchId1 = importData1.data?.batchId;
  assert(batchId1 > 0, `Tạo BatchID thành công: #${batchId1}`);
  assert(importData1.data?.status === 'COMPLETED', 'Trạng thái hoàn thành: COMPLETED');
  assert(importData1.data?.plantsCount === 6, 'Số lượng nhà máy nạp: 6');
  assert(importData1.data?.materialsCount === 4, 'Số lượng nguyên liệu nạp: 4');
  assert(importData1.data?.suppliersCount === 3, 'Số lượng nhà cung cấp nạp: 3');
  assert(importData1.data?.plantItemsCount === 5, 'Số lượng cặp theo dõi nạp: 5');

  // Kiểm tra mã '0014' giữ nguyên số 0 đầu
  const checkMatRes = await fetch(`${BASE_URL}/catalog/materials?search=0014`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const checkMatData = await checkMatRes.json();
  const mat0014 = checkMatData.data?.find((m) => m.materialCode === '0014');
  assert(!!mat0014, `Nguyên liệu '0014' tồn tại trong CSDL giữ nguyên số 0 đầu`);
  assert(mat0014?.isActive === true, `Nguyên liệu '0014' có IsActive = true`);

  // Test 3: Kiểm tra quy tắc BR-31a (Ngừng dùng mã vắng mặt) (AC-04.02)
  console.log('\n--- TEST 3: KIỂM TRA QUY TẮC BR-31a (NGỪNG DÙNG MÃ VẮNG MẶT) ---');
  // Tạo file mới bỏ nguyên liệu '0099'
  const bufferWithout0099 = createMasterDataWorkbook({
    items: [
      { 'Item code': '0014', 'Item name': 'Premix Heo Con 4%', 'Category': 'PREMIX', 'Nhóm': 'Premix', 'Quy cách': 'Bao 25kg', 'Bao (kg)': 25, 'UOM': 'kg', 'Item type': 'Finished' },
      { 'Item code': '0025', 'Item name': 'Premix Gà Đẻ 2.5%', 'Category': 'PREMIX', 'Nhóm': 'Premix', 'Quy cách': 'Bao 25kg', 'Bao (kg)': 25, 'UOM': 'kg', 'Item type': 'Finished' },
      { 'Item code': '0038', 'Item name': 'Vitamin C 99%', 'Category': 'VITAMIN', 'Nhóm': 'Ngoài premix', 'Quy cách': 'Thùng 20kg', 'Bao (kg)': 20, 'UOM': 'kg', 'Item type': 'Raw' },
    ],
    plantItems: [
      { 'OU': 'CPV', 'Org code': '1001', 'Item code': '0014' },
      { 'OU': 'CPV', 'Org code': '1001', 'Item code': '0025' },
      { 'OU': 'CPV', 'Org code': '1002', 'Item code': '0014' },
      { 'OU': 'CPV', 'Org code': '1002', 'Item code': '0038' },
    ],
  });

  const formData2 = new FormData();
  formData2.append('file', new Blob([bufferWithout0099]), 'Master Data_v2.xlsx');

  const importRes2 = await fetch(`${BASE_URL}/import/master-data`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData2,
  });
  const importData2 = await importRes2.json();
  assert(importRes2.status === 200, `Nạp file v2 trả về HTTP 200 (Batch #${importData2.data?.batchId})`);

  // Kiểm tra '0099' đã bị chuyển thành IsActive = false (không bị xóa cứng)
  const check0099Res = await fetch(`${BASE_URL}/catalog/materials?search=0099&isActive=false`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const check0099Data = await check0099Res.json();
  const mat0099 = check0099Data.data?.find((m) => m.materialCode === '0099');
  assert(!!mat0099, `Nguyên liệu '0099' vẫn tồn tại trong CSDL (không bị xóa cứng)`);
  assert(mat0099?.isActive === false, `Nguyên liệu '0099' có IsActive = false theo BR-31a`);

  // Test 4: Tái kích hoạt mã khi xuất hiện lại ở lần nạp sau (BR-31a round-trip)
  console.log('\n--- TEST 4: TÁI KÍCH HOẠT MÃ KHI XUẤT HIỆN LẠI (BR-31a ROUND-TRIP) ---');
  const formData3 = new FormData();
  formData3.append('file', new Blob([validBuffer]), 'Master Data_v3.xlsx');

  const importRes3 = await fetch(`${BASE_URL}/import/master-data`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData3,
  });
  assert(importRes3.status === 200, 'Nạp lại file đầy đủ thành công');

  const check0099Reactivated = await fetch(`${BASE_URL}/catalog/materials?search=0099&isActive=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const check0099ReactivatedData = await check0099Reactivated.json();
  const mat0099Reactivated = check0099ReactivatedData.data?.find((m) => m.materialCode === '0099');
  assert(mat0099Reactivated?.isActive === true, `Nguyên liệu '0099' đã tự động tái kích hoạt IsActive = true`);

  const getErrorMessage = (data) => data.error?.message || data.message || '';

  // Test 5: Từ chối file thiếu sheet bắt buộc (AC-04.03)
  console.log('\n--- TEST 5: TỪ CHỐI FILE THIẾU SHEET BẮT BUỘC ---');
  const wbMissingSheet = XLSX.utils.book_new();
  const wsPlants = XLSX.utils.json_to_sheet([
    { 'Mã nhà máy': 'DN', 'Tên': 'Nhà máy Đồng Nai', 'Region': 'SOUTH', 'Type': 'Feed', 'Org codes': '1001' },
  ]);
  XLSX.utils.book_append_sheet(wbMissingSheet, wsPlants, 'Plants');
  // Thiếu các sheet khác
  const bufferMissingSheet = XLSX.write(wbMissingSheet, { type: 'buffer', bookType: 'xlsx' });

  const formMissingSheet = new FormData();
  formMissingSheet.append('file', new Blob([bufferMissingSheet]), 'Invalid_MissingSheet.xlsx');

  const missingSheetRes = await fetch(`${BASE_URL}/import/master-data`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formMissingSheet,
  });
  assert(missingSheetRes.status === 400, `Thiếu sheet bị từ chối với HTTP 400 (Status: ${missingSheetRes.status})`);
  const missingSheetData = await missingSheetRes.json();
  const missingSheetMsg = getErrorMessage(missingSheetData);
  assert(
    missingSheetMsg.includes('Thiếu sheet bắt buộc'),
    `Thông báo lỗi chính xác: "${missingSheetMsg}"`,
  );

  // Test 6: Từ chối file thiếu cột bắt buộc (AC-04.03)
  console.log('\n--- TEST 6: TỪ CHỐI FILE THIẾU CỘT BẮT BUỘC ---');
  const bufferMissingCol = createMasterDataWorkbook({
    plants: [
      { 'Mã nhà máy': 'DN', 'Tên': 'Nhà máy Đồng Nai', 'Region': 'SOUTH' /* thiếu Type, Org codes */ },
    ],
  });
  const formMissingCol = new FormData();
  formMissingCol.append('file', new Blob([bufferMissingCol]), 'Invalid_MissingCol.xlsx');

  const missingColRes = await fetch(`${BASE_URL}/import/master-data`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formMissingCol,
  });
  assert(missingColRes.status === 400, `Thiếu cột bị từ chối với HTTP 400 (Status: ${missingColRes.status})`);
  const missingColData = await missingColRes.json();
  const missingColMsg = getErrorMessage(missingColData);
  assert(
    missingColMsg.includes('không tồn tại trong sheet') || missingColMsg.includes('Cột bắt buộc'),
    `Thông báo lỗi chính xác: "${missingColMsg}"`,
  );

  // Test 7: Từ chối file rỗng / không hợp lệ
  console.log('\n--- TEST 7: TỪ CHỐI FILE RỖNG / SAI ĐỊNH DẠNG ---');
  const formCorrupt = new FormData();
  formCorrupt.append('file', new Blob([Buffer.from('not an excel file')]), 'Test.txt');

  const corruptRes = await fetch(`${BASE_URL}/import/master-data`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formCorrupt,
  });
  assert(corruptRes.status === 400, `File sai định dạng bị từ chối với HTTP 400 (Status: ${corruptRes.status})`);

  // Test 8: Lịch sử nạp và chi tiết batch (AC-04.05)
  console.log('\n--- TEST 8: TRA CỨU LỊCH SỬ NẠP (AC-04.05) ---');
  const histRes = await fetch(`${BASE_URL}/import/history?batchType=MASTER&page=1&pageSize=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const histData = await histRes.json();
  assert(histRes.status === 200, `Lấy lịch sử trả về HTTP 200 (Status: ${histRes.status})`);
  assert(Array.isArray(histData.data) && histData.data.length > 0, `Trả về danh sách lô nạp (Tìm thấy: ${histData.data?.length} lô)`);
  assert(histData.meta?.totalItems >= 1, `Metadata totalItems >= 1 (Giá trị: ${histData.meta?.totalItems})`);

  // Chi tiết batch
  const batchDetailRes = await fetch(`${BASE_URL}/import/batches/${batchId1}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const batchDetailData = await batchDetailRes.json();
  assert(batchDetailRes.status === 200, `Xem chi tiết batch #${batchId1} trả về HTTP 200`);
  assert(batchDetailData.data?.batchId === batchId1, `Đúng BatchID #${batchId1}`);
  assert(batchDetailData.data?.status === 'COMPLETED', `Trạng thái: COMPLETED`);

  // Test 9: Kiểm tra sys_Audit_Log (AC-04.06)
  console.log('\n--- TEST 9: KIỂM TRA NHẬT KÝ KIỂM TOÁN (AC-04.06) ---');
  const auditRes = await fetch(`${BASE_URL}/audit-logs?action=IMPORT_MASTER_DATA&pageSize=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const auditData = await auditRes.json();
  assert(auditRes.status === 200, `Truy vấn audit log trả về HTTP 200`);
  const importAudit = auditData.data?.find((a) => a.actionCode === 'IMPORT_MASTER_DATA');
  assert(!!importAudit, `Ghi nhận sự kiện IMPORT_MASTER_DATA vào sys_Audit_Log`);
  assert(importAudit?.status === 'SUCCESS', `Trạng thái audit log: SUCCESS`);

  // Tổng kết
  console.log('\n================================================================');
  console.log(`KẾT QUẢ KIỂM THỬ: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Lỗi ngoại lệ khi chạy test:', err);
  process.exit(1);
});
