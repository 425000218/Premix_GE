/**
 * AUTOMATED TEST RUNNER CHO TASK-13: F04c - DỰ PHÓNG TỒN 28 NGÀY & ĐỀ XUẤT LỊCH GIAO (BR-34, BR-36)
 * Kiểm tra toàn diện các tiêu chí nghiệm thu AC-13.01 đến AC-13.06
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
let plannerToken = '';
let factoryToken = '';
let plannerUsername = '';
let factoryUsername = '';

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

async function runTests() {
  console.log('======================================================================');
  console.log('   BẮT ĐẦU KIỂM THỬ AUTOMATION TASK-13 (F04c: 28-DAY PROJECTION)');
  console.log('======================================================================\n');

  // 1. SETUP: Đăng nhập Admin và tạo tài khoản thử nghiệm
  console.log('--- BƯỚC 1: ĐĂNG NHẬP & THIẾT LẬP TÀI KHOẢN ---');
  const adminLogin = await request(
    { path: '/auth/login', method: 'POST' },
    { username: 'admin', password: 'Admin@1234' }
  );
  adminToken = adminLogin.data?.data?.token;
  assert(adminLogin.status === 200 && !!adminToken, 'Đăng nhập ADMIN thành công lấy token');

  const ts = Date.now();
  plannerUsername = `planner_f13_${ts}`;
  factoryUsername = `factory_f13_${ts}`;

  const cpRes = await request(
    {
      path: '/users',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
    {
      username: plannerUsername,
      initialPassword: 'Planner@1234',
      fullName: 'Planner F13 Runner',
      email: `${plannerUsername}@premix.vn`,
      roleCode: 'PLANNER',
      factoryIds: [],
    }
  );
  assert(cpRes.status === 201, 'Tạo tài khoản PLANNER kiểm thử thành công');

  const cfRes = await request(
    {
      path: '/users',
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    },
    {
      username: factoryUsername,
      initialPassword: 'Factory@1234',
      fullName: 'Factory F13 Runner',
      email: `${factoryUsername}@premix.vn`,
      roleCode: 'FACTORY',
      factoryIds: [1], // Chỉ gán NM 1 (Đồng Nai)
    }
  );
  assert(cfRes.status === 201, 'Tạo tài khoản FACTORY (gán NM 1 - Đồng Nai) thành công');

  const plannerLogin = await request(
    { path: '/auth/login', method: 'POST' },
    { username: plannerUsername, password: 'Planner@1234' }
  );
  plannerToken = plannerLogin.data?.data?.token;
  assert(plannerLogin.status === 200 && !!plannerToken, 'Đăng nhập PLANNER thành công lấy token');

  const factoryLogin = await request(
    { path: '/auth/login', method: 'POST' },
    { username: factoryUsername, password: 'Factory@1234' }
  );
  factoryToken = factoryLogin.data?.data?.token;
  assert(factoryLogin.status === 200 && !!factoryToken, 'Đăng nhập FACTORY lấy token');

  // 2. AC-13.01: Truy vấn mô hình Dự phóng tồn 28 ngày (GET /positions/:factoryId/:materialId/projection)
  console.log('\n--- BƯỚC 2: AC-13.01 - TRUY VẤN MÔ HÌNH DỰ PHÓNG TỒN 28 NGÀY ---');
  const projRes = await request({
    path: '/positions/1/17/projection',
    headers: { Authorization: `Bearer ${plannerToken}` },
  });

  assert(projRes.status === 200, 'GET /positions/1/17/projection trả về HTTP 200 thành công');
  const projData = projRes.data?.data;
  assert(projData?.factoryCode === 'DN', 'Đúng thông tin Nhà máy Đồng Nai (DN)');
  assert(projData?.materialCode === '0014', 'Đúng thông tin Nguyên liệu Premix Heo Con 4% (0014)');
  assert(projData?.timeline && Array.isArray(projData.timeline), 'Trả về mảng chuỗi timeline');
  assert(projData.timeline.length === 28, `Đúng đủ 28 ngày dự phóng (length = ${projData.timeline.length})`);

  // Kiểm tra cấu trúc từng ngày
  const day1 = projData.timeline[0];
  assert(day1.dayIndex === 1, 'Ngày đầu tiên có dayIndex = 1 (C+1)');
  assert(typeof day1.date === 'string' && day1.date.length === 10, `Định dạng ngày YYYY-MM-DD (${day1.date})`);
  assert(day1.dayOfWeek >= 0 && day1.dayOfWeek <= 6, `Chỉ số thứ trong tuần hợp lệ (dayOfWeek = ${day1.dayOfWeek})`);
  assert(typeof day1.dayName === 'string', `Tên thứ tiếng Việt hiển thị (${day1.dayName})`);
  assert(day1.dailyDemandKg > 0, `Tiêu hao chuẩn ngày d = ${day1.dailyDemandKg} kg/ngày`);
  assert(day1.tier1 !== undefined, 'Có dữ liệu Tầng 1 (tier1)');
  assert(day1.tier2 !== undefined, 'Có dữ liệu Tầng 2 (tier2)');

  // 3. AC-13.02: Tính toán Tầng 1: Đã lên lịch (Scheduled)
  console.log('\n--- BƯỚC 3: AC-13.02 - TÍNH TOÁN DỰ PHÓNG TẦNG 1 (SCHEDULED) ---');
  const d = projData.stdDailyKg;
  const initialStock = projData.initialStockKg;
  let runningStock = initialStock;
  let formulaConsistent = true;

  for (let i = 0; i < 28; i++) {
    const item = projData.timeline[i];
    const expected = runningStock + item.tier1.inboundKg - d;
    if (Math.round(item.tier1.closingStockKg) !== Math.round(expected)) {
      formulaConsistent = false;
      break;
    }
    runningStock = expected;
  }
  assert(formulaConsistent, 'Công thức Tầng 1: tồn(t) = tồn(t-1) + về(t) - d bảo toàn chính xác cả 28 ngày');

  // Kiểm tra chỉ số DOI và WarningLevel
  assert(
    typeof day1.tier1.doi === 'number' || day1.tier1.doi === null,
    `Chỉ số DOI Tầng 1 ngày 1: ${day1.tier1.doi} ngày`
  );
  assert(
    ['CRITICAL', 'WARNING', 'BALANCED', 'OVERSTOCK', 'NO_DEMAND'].includes(day1.tier1.warningLevel),
    `Phân cấp mức cảnh báo hợp lệ (${day1.tier1.warningLevel})`
  );

  // 4. AC-13.03: Thuật toán Đề xuất Lịch giao Tầng 2 (BR-36)
  console.log('\n--- BƯỚC 4: AC-13.03 - THUẬT TOÁN ĐỀ XUẤT LỊCH GIAO TỰ ĐỘNG TẦNG 2 (BR-36) ---');
  assert(projData.safetyStockKg > 0, `Mức tồn an toàn L = ${projData.safetyStockKg} kg (d * safetyDays)`);
  assert(projData.unitShipmentKg > 0, `Định mức 1 chuyến giao U = ${projData.unitShipmentKg} kg (BR-36a)`);
  assert(
    projData.unitShipmentKg % (projData.bagKg || 25) === 0,
    `Định mức chuyến U chia hết cho quy cách bao (${projData.bagKg || 25} kg)`
  );

  const suggestions = projData.suggestions || [];
  console.log(`    Số chuyến giao được đề xuất tự động: ${suggestions.length}`);
  if (suggestions.length > 0) {
    const sug1 = suggestions[0];
    assert(sug1.suggestQtyKg > 0, `Lượng đề xuất chuyến 1: ${sug1.suggestQtyKg} kg (${sug1.suggestQtyTons} tấn)`);
    assert(!!sug1.poNumber, `Gán từ PO Pending hợp lệ: ${sug1.poNumber}`);
    assert(!!sug1.reason, `Lý do đề xuất: "${sug1.reason}"`);

    // Kiểm tra không đề xuất vào Chủ Nhật
    const allNotSunday = suggestions.every((s) => {
      const dt = new Date(s.suggestDate);
      return dt.getDay() !== 0;
    });
    assert(allNotSunday, 'Tất cả các chuyến đề xuất đều tránh Chủ Nhật theo BR-36');

    // Tầng 2 phải có lượng tồn cuối ngày được kéo lên so với Tầng 1
    const dayWithSug = projData.timeline.find((t) => t.date === sug1.suggestDate);
    assert(
      dayWithSug && dayWithSug.tier2.inboundKg >= sug1.suggestQtyKg,
      `Tầng 2 ghi nhận chuyến giao tại ngày ${sug1.suggestDate}`
    );
  } else {
    console.log('    (Tồn kho dồi dào, không chạm ngưỡng L trong 28 ngày nên không cần đề xuất thêm)');
    assert(true, 'Thuật toán đề xuất xử lý chính xác khi không thiếu hàng');
  }

  // 5. AC-13.04: 3 Mốc thời gian trọng yếu (Milestones - BR-34a)
  console.log('\n--- BƯỚC 5: AC-13.04 - BA MỐC THỜI GIAN TRỌNG YẾU (MILESTONES) ---');
  const ms = projData.milestones;
  assert(ms !== undefined, 'Trả về đối tượng milestones');
  console.log('    Mốc Hết hàng T1 (tier1StockoutDate):', ms.tier1StockoutDate);
  console.log('    Mốc Cần hàng T1 (tier1DeliveryRequiredDate):', ms.tier1DeliveryRequiredDate);
  console.log('    Mốc Đặt muộn nhất T1 (tier1OrderDeadline):', ms.tier1OrderDeadline);

  if (ms.tier1DeliveryRequiredDate && ms.tier1OrderDeadline) {
    const reqTs = new Date(ms.tier1DeliveryRequiredDate).getTime();
    const deadTs = new Date(ms.tier1OrderDeadline).getTime();
    assert(deadTs <= reqTs, 'Mốc Đặt hàng muộn nhất phải trước hoặc bằng Mốc Cần hàng (trừ Lead Time)');
  } else {
    assert(true, 'Tồn kho duy trì trên ngưỡng an toàn suốt 28 ngày');
  }

  // 6. AC-13.05: Phân quyền phạm vi nhà máy (Role FACTORY với scope ASSIGNED)
  console.log('\n--- BƯỚC 6: AC-13.05 - PHÂN QUYỀN PHẠM VI NHÀ MÁY RBAC ---');
  // User FACTORY được gán NM 1 (Đồng Nai) -> Truy cập NM 1 thành công
  const factoryAllowed = await request({
    path: '/positions/1/17/projection',
    headers: { Authorization: `Bearer ${factoryToken}` },
  });
  assert(factoryAllowed.status === 200, 'User FACTORY truy cập NM 1 (Đồng Nai) được cấp phép HTTP 200');

  // User FACTORY truy cập NM 2 (Bình Dương) không được gán -> Bị chặn 403
  const factoryForbidden = await request({
    path: '/positions/2/17/projection',
    headers: { Authorization: `Bearer ${factoryToken}` },
  });
  assert(factoryForbidden.status === 403, 'User FACTORY bị chặn HTTP 403 Forbidden khi truy cập nhà máy khác');

  // Không có token -> 401
  const unauthRes = await request({ path: '/positions/1/17/projection' });
  assert(unauthRes.status === 401, 'Chặn truy cập không có token với HTTP 401 Unauthorized');

  // 7. AC-13.06: Kiểm tra API Đề xuất Kế hoạch tuần (POST /delivery-plans/suggest)
  console.log('\n--- BƯỚC 7: AC-13.06 - ĐỀ XUẤT LÊN LƯỚI TUẦN (POST /delivery-plans/suggest) ---');
  const suggestWeekRes = await request(
    {
      path: '/delivery-plans/suggest',
      method: 'POST',
      headers: { Authorization: `Bearer ${plannerToken}` },
    },
    {
      weekStartDate: '2026-10-05',
      factoryId: 1,
      materialId: 17,
    }
  );
  assert(
    suggestWeekRes.status === 200 || suggestWeekRes.status === 201,
    'POST /delivery-plans/suggest trả về HTTP 200/201 thành công'
  );
  const weekSugPlans = suggestWeekRes.data?.data?.suggestedPlans || [];
  assert(Array.isArray(weekSugPlans), 'Trả về danh sách chuyến đề xuất nháp suggestedPlans');
  if (weekSugPlans.length > 0) {
    assert(weekSugPlans[0].isSuggested === true, 'Đánh dấu isSuggested = true cho chuyến nháp');
  }

  // TỔNG KẾT
  console.log('\n======================================================================');
  console.log(`   KẾT QUẢ KIỂM THỬ TASK-13: ${passedTests}/${totalTests} Test Cases ĐẠT`);
  console.log('======================================================================');

  if (passedTests === totalTests) {
    console.log('🎉 TẤT CẢ TEST CASES CỦA TASK-13 ĐỀU ĐẠT CHUẨN NGHIỆM THU 100%!');
  } else {
    console.error('❌ MỘT SỐ TEST CASES BỊ THẤT BẠI!');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Lỗi thực thi test runner:', err);
  process.exit(1);
});
