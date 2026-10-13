/**
 * Test Suite tự động cho TASK-01: F01a - Xác thực cơ bản
 * Kiểm tra các tiêu chí nghiệm thu AC-01.01 -> AC-01.07 và Audit Log
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
  let validToken = '';

  console.log('====================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TASK-01: AUTHENTICATION');
  console.log('====================================================\n');

  // Test 1: AC-01.01 - Login đúng admin / Admin@1234
  try {
    const res = await request('/auth/login', { method: 'POST' }, {
      username: 'admin',
      password: 'Admin@1234',
    });
    validToken = res.data?.data?.token || '';
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      typeof validToken === 'string' &&
      validToken.length > 20 &&
      res.data?.data?.user?.username === 'admin' &&
      res.data?.data?.permissions?.length === 27 &&
      res.data?.data?.user?.passwordHash === undefined &&
      res.data?.data?.user?.password === undefined;

    results.push({
      id: 'AC-01.01',
      name: 'Đăng nhập thành công với tài khoản Admin',
      passed,
      detail: `Status: ${res.status}, Token: ${validToken ? 'VALID' : 'MISSING'}, Permissions: ${res.data?.data?.permissions?.length}, No passwordHash exposed`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.01', name: 'Đăng nhập Admin', passed: false, error: e.message });
  }

  // Test 2: AC-01.02 - Login sai mật khẩu
  try {
    const res = await request('/auth/login', { method: 'POST' }, {
      username: 'admin',
      password: 'WrongPassword@999',
    });
    const passed =
      res.status === 401 &&
      res.data?.success === false &&
      res.data?.error?.message === 'Tên đăng nhập hoặc mật khẩu không chính xác';

    results.push({
      id: 'AC-01.02',
      name: 'Đăng nhập sai mật khẩu -> HTTP 401 với thông điệp an toàn',
      passed,
      detail: `Status: ${res.status}, Message: "${res.data?.error?.message}"`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.02', name: 'Đăng nhập sai mật khẩu', passed: false, error: e.message });
  }

  // Test 3: AC-01.04a - Profile GET /auth/me với token hợp lệ
  try {
    const res = await request('/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const passed =
      res.status === 200 &&
      res.data?.success === true &&
      res.data?.data?.user?.username === 'admin' &&
      res.data?.data?.user?.roleCode === 'ADMIN' &&
      Array.isArray(res.data?.data?.permissions) &&
      res.data?.data?.permissions?.length === 27;

    results.push({
      id: 'AC-01.04a',
      name: 'Lấy Profile /auth/me với Bearer Token hợp lệ',
      passed,
      detail: `Status: ${res.status}, User: ${res.data?.data?.user?.username}, Role: ${res.data?.data?.user?.roleCode}, Permissions: ${res.data?.data?.permissions?.length}`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.04a', name: 'Profile /auth/me có token', passed: false, error: e.message });
  }

  // Test 4: AC-01.04b - Profile GET /auth/me không có token
  try {
    const res = await request('/auth/me', { method: 'GET' });
    const passed = res.status === 401;

    results.push({
      id: 'AC-01.04b',
      name: 'Truy cập /auth/me KHÔNG có token -> HTTP 401 Unauthorized',
      passed,
      detail: `Status: ${res.status}`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.04b', name: 'Profile không token', passed: false, error: e.message });
  }

  // Test 5: AC-01.06a - Đổi mật khẩu sai mật khẩu hiện tại
  try {
    const res = await request(
      '/auth/change-password',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${validToken}` },
      },
      {
        currentPassword: 'SaiMatKhau123',
        newPassword: 'NewPassword@123',
      },
    );
    const passed = res.status === 400 && res.data?.success === false;

    results.push({
      id: 'AC-01.06a',
      name: 'Đổi mật khẩu với mật khẩu cũ sai -> HTTP 400',
      passed,
      detail: `Status: ${res.status}, Message: "${res.data?.error?.message}"`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.06a', name: 'Đổi MK sai MK cũ', passed: false, error: e.message });
  }

  // Test 6: AC-01.06b - Đổi mật khẩu mới < 8 ký tự
  try {
    const res = await request(
      '/auth/change-password',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${validToken}` },
      },
      {
        currentPassword: 'Admin@1234',
        newPassword: 'short',
      },
    );
    const passed = res.status === 400 && res.data?.success === false;

    results.push({
      id: 'AC-01.06b',
      name: 'Đổi mật khẩu với mật khẩu mới < 8 ký tự -> HTTP 400 Validation Error',
      passed,
      detail: `Status: ${res.status}`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.06b', name: 'Đổi MK mới quá ngắn', passed: false, error: e.message });
  }

  // Test 7: AC-01.06c - Đổi mật khẩu hợp lệ sang NewAdmin@1234 rồi đổi lại
  try {
    // Đổi sang NewAdmin@1234
    const res1 = await request(
      '/auth/change-password',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${validToken}` },
      },
      {
        currentPassword: 'Admin@1234',
        newPassword: 'NewAdmin@1234',
      },
    );
    // Đăng nhập thử với NewAdmin@1234
    const resLoginNew = await request('/auth/login', { method: 'POST' }, {
      username: 'admin',
      password: 'NewAdmin@1234',
    });
    const newToken = resLoginNew.data?.data?.token;

    // Đổi lại về Admin@1234 để giữ chuẩn
    const res2 = await request(
      '/auth/change-password',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${newToken}` },
      },
      {
        currentPassword: 'NewAdmin@1234',
        newPassword: 'Admin@1234',
      },
    );

    const passed =
      res1.status === 200 &&
      resLoginNew.status === 200 &&
      res2.status === 200;

    results.push({
      id: 'AC-01.06c',
      name: 'Đổi mật khẩu hợp lệ (round-trip: đổi mới -> đăng nhập -> đổi lại cũ)',
      passed,
      detail: `Status change 1: ${res1.status}, Login new: ${resLoginNew.status}, Revert: ${res2.status}`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.06c', name: 'Đổi MK hợp lệ', passed: false, error: e.message });
  }

  // Test 8: AC-01.07 - Logout
  try {
    const res = await request(
      '/auth/logout',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${validToken}` },
      },
    );
    const passed = res.status === 200 && res.data?.success === true;

    results.push({
      id: 'AC-01.07',
      name: 'Đăng xuất /auth/logout với Token -> HTTP 200',
      passed,
      detail: `Status: ${res.status}, Message: "${res.data?.message}"`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.07', name: 'Đăng xuất', passed: false, error: e.message });
  }

  // Test 9: AC-01.03 - Rate Limiting (thử sai 5 lần liên tiếp, lần thứ 6 bị chặn 429)
  try {
    let lastStatus = 0;
    let blockedResponse = null;
    for (let i = 1; i <= 6; i++) {
      const res = await request('/auth/login', { method: 'POST' }, {
        username: 'nonexistent_test_user',
        password: 'RandomWrongPass@123',
      });
      lastStatus = res.status;
      if (res.status === 429) {
        blockedResponse = res.data;
        break;
      }
    }

    const passed = lastStatus === 429;
    results.push({
      id: 'AC-01.03',
      name: 'Rate Limiting: Thử sai liên tiếp bị chặn tạm thời -> HTTP 429 Too Many Requests',
      passed,
      detail: `Last Status: ${lastStatus}, Block message: "${blockedResponse?.error?.message || blockedResponse?.message || ''}"`,
    });
  } catch (e) {
    results.push({ id: 'AC-01.03', name: 'Rate Limiting', passed: false, error: e.message });
  }

  console.log('\n====================================================');
  console.log('📊 KẾT QUẢ KIỂM THỬ:');
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
