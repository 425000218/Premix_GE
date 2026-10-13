/**
 * Test Suite tự động cho TASK-03: F02a - Danh mục Master Data chỉ xem
 * Kiểm tra các tiêu chí nghiệm thu AC-03.01 -> AC-03.06
 */
import http from 'http';

const BASE_URL = 'http://localhost:3000/api/v1';

async function request(endpoint, options = {}, body = null) {
  const url = new URL(BASE_URL + endpoint);
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const results = [];

  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TASK-03: MASTER DATA CATALOG');
  console.log('====================================================\n');

  // Đăng nhập Admin để lấy token
  const loginRes = await request('/auth/login', { method: 'POST' }, {
    username: 'admin',
    password: 'Admin@1234',
  });
  const adminToken = loginRes.data?.data?.token;
  if (!adminToken) {
    console.error('Không thể đăng nhập admin!');
    process.exit(1);
  }
  const authHeaders = { Authorization: `Bearer ${adminToken}` };

  // Test 1: AC-03.01 - Dropdown chung mở cho mọi user đã login
  try {
    const res = await request('/catalog/dropdowns', {
      method: 'GET',
      headers: authHeaders,
    });
    const d = res.data?.data;
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      Array.isArray(d?.factories) &&
      d.factories.length === 6 &&
      Array.isArray(d?.materials) &&
      d.materials.length >= 4 &&
      Array.isArray(d?.suppliers) &&
      d.suppliers.length >= 3 &&
      Array.isArray(d?.categories);

    results.push({
      id: 'AC-03.01',
      name: 'Dropdowns API trả về đủ 6 nhà máy, nguyên liệu, NCC, categories',
      passed,
      detail: `Status: ${res.status}, Factories: ${d?.factories?.length}/6, Materials: ${d?.materials?.length}, Suppliers: ${d?.suppliers?.length}`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.01', name: 'Dropdowns API', passed: false, error: e.message });
  }

  // Test 2: AC-03.02a - Danh sách Nhà máy phân trang
  try {
    const res = await request('/catalog/factories?page=1&pageSize=10', {
      method: 'GET',
      headers: authHeaders,
    });
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      Array.isArray(res.data?.data) &&
      res.data?.data.length === 6 &&
      res.data?.meta?.totalItems === 6;

    results.push({
      id: 'AC-03.02a',
      name: 'Danh sách Nhà máy phân trang chuẩn, đủ 6 nhà máy tiêu chuẩn',
      passed,
      detail: `Status: ${res.status}, Count: ${res.data?.data?.length}, Total: ${res.data?.meta?.totalItems}`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.02a', name: 'Danh sách Nhà máy', passed: false, error: e.message });
  }

  // Test 3: AC-03.02b - Danh sách Nguyên liệu lọc Category PREMIX
  try {
    const res = await request('/catalog/materials?category=PREMIX&page=1&pageSize=10', {
      method: 'GET',
      headers: authHeaders,
    });
    const items = res.data?.data;
    const allPremix = items?.every((m) => m.category === 'PREMIX');
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      Array.isArray(items) &&
      items.length >= 2 &&
      allPremix;

    results.push({
      id: 'AC-03.02b',
      name: 'Danh sách Nguyên liệu lọc theo Category PREMIX',
      passed,
      detail: `Status: ${res.status}, Premix Count: ${items?.length}, All PREMIX: ${allPremix}`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.02b', name: 'Lọc nguyên liệu PREMIX', passed: false, error: e.message });
  }

  // Test 4: AC-03.03a - Sửa PIC và DisplayDecimals của nguyên liệu hợp lệ
  try {
    const res = await request(
      '/catalog/materials/1',
      { method: 'PUT', headers: authHeaders },
      {
        pic: 'Nguyễn Kế Hoạch Trưởng',
        displayDecimals: 3,
      },
    );
    const updated = res.data?.data;
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      updated?.pic === 'Nguyễn Kế Hoạch Trưởng' &&
      updated?.displayDecimals === 3;

    results.push({
      id: 'AC-03.03a',
      name: 'Cập nhật PIC và DisplayDecimals của nguyên liệu thành công',
      passed,
      detail: `Status: ${res.status}, PIC: "${updated?.pic}", DisplayDecimals: ${updated?.displayDecimals}`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.03a', name: 'Sửa thuộc tính NL', passed: false, error: e.message });
  }

  // Test 5: AC-03.03b - Sửa DisplayDecimals vi phạm (> 4) -> HTTP 400
  try {
    const res = await request(
      '/catalog/materials/1',
      { method: 'PUT', headers: authHeaders },
      {
        pic: 'Tester',
        displayDecimals: 5,
      },
    );
    const passed = res.status === 400 && res.data?.success === false;

    results.push({
      id: 'AC-03.03b',
      name: 'Sửa DisplayDecimals > 4 bị từ chối -> HTTP 400 Validation Error',
      passed,
      detail: `Status: ${res.status}`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.03b', name: 'DisplayDecimals vi phạm', passed: false, error: e.message });
  }

  // Test 6: AC-03.04a - Sửa LeadTimeDays của NCC hợp lệ
  try {
    const res = await request(
      '/catalog/suppliers/1',
      { method: 'PUT', headers: authHeaders },
      { leadTimeDays: 21 },
    );
    const updated = res.data?.data;
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      updated?.leadTimeDays === 21;

    results.push({
      id: 'AC-03.04a',
      name: 'Cập nhật LeadTimeDays của nhà cung cấp thành công (21 ngày)',
      passed,
      detail: `Status: ${res.status}, LeadTimeDays: ${updated?.leadTimeDays}`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.04a', name: 'Sửa LeadTime NCC', passed: false, error: e.message });
  }

  // Test 7: AC-03.04b - Sửa LeadTimeDays vi phạm (> 365) -> HTTP 400
  try {
    const res = await request(
      '/catalog/suppliers/1',
      { method: 'PUT', headers: authHeaders },
      { leadTimeDays: 500 },
    );
    const passed = res.status === 400 && res.data?.success === false;

    results.push({
      id: 'AC-03.04b',
      name: 'Sửa LeadTimeDays > 365 ngày bị từ chối -> HTTP 400 Validation Error',
      passed,
      detail: `Status: ${res.status}`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.04b', name: 'LeadTime vi phạm', passed: false, error: e.message });
  }

  // Test 8: AC-03.05 - Bật/tắt trạng thái theo dõi cặp (IsTracked)
  try {
    // 1. Tắt theo dõi (false)
    const resTurnOff = await request(
      '/catalog/plant-items/1',
      { method: 'PUT', headers: authHeaders },
      { isTracked: false },
    );
    // 2. Bật lại theo dõi (true)
    const resTurnOn = await request(
      '/catalog/plant-items/1',
      { method: 'PUT', headers: authHeaders },
      { isTracked: true },
    );

    const passed =
      resTurnOff.status === 200 &&
      resTurnOff.data?.data?.isTracked === false &&
      resTurnOn.status === 200 &&
      resTurnOn.data?.data?.isTracked === true;

    results.push({
      id: 'AC-03.05',
      name: 'Bật / Tắt trạng thái theo dõi vị thế cặp (IsTracked: 0 -> 1) thành công',
      passed,
      detail: `Turn off Status: ${resTurnOff.status} (isTracked=${resTurnOff.data?.data?.isTracked}), Turn on Status: ${resTurnOn.status} (isTracked=${resTurnOn.data?.data?.isTracked})`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.05', name: 'Bật tắt IsTracked', passed: false, error: e.message });
  }

  // Test 9: AC-03.06 - Kiểm tra Audit Log đã ghi nhận các sự kiện catalog
  try {
    const res = await request('/audit-logs?page=1&pageSize=10', {
      method: 'GET',
      headers: authHeaders,
    });
    const items = res.data?.data;
    const hasMat = items?.some((i) => i.actionCode === 'MATERIAL_UPDATE');
    const hasSup = items?.some((i) => i.actionCode === 'SUPPLIER_UPDATE');
    const hasPair = items?.some((i) => i.actionCode === 'PLANT_ITEM_UPDATE');

    const passed =
      res.status === 200 &&
      hasMat &&
      hasSup &&
      hasPair;

    results.push({
      id: 'AC-03.06',
      name: 'Kiểm tra Audit Log đã ghi nhận: MATERIAL_UPDATE, SUPPLIER_UPDATE, PLANT_ITEM_UPDATE',
      passed,
      detail: `MATERIAL_UPDATE: ${hasMat}, SUPPLIER_UPDATE: ${hasSup}, PLANT_ITEM_UPDATE: ${hasPair}`,
    });
  } catch (e) {
    results.push({ id: 'AC-03.06', name: 'Audit Log catalog', passed: false, error: e.message });
  }

  console.log('\n====================================================');
  console.log('📊 KẾT QUẢ KIỂM THỬ TASK-03:');
  console.log('====================================================');
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${icon} [${r.id}] ${r.name}`);
    if (r.detail) console.log(`   -> ${r.detail}`);
    if (r.error) console.log(`   -> Lỗi: ${r.error}`);
    if (!r.passed) allPassed = false;
  }
  console.log('====================================================');
  console.log(`TỔNG KẾT: ${allPassed ? 'TẤT CẢ TEST CASES ĐÃ ĐẠT! 🎯' : 'CÓ TEST CASE CHƯA ĐẠT!'}`);
  console.log('====================================================\n');

  process.exit(allPassed ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
