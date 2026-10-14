/**
 * TEST RUNNER TOÀN DIỆN CHO TASK-14: F01c - PHÂN QUYỀN ĐỘNG & MA TRẬN 27 MÃ QUYỀN
 * Kiểm tra các Acceptance Criteria từ AC-14.01 đến AC-14.06
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

async function runTask14Tests() {
  console.log('======================================================================');
  console.log('   BẮT ĐẦU KIỂM THỬ AUTOMATION TASK-14 (F01c: DYNAMIC RBAC & ROLES)');
  console.log('======================================================================\n');

  // BƯỚC 1: ĐĂNG NHẬP ADMIN
  console.log('--- BƯỚC 1: ĐĂNG NHẬP TÀI KHOẢN ADMIN ---');
  const loginRes = await request(
    { path: '/auth/login', method: 'POST' },
    { username: 'admin', password: 'Admin@1234' }
  );
  assert(loginRes.status === 200, 'Đăng nhập ADMIN thành công HTTP 200');
  adminToken = loginRes.data.data?.token || loginRes.data.token;
  assert(!!adminToken, 'Nhận JWT Admin Token hợp lệ');

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // BƯỚC 2: AC-14.01 - DANH SÁCH VAI TRÒ & DANH MỤC 27 MÃ QUYỀN
  console.log('\n--- BƯỚC 2: AC-14.01 - DANH SÁCH VAI TRÒ & DANH MỤC 27 MÃ QUYỀN CHUẨN ---');
  const rolesRes = await request({ path: '/roles', headers: adminHeaders });
  assert(rolesRes.status === 200, 'GET /roles trả về HTTP 200 thành công');
  const rolesList = rolesRes.data.data || [];
  assert(Array.isArray(rolesList) && rolesList.length >= 4, 'Danh sách vai trò có ít nhất 4 vai trò khởi tạo');

  const roleAdmin = rolesList.find(r => r.roleCode === 'ADMIN');
  const rolePlanner = rolesList.find(r => r.roleCode === 'PLANNER');
  const roleFactory = rolesList.find(r => r.roleCode === 'FACTORY');
  assert(roleAdmin && roleAdmin.isSystem === true, 'Role ADMIN có cờ IsSystem = true');
  assert(roleFactory && roleFactory.factoryScope === 'ASSIGNED', 'Role FACTORY có FactoryScope = ASSIGNED');
  assert(typeof roleAdmin?.userCount === 'number', 'Có thống kê UserCount cho vai trò');
  assert(typeof rolePlanner?.permissionCount === 'number', 'Có thống kê PermissionCount cho vai trò');

  // Kiểm tra danh mục 27 quyền
  const permRes = await request({ path: '/roles/permissions', headers: adminHeaders });
  assert(permRes.status === 200, 'GET /roles/permissions trả về HTTP 200');
  const perms = permRes.data.data || [];
  assert(Array.isArray(perms) && perms.length === 27, `Danh mục trả về chính xác 27 quyền chuẩn (length = ${perms.length})`);
  assert(perms.some(p => p.permissionCode === 'dashboard.view'), 'Có mã quyền dashboard.view');
  assert(perms.some(p => p.permissionCode === 'role.manage'), 'Có mã quyền role.manage');
  assert(perms.some(p => p.permissionCode === 'demand-override.edit'), 'Có mã quyền demand-override.edit');

  // Chi tiết 1 vai trò
  const plannerDetail = await request({ path: '/roles/PLANNER', headers: adminHeaders });
  assert(plannerDetail.status === 200, 'GET /roles/PLANNER trả về HTTP 200');
  assert(Array.isArray(plannerDetail.data.data?.permissions), 'Trả về mảng permissions cho vai trò');

  // BƯỚC 3: AC-14.02 - TẠO MỚI VAI TRÒ TÙY BIẾN
  console.log('\n--- BƯỚC 3: AC-14.02 - TẠO MỚI VAI TRÒ TÙY BIẾN & VALIDATION ---');
  const testSuffix = Math.floor(Date.now() / 1000) % 100000;
  const testRoleCode1 = `QA_${testSuffix}`;
  const testRoleCode2 = `OP_${testSuffix}`;

  // 3a. Tạo vai trò scope ALL
  const createRes1 = await request(
    { path: '/roles', method: 'POST', headers: adminHeaders },
    {
      roleCode: testRoleCode1,
      roleName: 'Trưởng bộ phận QA/QC',
      description: 'Kiểm soát chất lượng và chặn lô tồn kho',
      factoryScope: 'ALL',
      permissionCodes: ['position.view', 'block.view', 'block.create'],
    }
  );
  assert(createRes1.status === 201, 'Tạo vai trò TEST_QA_LEAD trả về HTTP 201');
  assert(createRes1.data.data?.role?.roleCode === testRoleCode1, 'Đúng RoleCode TEST_QA_LEAD');
  assert(createRes1.data.data?.role?.isSystem === false, 'Vai trò tùy biến có isSystem = false');
  assert(createRes1.data.data?.permissions?.length === 3, 'Khởi tạo đúng 3 quyền ban đầu');

  // 3b. Tạo vai trò scope ASSIGNED
  const createRes2 = await request(
    { path: '/roles', method: 'POST', headers: adminHeaders },
    {
      roleCode: testRoleCode2,
      roleName: 'Vận hành viên phân xưởng',
      description: 'Vận hành kho tại nhà máy được gán',
      factoryScope: 'ASSIGNED',
    }
  );
  assert(createRes2.status === 201, 'Tạo vai trò TEST_OPERATOR (scope ASSIGNED) trả về HTTP 201');

  // 3c. Chặn trùng mã vai trò
  const dupRes = await request(
    { path: '/roles', method: 'POST', headers: adminHeaders },
    {
      roleCode: testRoleCode1,
      roleName: 'Trùng mã',
      factoryScope: 'ALL',
    }
  );
  assert(dupRes.status === 409, 'Chặn trùng mã RoleCode với HTTP 409 Conflict');

  // 3d. Chặn mã quyền không hợp lệ
  const invalidPermRes = await request(
    { path: '/roles', method: 'POST', headers: adminHeaders },
    {
      roleCode: 'TEST_HACKER',
      roleName: 'Hack Role',
      factoryScope: 'ALL',
      permissionCodes: ['invalid.permission.code'],
    }
  );
  assert(invalidPermRes.status === 400, 'Chặn mã quyền không tồn tại với HTTP 400 Bad Request');

  // BƯỚC 4: AC-14.03 - CẬP NHẬT MA TRẬN QUYỀN QUA TVP/JSON
  console.log('\n--- BƯỚC 4: AC-14.03 - CẬP NHẬT MA TRẬN 27 MÃ QUYỀN CHO VAI TRÒ ---');
  const newPerms = ['dashboard.view', 'position.view', 'block.view', 'block.create', 'block.release'];
  const setPermRes = await request(
    { path: `/roles/${testRoleCode1}/permissions`, method: 'PUT', headers: adminHeaders },
    { permissionCodes: newPerms }
  );
  const updatedPermList = setPermRes.data?.data?.permissions || setPermRes.data?.permissions || [];
  assert(updatedPermList.length === 5, 'Cập nhật đủ 5 quyền mới cho vai trò');

  // Kiểm tra chi tiết lại
  const checkPerm = await request({ path: `/roles/${testRoleCode1}`, headers: adminHeaders });
  assert(checkPerm.data.data?.permissions?.includes('block.release'), 'Quyền block.release đã được gán');

  // Chặn sửa quyền của role ADMIN
  const adminPermHack = await request(
    { path: '/roles/ADMIN/permissions', method: 'PUT', headers: adminHeaders },
    { permissionCodes: ['dashboard.view'] }
  );
  assert(adminPermHack.status === 403, 'Chặn can thiệp quyền của ADMIN trả về HTTP 403 Forbidden');

  // BƯỚC 5: AC-14.04 - CẬP NHẬT & BẢO VỆ XÓA VAI TRÒ
  console.log('\n--- BƯỚC 5: AC-14.04 - CẬP NHẬT & RÀNG BUỘC BẢO VỆ XÓA VAI TRÒ ---');
  // 5a. Sửa thông tin vai trò
  const updateRes = await request(
    { path: `/roles/${testRoleCode1}`, method: 'PUT', headers: adminHeaders },
    {
      roleName: 'Trưởng bộ phận QA/QC Toàn quốc',
      description: 'Mô tả đã được cập nhật',
      factoryScope: 'ALL',
    }
  );
  assert(updateRes.status === 200, 'Cập nhật vai trò TEST_QA_LEAD trả về HTTP 200');
  assert(updateRes.data.data?.role?.roleName === 'Trưởng bộ phận QA/QC Toàn quốc', 'Tên vai trò được cập nhật chính xác');

  // 5b. Chặn đổi scope ADMIN
  const adminScopeHack = await request(
    { path: '/roles/ADMIN', method: 'PUT', headers: adminHeaders },
    {
      roleName: 'Quản trị hệ thống',
      factoryScope: 'ASSIGNED',
    }
  );
  assert(adminScopeHack.status === 400, 'Chặn đổi FactoryScope của ADMIN sang ASSIGNED trả về HTTP 400');

  // 5c. Chặn xóa vai trò hệ thống
  const delAdminRes = await request(
    { path: '/roles/ADMIN', method: 'DELETE', headers: adminHeaders }
  );
  assert(delAdminRes.status === 403, 'Chặn xóa role hệ thống ADMIN trả về HTTP 403 Forbidden');

  const delPlannerRes = await request(
    { path: '/roles/PLANNER', method: 'DELETE', headers: adminHeaders }
  );
  assert(delPlannerRes.status === 403, 'Chặn xóa role hệ thống PLANNER trả về HTTP 403 Forbidden');

  // 5d. Xóa vai trò chưa có user (TEST_OPERATOR)
  const delOpRes = await request(
    { path: `/roles/${testRoleCode2}`, method: 'DELETE', headers: adminHeaders }
  );
  assert(delOpRes.status === 200, 'Xóa vai trò tùy biến chưa có user (TEST_OPERATOR) thành công HTTP 200');

  // BƯỚC 6: AC-14.05 - KIỂM THỬ REAL-TIME RBAC (THAY ĐỔI QUYỀN TỨC THÌ)
  console.log('\n--- BƯỚC 6: AC-14.05 - KIỂM TRA PHÂN QUYỀN THỜI GIAN THỰC (REAL-TIME RBAC) ---');
  const dynamicUsername = `user_qa_${Date.now()}`;
  const createUserRes = await request(
    { path: '/users', method: 'POST', headers: adminHeaders },
    {
      username: dynamicUsername,
      fullName: 'Chuyên viên QA Tự Động',
      email: `${dynamicUsername}@premixtrack.com`,
      roleCode: testRoleCode1,
      initialPassword: 'User@1234',
    }
  );
  assert(createUserRes.status === 201, 'Tạo người dùng với vai trò TEST_QA_LEAD thành công HTTP 201');
  const createdUserId = createUserRes.data.data?.userId;

  // Đăng nhập bằng tài khoản QA mới tạo
  const userLogin = await request(
    { path: '/auth/login', method: 'POST' },
    { username: dynamicUsername, password: 'User@1234' }
  );
  assert(userLogin.status === 200, 'Đăng nhập người dùng vai trò mới thành công');
  const userToken = userLogin.data.data?.token || userLogin.data.token;
  const userHeaders = { Authorization: `Bearer ${userToken}` };

  // Lúc này vai trò TEST_QA_LEAD đang có quyền 'block.create'
  // Thử gọi endpoint yêu cầu 'block.create' (ví dụ POST /blocks validation fail nhưng check được permission guard đã pass)
  const blockCheck1 = await request(
    { path: '/blocks', method: 'POST', headers: userHeaders },
    { factoryId: 1, materialId: 1, blockType: 'LOT', quantityKg: 100, reason: 'Test QA' }
  );
  // Không được trả về 403 (chứng tỏ đã pass PermissionsGuard, trả về 201 hoặc 400 do validation nghiệp vụ)
  assert(blockCheck1.status !== 403, 'User có quyền block.create nên không bị chặn HTTP 403 Forbidden');

  // Bây giờ Admin thu hồi quyền 'block.create' khỏi vai trò TEST_QA_LEAD
  console.log('  -> Admin tiến hành thu hồi quyền block.create khỏi vai trò TEST_QA_LEAD...');
  await request(
    { path: `/roles/${testRoleCode1}/permissions`, method: 'PUT', headers: adminHeaders },
    { permissionCodes: ['dashboard.view', 'position.view'] }
  );

  // Ngay lập tức, User QA gửi lại request mà KHÔNG cần đăng xuất/đăng nhập lại
  const blockCheck2 = await request(
    { path: '/blocks', method: 'POST', headers: userHeaders },
    { factoryId: 1, materialId: 1, blockType: 'LOT', quantityKg: 100, reason: 'Test QA' }
  );
  assert(blockCheck2.status === 403, 'Sau khi thu hồi quyền, User lập tức bị chặn HTTP 403 Forbidden theo thời gian thực (Real-time RBAC)');

  // Chặn xóa vai trò TEST_QA_LEAD vì đang có user gán
  const delBlockedRes = await request(
    { path: `/roles/${testRoleCode1}`, method: 'DELETE', headers: adminHeaders }
  );
  assert(delBlockedRes.status === 403, 'Chặn xóa vai trò đang có người dùng gán trả về HTTP 403 Forbidden');

  // Dọn dẹp tài khoản kiểm thử
  if (createdUserId) {
    await request({ path: `/users/${createdUserId}`, method: 'DELETE', headers: adminHeaders });
    // Sau khi xóa user, xóa được vai trò
    const delSuccessRes = await request(
      { path: `/roles/${testRoleCode1}`, method: 'DELETE', headers: adminHeaders }
    );
    assert(delSuccessRes.status === 200, 'Sau khi xóa hết user, xóa vai trò TEST_QA_LEAD thành công');
  }

  // BƯỚC 7: AC-14.06 - BẢO VỆ PHÂN QUYỀN API & AUDIT LOG
  console.log('\n--- BƯỚC 7: AC-14.06 - BẢO VỆ PHÂN QUYỀN ROLE.MANAGE & AUDIT LOG ---');
  // Chặn người dùng thiếu quyền role.manage gọi POST /roles
  const unauthRoleCreate = await request(
    { path: '/roles', method: 'POST', headers: userHeaders },
    { roleCode: 'TEST_FAIL', roleName: 'Fail', factoryScope: 'ALL' }
  );
  assert(unauthRoleCreate.status === 403, 'Tài khoản không có quyền role.manage bị chặn HTTP 403 khi gọi POST /roles');

  // Kiểm tra nhật ký kiểm toán Audit Log
  const auditRes = await request({ path: '/audit-logs?action=ROLE_CREATE&pageSize=10', headers: adminHeaders });
  assert(auditRes.status === 200, 'Truy vấn nhật ký kiểm toán GET /audit-logs thành công');
  const auditItems = auditRes.data.data?.items || auditRes.data.data || [];
  assert(auditItems.length > 0, 'Ghi nhận đầy đủ sự kiện ROLE_CREATE vào sys_Audit_Log');

  console.log('\n======================================================================');
  console.log(`   KẾT QUẢ KIỂM THỬ TASK-14: ${passedTests}/${totalTests} Test Cases ĐẠT`);
  console.log('======================================================================');

  if (passedTests === totalTests) {
    console.log('🎉 TẤT CẢ TEST CASES CỦA TASK-14 ĐỀU ĐẠT CHUẨN NGHIỆM THU 100%!\n');
    process.exit(0);
  } else {
    console.error('❌ MỘT SỐ TEST CASES CHƯA ĐẠT. VUI LÒNG KIỂM TRA LẠI!\n');
    process.exit(1);
  }
}

runTask14Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
