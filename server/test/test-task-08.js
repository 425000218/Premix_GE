/**
 * Automated Test Runner for TASK-08 (F06: Quản lý tồn bị khóa - Chặn tồn thủ công & Kiểm tra hạn mức)
 * Chạy: node test/test-task-08.js
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
  console.log('==================================================================');
  console.log(' BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG TASK-08: QUẢN LÝ TỒN BỊ KHÓA (F06)');
  console.log('==================================================================\n');

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

  // Lấy danh sách dropdowns để có ID nhà máy và nguyên liệu thực tế
  const dropRes = await request('GET', '/catalog/dropdowns', adminToken);
  const factories = dropRes.body?.data?.factories || [];
  const materials = dropRes.body?.data?.materials || [];

  // 2. Lấy vị thế ban đầu của cặp có tồn kho SOH > 0 (DN, mã 0014)
  console.log('\n--- 1. Kiểm thử Tạo lệnh khóa hợp lệ & Phản ánh tức thời vào Vị thế F04 (AC-08.01) ---');
  const posBeforeRes = await request('GET', '/positions?search=0014', adminToken);
  const pairBefore = (posBeforeRes.body?.data?.items || []).find((p) => p.sohKg >= 5000);
  const targetFactoryId = pairBefore?.factoryId;
  const targetMaterialId = pairBefore?.materialId;
  const initialSoh = pairBefore?.sohKg || 0;
  const initialBlocked = pairBefore?.blockedKg || 0;

  assert(
    posBeforeRes.status === 200 && !!pairBefore && initialSoh >= 5000,
    'AC-08.01a',
    `Vị thế ban đầu của cặp (${pairBefore?.factoryCode}, ${pairBefore?.materialCode}): SOH = ${initialSoh} kg, Blocked = ${initialBlocked} kg, Available = ${pairBefore?.availableKg} kg`,
  );

  const blockAmount = 2000;
  const expectedRemaining = initialSoh - (initialBlocked + blockAmount);

  // Tạo lệnh khóa 2.000 kg tại cặp mục tiêu
  const createRes = await request('POST', '/blocks', adminToken, {
    factoryId: targetFactoryId,
    materialId: targetMaterialId,
    blockedKg: blockAmount,
    startDate: '2026-10-05',
    reason: 'Kiểm nghiệm chất lượng lô hàng mới nhập (QC pending - Test TASK-08)',
  });
  const createdBlock = createRes.body?.data;
  const newBlockId = createdBlock?.blockId;

  assert(
    createRes.status === 201 &&
      newBlockId > 0 &&
      createdBlock.blockedKg === blockAmount &&
      createdBlock.blockStatus === 'ACTIVE' &&
      createdBlock.startDate === '2026-10-05' &&
      createdBlock.endDate === null,
    'AC-08.01b',
    `POST /api/v1/blocks tạo lệnh khóa #${newBlockId} (${blockAmount} kg) thành công, trạng thái suy diễn = ACTIVE`,
    JSON.stringify(createRes.body),
  );

  assert(
    createdBlock?.remainingAvailableKg === expectedRemaining,
    'AC-08.01c',
    `Trả về chính xác remainingAvailableKg = ${createdBlock?.remainingAvailableKg} kg sau khi khóa`,
  );

  // Kiểm tra phản ánh tức thời trên GET /api/v1/positions
  const posAfterCreateRes = await request(
    'GET',
    `/positions?factoryId=${targetFactoryId}&search=${pairBefore.materialCode}`,
    adminToken,
  );
  const pairAfterCreate = posAfterCreateRes.body?.data?.items?.[0];
  assert(
    pairAfterCreate &&
      pairAfterCreate.blockedKg === initialBlocked + blockAmount &&
      pairAfterCreate.availableKg === expectedRemaining,
    'AC-08.01d',
    `Vị thế F04 cập nhật tức thời: BlockedKg = ${pairAfterCreate?.blockedKg} kg, AvailableKg = ${pairAfterCreate?.availableKg} kg, DOI = ${pairAfterCreate?.doi} ngày`,
    JSON.stringify(pairAfterCreate),
  );

  // Kiểm tra phản ánh tức thời trên GET /api/v1/dashboard/summary
  const dashSummaryRes = await request(
    'GET',
    `/dashboard/summary?factoryId=${targetFactoryId}`,
    adminToken,
  );
  const dashBlocked = dashSummaryRes.body?.data?.blockedStock;
  assert(
    dashSummaryRes.status === 200 && dashBlocked?.totalKg >= initialBlocked + blockAmount,
    'AC-08.01e',
    `Dashboard F05 cập nhật tức thời blockedStock.totalKg = ${dashBlocked?.totalKg} kg (orderCount = ${dashBlocked?.orderCount})`,
    JSON.stringify(dashBlocked),
  );

  // 3. Kiểm thử Chặn khóa vượt tồn khả dụng (BR-28a - AC-08.02)
  console.log('\n--- 2. Kiểm thử Chặn khóa vượt tồn khả dụng (BR-28a - AC-08.02) ---');
  const overAmount = expectedRemaining + 1000;
  const exceedRes = await request('POST', '/blocks', adminToken, {
    factoryId: targetFactoryId,
    materialId: targetMaterialId,
    blockedKg: overAmount,
    startDate: '2026-10-06',
    reason: 'Cố tình khóa vượt tồn khả dụng',
  });
  const exceedMsg = exceedRes.body?.error?.message || exceedRes.body?.message || '';
  assert(
    exceedRes.status === 400 && exceedMsg.includes('vượt quá tồn kho khả dụng'),
    'AC-08.02a',
    `Chặn khóa ${overAmount} kg khi chỉ còn khả dụng ${expectedRemaining} kg -> HTTP 400: "${exceedMsg}"`,
    JSON.stringify(exceedRes.body),
  );

  // Cố tình khóa cặp chưa có tồn kho SOH (chọn nhà máy BD2 và nguyên liệu hợp lệ chưa có SOH)
  const bd2Factory = factories.find((f) => f.factoryCode === 'BD2') || factories[factories.length - 1];
  const validMaterial = materials[0];
  const zeroSohRes = await request('POST', '/blocks', adminToken, {
    factoryId: bd2Factory.factoryId,
    materialId: validMaterial.materialId,
    blockedKg: 500,
    startDate: '2026-10-06',
    reason: 'Khóa tại nhà máy chưa có SOH',
  });
  const zeroSohMsg = zeroSohRes.body?.error?.message || zeroSohRes.body?.message || '';
  assert(
    zeroSohRes.status === 400 && zeroSohMsg.includes('bằng 0 kg'),
    'AC-08.02b',
    `Chặn khóa tại cặp chưa có SOH (${bd2Factory.factoryCode}, ${validMaterial.materialCode}) -> HTTP 400: "${zeroSohMsg}"`,
    JSON.stringify(zeroSohRes.body),
  );

  // Kiểm tra DTO validation: blockedKg <= 0
  const invalidDtoRes = await request('POST', '/blocks', adminToken, {
    factoryId: targetFactoryId,
    materialId: targetMaterialId,
    blockedKg: 0,
    reason: 'Khối lượng bằng 0',
  });
  assert(
    invalidDtoRes.status === 400,
    'AC-08.02c',
    'Chặn tạo lệnh khóa có blockedKg <= 0 qua DTO Validation (HTTP 400)',
  );

  // 4. Kiểm thử Mở khóa lệnh & Kiểm tra ràng buộc ngày (AC-08.03)
  console.log('\n--- 3. Kiểm thử Mở khóa lệnh & Ràng buộc ngày (AC-08.03) ---');
  // 4a. Mở khóa với EndDate < StartDate (2026-10-01 < 2026-10-05)
  const badDateReleaseRes = await request(
    'POST',
    `/blocks/${newBlockId}/release`,
    adminToken,
    { endDate: '2026-10-01' },
  );
  const badDateMsg =
    badDateReleaseRes.body?.error?.message || badDateReleaseRes.body?.message || '';
  assert(
    badDateReleaseRes.status === 400 &&
      badDateMsg.includes('không được sớm hơn ngày bắt đầu khóa'),
    'AC-08.03a',
    `Chặn mở khóa với EndDate (2026-10-01) < StartDate (2026-10-05) -> HTTP 400: "${badDateMsg}"`,
    JSON.stringify(badDateReleaseRes.body),
  );

  // 4b. Tạo thêm 1 lệnh khóa tạm để giữ ít nhất 1 lệnh ACTIVE cho bài test lọc ACTIVE
  const activeBlockRes = await request('POST', '/blocks', adminToken, {
    factoryId: targetFactoryId,
    materialId: targetMaterialId,
    blockedKg: 500,
    startDate: '2026-10-05',
    reason: 'Lệnh khóa đang hiệu lực phục vụ kiểm thử danh sách ACTIVE',
  });
  const activeBlockId = activeBlockRes.body?.data?.blockId;

  // 4c. Mở khóa hợp lệ cho lệnh #newBlockId với EndDate = 2026-10-06 (<= ngày chốt 2026-10-06)
  const releaseRes = await request('POST', `/blocks/${newBlockId}/release`, adminToken, {
    endDate: '2026-10-06',
  });
  const releasedBlock = releaseRes.body?.data;
  assert(
    releaseRes.status === 200 &&
      releasedBlock?.blockId === newBlockId &&
      releasedBlock?.blockStatus === 'RELEASED' &&
      releasedBlock?.endDate === '2026-10-06' &&
      releasedBlock?.releasedBy === 'admin',
    'AC-08.03b',
    `POST /api/v1/blocks/${newBlockId}/release mở khóa thành công -> BlockStatus = RELEASED, EndDate = 2026-10-06`,
    JSON.stringify(releaseRes.body),
  );

  // 4d. Kiểm tra tồn khả dụng của cặp được hoàn trả 2.000 kg vừa mở khóa (chỉ còn khóa 500 kg của activeBlockId)
  const posAfterReleaseRes = await request(
    'GET',
    `/positions?factoryId=${targetFactoryId}&search=${pairBefore.materialCode}`,
    adminToken,
  );
  const pairAfterRelease = posAfterReleaseRes.body?.data?.items?.[0];
  assert(
    pairAfterRelease &&
      pairAfterRelease.blockedKg === initialBlocked + 500 &&
      pairAfterRelease.availableKg === initialSoh - (initialBlocked + 500),
    'AC-08.03c',
    `Sau khi mở khóa lệnh 2.000 kg, tồn khả dụng được hoàn trả tức thời về ${pairAfterRelease?.availableKg} kg (BlockedKg = ${pairAfterRelease?.blockedKg} kg)`,
  );

  // 4e. Cố tình mở khóa lại lệnh đã RELEASED
  const doubleReleaseRes = await request('POST', `/blocks/${newBlockId}/release`, adminToken, {
    endDate: '2026-10-06',
  });
  const doubleReleaseMsg =
    doubleReleaseRes.body?.error?.message || doubleReleaseRes.body?.message || '';
  assert(
    doubleReleaseRes.status === 400 && doubleReleaseMsg.includes('đã được mở khóa trước đó'),
    'AC-08.03d',
    `Chặn mở khóa lại lệnh đã RELEASED -> HTTP 400: "${doubleReleaseMsg}"`,
  );

  // 5. Kiểm thử Danh sách phân trang, lọc trạng thái & Phạm vi nhà máy (AC-08.04)
  console.log('\n--- 4. Kiểm thử Danh sách phân trang, lọc trạng thái & Phạm vi nhà máy (AC-08.04) ---');
  const activeListRes = await request('GET', '/blocks?status=ACTIVE&page=1&pageSize=10', adminToken);
  const activeItems = activeListRes.body?.data?.items || [];
  assert(
    activeListRes.status === 200 &&
      activeItems.length >= 1 &&
      activeItems.every((b) => b.blockStatus === 'ACTIVE'),
    'AC-08.04a',
    `GET /api/v1/blocks?status=ACTIVE trả về ${activeItems.length} lệnh đang khóa, tất cả có blockStatus = ACTIVE`,
  );

  const releasedListRes = await request(
    'GET',
    '/blocks?status=RELEASED&page=1&pageSize=10',
    adminToken,
  );
  const releasedItems = releasedListRes.body?.data?.items || [];
  assert(
    releasedListRes.status === 200 &&
      releasedItems.some((b) => b.blockId === newBlockId && b.blockStatus === 'RELEASED'),
    'AC-08.04b',
    `GET /api/v1/blocks?status=RELEASED trả về đúng lệnh #${newBlockId} vừa mở khóa (blockStatus = RELEASED)`,
  );

  // Tạo tài khoản FACTORY chỉ gán cho targetFactoryId
  const factoryUsername = `factory_f06_${Date.now()}`;
  const createUserRes = await request('POST', '/users', adminToken, {
    username: factoryUsername,
    initialPassword: 'Factory@1234',
    fullName: 'Thủ kho Nhà máy (F06 Test)',
    email: `${factoryUsername}@premix.vn`,
    roleCode: 'FACTORY',
    factoryIds: [targetFactoryId],
  });
  const createdUserId =
    createUserRes.body?.data?.user?.userId || createUserRes.body?.data?.userId;

  const facLoginRes = await request('POST', '/auth/login', null, {
    username: factoryUsername,
    password: 'Factory@1234',
  });
  const facToken = facLoginRes.body?.data?.token;
  assert(
    facLoginRes.status === 200 && !!facToken,
    'AC-08.04c',
    `Đăng nhập user vai trò FACTORY (${factoryUsername}) thành công`,
  );

  const facListRes = await request('GET', '/blocks', facToken);
  const facItems = facListRes.body?.data?.items || [];
  assert(
    facListRes.status === 200 &&
      facItems.length >= 1 &&
      facItems.every((b) => b.factoryId === targetFactoryId),
    'AC-08.04d',
    `User FACTORY chỉ nhìn thấy các lệnh khóa của nhà máy được phân công (FactoryID=${targetFactoryId}, số dòng: ${facItems.length})`,
  );

  const otherFactory = factories.find((f) => f.factoryId !== targetFactoryId);
  const facForbiddenViewRes = await request(
    'GET',
    `/blocks?factoryId=${otherFactory.factoryId}`,
    facToken,
  );
  assert(
    facForbiddenViewRes.status === 403,
    'AC-08.04e',
    `User FACTORY truy vấn lệnh khóa của nhà máy ngoài phạm vi (factoryId=${otherFactory.factoryId}) bị chặn với HTTP 403 Forbidden`,
  );

  const facForbiddenCreateRes = await request('POST', '/blocks', facToken, {
    factoryId: otherFactory.factoryId,
    materialId: targetMaterialId,
    blockedKg: 500,
    reason: 'Cố tình khóa hàng tại nhà máy ngoài phạm vi',
  });
  assert(
    facForbiddenCreateRes.status === 403,
    'AC-08.04f',
    `User FACTORY tạo lệnh khóa tại nhà máy ngoài phạm vi (factoryId=${otherFactory.factoryId}) bị chặn với HTTP 403 Forbidden`,
  );

  // Mở khóa lệnh activeBlockId để dọn dẹp tồn khả dụng về trạng thái ban đầu
  if (activeBlockId) {
    await request('POST', `/blocks/${activeBlockId}/release`, adminToken, {
      endDate: '2026-10-06',
    });
  }
  if (createdUserId) {
    await request('DELETE', `/users/${createdUserId}`, adminToken);
  }

  // 6. Kiểm tra Audit Log (AC-08.05)
  console.log('\n--- 5. Kiểm thử Nhật ký kiểm toán Audit Log (AC-08.05) ---');
  const auditCreateRes = await request(
    'GET',
    '/audit-logs?actionCode=INVENTORY_BLOCK_CREATE&page=1&pageSize=10',
    adminToken,
  );
  const auditCreateItems = Array.isArray(auditCreateRes.body?.data)
    ? auditCreateRes.body.data
    : auditCreateRes.body?.data?.items || [];
  assert(
    auditCreateRes.status === 200 &&
      auditCreateItems.some((a) => String(a.targetId) === String(newBlockId)),
    'AC-08.05a',
    `sys_Audit_Log ghi nhận đầy đủ sự kiện INVENTORY_BLOCK_CREATE cho BlockID #${newBlockId}`,
  );

  const auditReleaseRes = await request(
    'GET',
    '/audit-logs?actionCode=INVENTORY_BLOCK_RELEASE&page=1&pageSize=10',
    adminToken,
  );
  const auditReleaseItems = Array.isArray(auditReleaseRes.body?.data)
    ? auditReleaseRes.body.data
    : auditReleaseRes.body?.data?.items || [];
  assert(
    auditReleaseRes.status === 200 &&
      auditReleaseItems.some((a) => String(a.targetId) === String(newBlockId)),
    'AC-08.05b',
    `sys_Audit_Log ghi nhận đầy đủ sự kiện INVENTORY_BLOCK_RELEASE cho BlockID #${newBlockId}`,
  );

  console.log('\n==================================================================');
  console.log(` KẾT QUẢ KIỂM THỬ TASK-08: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Lỗi thực thi kiểm thử:', err);
  process.exit(1);
});
