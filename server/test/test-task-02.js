/**
 * Test Suite tự động cho TASK-02: F01b - Quản trị người dùng, gán nhà máy & Audit Log
 * Kiểm tra các tiêu chí nghiệm thu AC-02.01 -> AC-02.07
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
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TASK-02: USER MANAGEMENT & AUDIT LOG');
  console.log('====================================================\n');

  // Đăng nhập Admin để lấy token thao tác
  const loginRes = await request('/auth/login', { method: 'POST' }, {
    username: 'admin',
    password: 'Admin@1234',
  });
  const adminToken = loginRes.data?.data?.token;
  if (!adminToken) {
    console.error('Không thể đăng nhập tài khoản admin!');
    process.exit(1);
  }
  const authHeaders = { Authorization: `Bearer ${adminToken}` };

  // Test 1: AC-02.01 - Lấy danh sách người dùng phân trang
  try {
    const res = await request('/users?page=1&pageSize=10', {
      method: 'GET',
      headers: authHeaders,
    });
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      Array.isArray(res.data?.data) &&
      res.data?.data.length > 0 &&
      res.data?.meta?.totalItems >= 1;

    results.push({
      id: 'AC-02.01',
      name: 'Lấy danh sách người dùng phân trang, meta chuẩn',
      passed,
      detail: `Status: ${res.status}, Users: ${res.data?.data?.length}, Total: ${res.data?.meta?.totalItems}`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.01', name: 'Lấy danh sách người dùng', passed: false, error: e.message });
  }

  // Test 2: AC-02.02a - Tạo tài khoản mới PLANNER
  let testUserId = null;
  const testUsername = `planner_test_${Date.now()}`;
  try {
    const res = await request(
      '/users',
      { method: 'POST', headers: authHeaders },
      {
        username: testUsername,
        fullName: 'Nguyễn Kế Hoạch Test',
        email: `${testUsername}@feedmill.vn`,
        roleCode: 'PLANNER',
        initialPassword: 'Planner@1234',
      },
    );
    testUserId = res.data?.data?.user?.userId;
    const passed =
      res.status === 201 &&
      res.data?.success === true &&
      testUserId > 0 &&
      res.data?.data?.user?.username === testUsername;

    results.push({
      id: 'AC-02.02a',
      name: 'Tạo tài khoản người dùng mới (PLANNER)',
      passed,
      detail: `Status: ${res.status}, New UserID: ${testUserId}, Username: ${testUsername}`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.02a', name: 'Tạo tài khoản mới', passed: false, error: e.message });
  }

  // Test 3: AC-02.02b - Chặn trùng tên đăng nhập -> HTTP 409
  try {
    const res = await request(
      '/users',
      { method: 'POST', headers: authHeaders },
      {
        username: testUsername,
        fullName: 'Trùng Tên Đăng Nhập',
        email: `another_${Date.now()}@feedmill.vn`,
        roleCode: 'PLANNER',
      },
    );
    const passed = res.status === 409 && res.data?.success === false;

    results.push({
      id: 'AC-02.02b',
      name: 'Chặn trùng tên đăng nhập -> HTTP 409 Conflict',
      passed,
      detail: `Status: ${res.status}, Message: "${res.data?.error?.message}"`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.02b', name: 'Chặn trùng username', passed: false, error: e.message });
  }

  // Test 4: AC-02.03a - Tạo tài khoản FACTORY thiếu nhà máy -> HTTP 400 (BR-02b)
  try {
    const res = await request(
      '/users',
      { method: 'POST', headers: authHeaders },
      {
        username: `factory_no_nm_${Date.now()}`,
        fullName: 'Nhà Máy Thiếu Scope',
        roleCode: 'FACTORY',
        factoryIds: [],
      },
    );
    const passed = res.status === 400 && res.data?.success === false;

    results.push({
      id: 'AC-02.03a',
      name: 'Tạo tài khoản FACTORY thiếu nhà máy bị từ chối -> HTTP 400 Bad Request',
      passed,
      detail: `Status: ${res.status}, Message: "${res.data?.error?.message}"`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.03a', name: 'FACTORY thiếu nhà máy', passed: false, error: e.message });
  }

  // Test 5: AC-02.03b - Tạo tài khoản FACTORY có gán nhà máy DN, BD [1, 2]
  let factoryUserId = null;
  const factoryUsername = `factory_test_${Date.now()}`;
  try {
    const res = await request(
      '/users',
      { method: 'POST', headers: authHeaders },
      {
        username: factoryUsername,
        fullName: 'Điều Phối Nhà Máy Đồng Nai',
        email: `${factoryUsername}@feedmill.vn`,
        roleCode: 'FACTORY',
        factoryIds: [1, 2],
        initialPassword: 'Factory@1234',
      },
    );
    factoryUserId = res.data?.data?.user?.userId;
    const assigned = res.data?.data?.assignedFactories;
    const passed =
      res.status === 201 &&
      res.data?.success === true &&
      Array.isArray(assigned) &&
      assigned.length === 2;

    results.push({
      id: 'AC-02.03b',
      name: 'Tạo tài khoản FACTORY có gán nhà máy [1, 2] thành công',
      passed,
      detail: `Status: ${res.status}, UserID: ${factoryUserId}, Assigned Factories: ${assigned?.map((f) => f.factoryCode).join(', ')}`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.03b', name: 'Tạo FACTORY có nhà máy', passed: false, error: e.message });
  }

  // Test 6: AC-02.03c - Cập nhật gán lại nhà máy cho User
  try {
    const res = await request(
      `/users/${factoryUserId}/factories`,
      { method: 'PUT', headers: authHeaders },
      { factoryIds: [1, 2, 3] },
    );
    // Kiểm tra lại chi tiết user
    const checkRes = await request(`/users/${factoryUserId}`, {
      method: 'GET',
      headers: authHeaders,
    });
    const passed =
      res.status === 200 &&
      checkRes.data?.data?.assignedFactories?.length === 3;

    results.push({
      id: 'AC-02.03c',
      name: 'Gán lại danh sách nhà máy (thành 3 nhà máy) thành công',
      passed,
      detail: `Status: ${res.status}, Assigned count: ${checkRes.data?.data?.assignedFactories?.length}`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.03c', name: 'Gán lại nhà máy', passed: false, error: e.message });
  }

  // Test 7: AC-02.04 - Reset mật khẩu tài khoản và kiểm tra đăng nhập bằng mật khẩu mới
  try {
    const resetRes = await request(
      `/users/${testUserId}/reset-password`,
      { method: 'POST', headers: authHeaders },
      { newPassword: 'NewPlannerReset@1234' },
    );
    // Thử đăng nhập với mật khẩu mới
    const loginTestUserRes = await request('/auth/login', { method: 'POST' }, {
      username: testUsername,
      password: 'NewPlannerReset@1234',
    });
    const passed =
      resetRes.status === 200 &&
      loginTestUserRes.status === 200 &&
      loginTestUserRes.data?.success === true;

    results.push({
      id: 'AC-02.04',
      name: 'Admin Reset mật khẩu -> Người dùng đăng nhập thành công bằng mật khẩu mới',
      passed,
      detail: `Reset Status: ${resetRes.status}, Login new pass Status: ${loginTestUserRes.status}`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.04', name: 'Reset mật khẩu', passed: false, error: e.message });
  }

  // Test 8: AC-02.05 - Khóa tài khoản và kiểm tra đăng nhập bị từ chối
  try {
    const updateRes = await request(
      `/users/${testUserId}`,
      { method: 'PUT', headers: authHeaders },
      {
        fullName: 'Nguyễn Kế Hoạch Đã Khóa',
        roleCode: 'PLANNER',
        isActive: false,
      },
    );
    // Thử đăng nhập tài khoản đã khóa
    const loginLockedRes = await request('/auth/login', { method: 'POST' }, {
      username: testUsername,
      password: 'NewPlannerReset@1234',
    });
    const passed =
      updateRes.status === 200 &&
      loginLockedRes.status === 401 &&
      loginLockedRes.data?.success === false;

    results.push({
      id: 'AC-02.05',
      name: 'Khóa tài khoản (isActive = false) -> Bị từ chối khi đăng nhập (HTTP 401)',
      passed,
      detail: `Update Status: ${updateRes.status}, Login locked status: ${loginLockedRes.status}`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.05', name: 'Khóa tài khoản', passed: false, error: e.message });
  }

  // Test 9: AC-02.06a - Admin không thể tự khóa hoặc hạ quyền chính mình -> HTTP 403
  try {
    const res = await request(
      '/users/1',
      { method: 'PUT', headers: authHeaders },
      {
        fullName: 'Quản trị viên',
        roleCode: 'ADMIN',
        isActive: false,
      },
    );
    const passed = res.status === 403 && res.data?.success === false;

    results.push({
      id: 'AC-02.06a',
      name: 'Chặn Admin tự khóa chính mình -> HTTP 403 Forbidden',
      passed,
      detail: `Status: ${res.status}, Message: "${res.data?.error?.message}"`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.06a', name: 'Admin tự khóa', passed: false, error: e.message });
  }

  // Test 10: AC-02.06b - Xóa tài khoản chưa có dữ liệu giao dịch -> HTTP 200
  try {
    const delRes1 = await request(`/users/${testUserId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const delRes2 = await request(`/users/${factoryUserId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const passed = delRes1.status === 200 && delRes2.status === 200;

    results.push({
      id: 'AC-02.06b',
      name: 'Xóa tài khoản người dùng chưa phát sinh giao dịch thành công',
      passed,
      detail: `Delete user 1: ${delRes1.status}, Delete user 2: ${delRes2.status}`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.06b', name: 'Xóa tài khoản hợp lệ', passed: false, error: e.message });
  }

  // Test 11: AC-02.06c - Chặn xóa tài khoản Admin tối cao -> HTTP 403
  try {
    const res = await request('/users/1', {
      method: 'DELETE',
      headers: authHeaders,
    });
    const passed = res.status === 403 && res.data?.success === false;

    results.push({
      id: 'AC-02.06c',
      name: 'Chặn xóa tài khoản Admin tối cao (ID = 1) -> HTTP 403 Forbidden',
      passed,
      detail: `Status: ${res.status}, Message: "${res.data?.error?.message}"`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.06c', name: 'Chặn xóa Admin tối cao', passed: false, error: e.message });
  }

  // Test 12: AC-02.07 - Truy vấn Audit Logs phân trang và có các sự kiện vừa thực hiện
  try {
    const res = await request('/audit-logs?page=1&pageSize=10', {
      method: 'GET',
      headers: authHeaders,
    });
    const items = res.data?.data;
    const hasUserCreate = items?.some((i) => i.actionCode === 'USER_CREATE');
    const hasResetPass = items?.some((i) => i.actionCode === 'USER_RESET_PASSWORD');
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      Array.isArray(items) &&
      items.length > 0 &&
      hasUserCreate &&
      hasResetPass;

    results.push({
      id: 'AC-02.07',
      name: 'Truy vấn GET /audit-logs trả về lịch sử thao tác hệ thống chuẩn',
      passed,
      detail: `Status: ${res.status}, Logs count: ${items?.length}, Recorded USER_CREATE: ${hasUserCreate}, USER_RESET_PASSWORD: ${hasResetPass}`,
    });
  } catch (e) {
    results.push({ id: 'AC-02.07', name: 'Truy vấn Audit Logs', passed: false, error: e.message });
  }

  console.log('\n====================================================');
  console.log('📊 KẾT QUẢ KIỂM THỬ TASK-02:');
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
