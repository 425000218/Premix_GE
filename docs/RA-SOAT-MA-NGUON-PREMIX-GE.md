# Rà soát mã nguồn dự án `Premix_GE` (vibe code bằng Antigravity 2.0)

Ngày rà: 14/10/2026 · Người rà: agent (Claude Code), chỉ đọc, không sửa mã, không ghi DB
Đối tượng: thư mục `C:\Premix_GE`, nhánh hiện tại, commit cuối `7e3a937` (14/10 21:38); CSDL `PremixTrack_DB` sau commit `c8a37c5`.
Căn cứ: `DAC-TA-NGHIEP-VU-PREMIXTRACK.md` bản 1.2 (mục 2.3 non-goals, mục 7 BR, Phụ lục A, B, E) và checklist CSDL `RA-SOAT-DB-DU-AN-MOI.md`.
Đối chiếu thêm: phần `domain/` của dự án cũ `PremixTrack-FE` (35 file hàm thuần, 91 file test).

---

## 1. Tổng quan dự án

| Hạng mục | Hiện trạng |
|---|---|
| Lịch sử | 5 commit: TASK-00 → 13 (13/10), TASK-14 phân quyền động, TASK-15 ghép chuyến xe, sửa 6 lỗi CSDL, sửa hiển thị tên (14/10) |
| Backend | NestJS, 13 module, 93 file `src`; gọi SP qua `ProcedureService` (mssql/TypeORM) |
| CSDL | `database/`: 1 schema baseline, 4 seed, 14 file SP, 2 file sửa UTF-8; DB thật 24 bảng, 60 SP |
| Frontend | React 19 + TypeScript + Tailwind v4, 40 file, 11 trang |
| Tài liệu | `docs/modules/` 11 file theo F01 → F09; `tien-do.md` 85 KB ghi từng task |
| Test | `npm test` (vitest) chỉ có 1 file mẫu; kiểm thử thật là 15 script `test/test-task-xx.js` chạy bằng `node`, gọi `dist/` và API đang chạy |
| Dữ liệu | DB mới nạp 1 ngày chốt (thư mục mock có 60 bộ ngày 01/09 → 11/10) |
| Bí mật | `server/.env` không bị commit (`.gitignore` đúng) |

## 2. Đối chiếu với checklist CSDL lần trước

Kiểm trên DB thật và file SQL sau commit `c8a37c5` ("fix 6 critical DB and business logic issues").

| Mục | Kết quả | Ghi chú |
|---|---|---|
| N1 tiếng Việt hỏng | **Gần xong** | Còn 4 SP audit (`sp_Audit_*`, `usp_Audit_*`, tạo 13/10) chứa chuỗi hỏng; vai trò, user, cảnh báo chất lượng đã sạch |
| N2 lưu lưới tuần xóa nhầm | **Một phần** | Nay chỉ xóa các NL có trong payload. Còn kẽ hở: xóa hết kế hoạch của một NL trong tuần (payload không còn NL đó) thì dòng cũ không bị xóa |
| N3 POR (BR-18, BR-21) | **Đã sửa** | NCC lạ trong POR → lỗi; phiếu trùng ngoài khoảng ngày → báo lỗi, không xóa |
| N4 TO lùi trạng thái (BR-19a) | **Đã sửa theo cách khác** | Chặn lùi bằng thứ tự trạng thái thay vì so ngày chốt; tự thêm trạng thái `CANCELLED` không có trong đặc tả; số lượng của file cũ cùng trạng thái vẫn ghi đè |
| N5 phạm vi nhà máy cho qua | **Đã sửa** | Mọi SP ghi và đọc vị thế báo `50401` khi user không tồn tại hoặc bị khóa |
| N6 RBAC thiếu kiểm soát | **Đã sửa phần chính** | Có `@CurrentUserID`, A7, audit. Chưa kiểm lại quy tắc "không tự thao tác trên tài khoản mình" (mục 3.4) |
| T1 tuổi PO ×30 ngày | **Chưa sửa** | `06_position_procedures.sql` dòng 369, 511 |
| T5 tra nhà máy `OR FactoryCode` | **Chưa sửa** | 14 chỗ trong `04_`, `05_import_*.sql` |
| T7 mã đề nghị mua theo UTC | **Chưa sửa** | `11_purchase_request_procedures.sql` dòng 120 |
| T8 lead time mặc định 7 | **Chưa sửa, lan rộng** | Thêm ở `13_projection`, `15_consolidation` và trong code TS |
| T2, T3, T4, T6, T9, T10, T11 | Chưa kiểm lại | Không thấy trong danh sách file đã sửa của commit |
| S1 → S8 schema | **Chưa đổi** | Vẫn 15 CHECK, 39 khóa ngoại, cột người thao tác là chuỗi |

## 3. Phát hiện mới trong mã nguồn

### 3.1. Nghiêm trọng

- [ ] **M1. TASK-15 "ghép chuyến xe tải theo NCC (JRP)" nằm trong danh sách KHÔNG LÀM.** Đặc tả mục 2.3: "Điều xe, tối ưu tải trọng" và "Gom các NL cùng NCC về chung một ngày giao, ghép theo tải xe (Q-051 chốt 12/10/2026: không làm; mỗi cặp đề xuất độc lập)". Code: `delivery-plans/domain/consolidation-engine.ts` (352 dòng), SP `usp_DeliveryPlan_GetConsolidationData`, giao diện ở `DeliveryPlanPage.tsx`. Ngoài lệch phạm vi, thuật toán còn:
  - SQL tự tính tiêu hao ngày `AVG(ForecastKg) / 30`, trái BR-05 (÷ `StandardMonthDays` 28), BR-08 (max chuẩn, thực tế), BR-14 (version mới nhất) và quy tắc "công thức một nơi".
  - Giá trị bịa khi thiếu dữ liệu: tiêu hao 500 kg/ngày, `SafetyDays` 3, `WarningDays` 5, `OverstockDays` 25, bao 25 kg; NCC lấy "NCC đang dùng có `SupplierID` nhỏ nhất" khi cặp không có PO.
  - Ngưỡng "must-order / can-order" (3, 7, 14 ngày; gom 5 ngày tiêu hao; tối thiểu 4 bao; xe 5/10/15/30 tấn) không có trong BR nào.
  - Gán số PO đầu tiên mà không trừ lượng còn lại của PO; lượng vượt xe 15 tấn bị cắt mà không báo thiếu.
  - **Quyết định của chủ dự án:** (a) gỡ khỏi bản chính, giữ trên nhánh riêng làm "hướng phát triển" trong báo cáo; hoặc (b) mở lại Q-051, viết BR mới cho gom chuyến rồi làm lại theo BR đó. Agent không chọn thay.

- [ ] **M2. Dự phóng 28 ngày và đề xuất lịch giao lệch BR-34, BR-34a, BR-35, BR-36, BR-36a, BR-36c** (`positions/domain/projection-engine.ts`):
  1. Dùng `stdDailyKg` (tiêu hao chuẩn) thay vì d = max(chuẩn, thực tế) của BR-08 (`positions.service.ts` dòng 967). NL đang chạy nhanh hơn dự báo sẽ bị dự phóng lạc quan.
  2. Không trừ kế hoạch đã có khỏi PO còn lại → đếm hai lần PO (BR-34 "không đếm hai lần", BR-36c trừ kế hoạch không PO theo FIFO cùng NCC).
  3. Ngày giao G = chính ngày tồn rơi dưới L; đặc tả: ngày Thứ 2–7 muộn nhất ≤ mốc M, với M = ngày **ngay trước** ngày đầu tiên tồn < L (giao sớm hơn 1 ngày).
  4. Số chuyến k chỉ bù thiếu hụt của một ngày; đặc tả: k nhỏ nhất để tồn ≥ L tới hết ngày Thứ 2–7 kế tiếp sau G.
  5. Hết nguồn PO: không ghi "thiếu nguồn từ G", không tính lượng thiếu, không dừng đề xuất. Lấy nhiều PO thì gộp thành một dòng mang số PO cuối (đặc tả: mỗi PO một dòng).
  6. Thứ tự FIFO phụ thuộc thứ tự SQL trả về; chưa xử lý "PO không có ngày tạo xếp cuối, rồi theo số PO".
  7. Mốc hết hàng, mốc cần hàng lệch 1 ngày (lấy ngày đầu tiên dưới mức thay vì ngày trước đó); tồn tại C đã dưới L không ra mốc C và cờ "đã dưới mức an toàn"; đặt muộn nhất lấy lead time của PO đầu tiên hoặc 7, không có lý do `NO_SUPPLIER`, `NO_LEAD_TIME`, `BEYOND_HORIZON`.
  8. U (BR-36a): hàng xá nhận diện bằng chữ "bulk"/"xá" trong Category, không bằng `BagKg` trống; 30.000 kg và 7 ngày gắn cứng thay vì `BulkDeliveryKg`, `DeliveryDays` trong `cfg_System`; `BagKg` trống bị thay bằng 25; định mức cặp `DeliveryQtyKg` bị làm tròn (đặc tả: dùng nguyên).
  9. `SafetyDays = 0` hợp lệ (BR-35: 0–365) nhưng bị coi là trống (`||`) → lấy `CriticalDays`.
  10. Ngày tính bằng `new Date()` + `setDate` theo giờ máy, khác hàm `addDaysIso` theo UTC đã có trong `position-calculator.ts`; đổi múi giờ máy chủ có thể lệch ngày.

- [ ] **M3. ADMIN bỏ qua kiểm quyền dựa trên JWT** (`common/guards/permissions.guard.ts` dòng 38). `roleCode` lấy từ token: tài khoản ADMIN bị hạ vai trò hoặc khóa vẫn đủ quyền tới khi token hết hạn. Trái A6 và Phụ lục B ("quyền cũ trong phiên"). Người không phải ADMIN thì đã đọc lại quyền từ DB mỗi request (đúng).

- [ ] **M4. NCC giả khi thiếu dữ liệu** (`purchase-requests.service.ts` dòng 178–183): cặp không có NCC thì gợi ý mua gán `supplierId 14`, `VEND001`, "Công ty Cung ứng Premix", lead time 7. Đề nghị mua tạo từ gợi ý này sẽ ghi sai NCC.

### 3.2. Lệch nghiệp vụ mức trung bình

- [ ] **M5. BR-39** (`position-calculator.ts` dòng 461): thiếu điều kiện "số ngày chạy máy tháng này ≥ `MinActiveDays`" → đầu tháng (đang mượn nhịp tháng trước) dễ báo lệch dự báo giả.
- [ ] **M6. BR-10:** NL dùng ít xét `≤ 1.000 kg/tháng`; đặc tả `< 1.000`.
- [ ] **M7. Cờ `PAIR_NOT_IN_MASTER`** gắn cả khi `IsTracked = false` (người dùng tự tắt theo dõi); BR-21a và BR-31a tách hai khái niệm này.
- [ ] **M8. BR-19c:** cờ chỉ báo số dòng PO trễ, không có tuổi dòng cũ nhất ("3 tháng 2 ngày"); cùng gốc với T1.
- [ ] **M9. Gợi ý mua** thêm hạn cần hàng và ngày đặt muộn nhất (ngoài BR-25, BR-25a); làm tròn lên theo bao. Không sai nhưng cần ghi vào đặc tả nếu giữ.

### 3.3. Kiến trúc và chất lượng

- [ ] **M10. Không có lớp Repository** (Phụ lục E.0, GV-01): không có thư mục `repositories/`, không có `ports.ts`; 12 service gọi thẳng `procedureService` (65 lời gọi). Hệ quả: không test được service bằng repository giả.
- [ ] **M11. `domain/` chỉ có 3 file** (vị thế, dự phóng, ghép chuyến). Các quy tắc khác (BR-05b, BR-12a, BR-26b, BR-28a, A7…) nằm rải trong service hoặc SP. Dự án cũ có 35 file hàm thuần đã chạy thật (ví dụ `poAge.ts` cho BR-19c, `projectStock.ts`, `suggestDeliveries.ts` cho BR-34/36, `dailyMovement.ts` cho BR-15a). Phụ lục E.0 dặn "chép từ dự án cũ" nhưng dự án mới viết lại từ đầu.
- [ ] **M12. Kiểm thử không lặp lại được:**
  - `npm test` gần như rỗng; các script `test-task-xx.js` cần build `dist/`, server đang chạy, DB thật.
  - Script ghi thẳng vào DB dùng chung → còn 31 tài khoản, vai trò test (`QA_58916`, `TEST_QA_LEAD`). Trái quy tắc "test ghi dữ liệu chỉ chạy trong sandbox transaction".
  - Không có bộ đáp án tính tay cho công thức (dự án cũ có).
- [ ] **M13. Dữ liệu mới có 1 ngày chốt** → BR-06, BR-07 (nhịp tháng trước), BR-15a (phát sinh ngày), BR-37 (60 ngày), BR-40 chưa từng chạy với dữ liệu thật. Cần nạp đủ 60 bộ mock (xin duyệt trước khi ghi DB).

## 4. Đã làm tốt (giữ lại)

- `position-calculator.ts`: đúng thứ tự BR-03 → BR-11, BR-09a (12 chữ số có nghĩa), BR-08, BR-12a, BR-38 trên số ngày được bảo vệ; hàm thuần, không phụ thuộc DB.
- Bảo mật: JWT Bearer, giới hạn đăng nhập (`rate-limiter.service.ts`), quyền đọc lại từ DB mỗi request cho người không phải ADMIN, SP tự kiểm phạm vi nhà máy.
- Khung NestJS theo GV: tiền tố `/api/v1`, gói phản hồi chung (interceptor), bộ lọc lỗi, log truy cập, DTO + class-validator, health check, audit.
- Bộ đọc Excel 930 dòng (`excel-parser.service.ts`) gom chung một chỗ.
- Tài liệu theo module (`docs/modules/F01 → F09`) và nhật ký tiến độ chi tiết.
- Sửa nhanh 6 lỗi nghiêm trọng của checklist CSDL trong cùng ngày.

## 5. Hướng tới "PremixTrack Final" cho báo cáo tốt nghiệp

1. **Một nguồn sự thật cho thuật toán:** chép các hàm `domain/` và bộ test của dự án cũ (đã qua 868 test, đã chạy trên bản deploy) sang `domain/` của dự án mới, rồi cho service gọi chúng. Đây là đường ngắn nhất để đạt đúng BR-34 → BR-36c, BR-19c, BR-15a.
2. **Chốt phạm vi gom chuyến (M1)** trước khi vibe code thêm: hoặc để "hướng phát triển", hoặc mở lại Q-051 kèm BR mới. Nếu đưa vào báo cáo, mô hình gần nhất trong lý thuyết tồn kho là **chính sách can-order (s, c, S)** của bài toán bổ sung kết hợp (JRP) — cần nêu rõ chi phí cố định mỗi chuyến, tải xe, mục tiêu tối ưu thay vì ngưỡng 3/7/14 ngày tự đặt.
3. **Bộ đáp án tính tay** cho từng BR (mục 15 của đặc tả) chạy bằng vitest trên hàm thuần, không cần DB → dùng luôn làm phụ lục kiểm thử trong báo cáo.
4. Thêm lớp Repository (M10) khi chuyển `domain/` sang, để đúng khung 3 lớp của giảng viên.
