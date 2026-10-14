# Rà soát CSDL dự án mới (checklist sửa)

Ngày rà: 14/10/2026 · Người rà: agent (Claude Code), chỉ đọc, không ghi vào DB
Đối tượng: database `PremixTrack_DB` của dự án mới (vibe code bằng Antigravity 2.0 theo `DAC-TA-NGHIEP-VU-PREMIXTRACK.md` bản 1.2), trên SQL Server Express 2022 máy dev, compatibility 150, collation `Vietnamese_100_CI_AS_SC_UTF8`, RCSI bật.
Quy mô lúc rà: 24 bảng, 59 stored procedure, 39 khóa ngoại, 15 CHECK, 15 UNIQUE.
Căn cứ đối chiếu: `DAC-TA-NGHIEP-VU-PREMIXTRACK.md` (mục 7 BR, mục 8 Dữ liệu, Phụ lục A, B, E) và baseline `database/lean/PremixTrack_Lean_Schema.sql`.

**Giới hạn:** chưa xem mã nguồn NestJS của dự án mới. Mục ghi *"cần xem app"* có thể đã được tầng ứng dụng chặn; xác minh trước khi sửa SP.

**Kiểm lại 14/10/2026 sau commit `c8a37c5` của `Premix_GE`:** N3, N5 đã sửa; N1, N2, N4, N6 sửa một phần; T1, T5, T7, T8 và nhóm S chưa đổi. Chi tiết và phát hiện mới trong mã nguồn: `RA-SOAT-MA-NGUON-PREMIX-GE.md` mục 2, 3.

Cách dùng: mỗi dòng là một việc; sửa xong đánh dấu `[x]`, ghi commit hoặc task của dự án mới. Khi giao cho agent của dự án mới, dán kèm **Phụ lục B** của file đặc tả (phần lớn lỗi dưới đây trùng các bẫy đã ghi ở đó).

---

## 1. Nghiêm trọng — sửa trước khi làm tiếp

- [ ] **N1. Tiếng Việt bị hỏng ngay trong DB (mojibake).** Chuỗi UTF-8 bị đọc thành Windows-1252 khi tạo (ví dụ "Quản trị" lưu thành "Quáº£n trá»‹").
  - Phạm vi: 31/59 SP (nhóm Role, User, Import, Audit, Master, `usp_Auth_GetCurrentUser`); dữ liệu khởi tạo 4/6 vai trò (ADMIN, PLANNER, FACTORY, VIEWER); 8/8 dòng `sys_Data_Quality_Issue` (sinh từ chuỗi trong SP nạp). Dữ liệu nhập qua app (lý do khóa hàng, lý do sửa nhu cầu) vẫn đúng.
  - Nguyên nhân gần chắc: chạy script bằng `sqlcmd` không có `-f 65001` với file UTF-8 không BOM.
  - Sửa: chạy lại toàn bộ script SP và seed với codepage 65001 (hoặc lưu file UTF-8 có BOM); cập nhật lại tên vai trò; xóa hoặc nạp lại các dòng cảnh báo chất lượng cũ.
  - Kiểm: dùng hàm `UNICODE()` trên một ký tự có dấu (ví dụ chữ "ậ" phải ra 7853, không phải 225); quét `sys.sql_modules` không còn chuỗi "á»", "áº", "Ã".
  - Ghi vào skill hoặc tài liệu chạy lệnh của dự án mới để không lặp lại.

- [ ] **N2. `usp_DeliveryPlan_SaveWeek` xóa toàn bộ kế hoạch của nhà máy trong tuần rồi chèn lại.** Khi lưới đang lọc theo nguyên liệu hoặc NCC (`usp_DeliveryPlan_GetWeek` có `@MaterialID`), bấm Lưu sẽ mất kế hoạch của các nguyên liệu không hiển thị. *Cần xem app*: app có luôn gửi đủ lưới không. Sửa: chỉ xóa theo các cặp (hoặc nguyên liệu) có trong payload, hoặc bắt buộc payload đủ cả tuần. Liên quan BR-26, BR-36b.

- [x] **N3. Nạp phiếu nhận (POR) trái BR-18 và BR-21** (`usp_Import_DailySet`, bước 2.5 và 4.4).
  - Đang xóa phiếu trùng (số POR, NL) ở **ngoài** khoảng ngày của file rồi chèn lại → BR-18 yêu cầu báo lỗi dòng, không ghi đè.
  - Không báo lỗi dòng có ngày nhận ngoài khoảng của tên file.
  - Đang tự tạo NCC từ file POR (gán `LOC_AUTO`, `Vietnam`, lead time 7) → BR-21: chỉ PO Pending (có cột Group) được tự tạo NCC; POR gặp NCC lạ là lỗi dòng.

- [ ] **N4. Nạp TO trái BR-19a** (`usp_Import_DailySet`, bước 4.5). `MERGE` ghi đè không điều kiện → nạp bù file TO cũ làm lùi trạng thái (Phụ lục B). Cần lưu ngày chốt đã ghi của dòng TO và chỉ ghi đè khi ngày chốt lần nạp ≥ ngày đã ghi; file cũ hơn chỉ thêm dòng chưa có.

- [x] **N5. Kiểm phạm vi nhà máy "không tìm thấy thì cho qua".** `usp_Position_LoadSnapshot` khởi tạo `@FactoryScope = 'ALL'`; các SP ghi (`usp_Block_Create`, `usp_Block_Release`, `usp_PurchaseRequest_Create`, `usp_PurchaseRequest_ChangeStatus`, `usp_DeliveryPlan_SaveWeek`) để `NULL` rồi chỉ chặn khi bằng `ASSIGNED`. `@UserID` NULL hoặc user không tồn tại / đã khóa → coi như được mọi nhà máy. Sửa: mặc định từ chối (GV-11), báo lỗi khi không tìm thấy user hoặc user `IsActive = 0`. *Cần xem app*: Guard có luôn truyền `UserID` không.

- [ ] **N6. SP tài khoản và vai trò thiếu kiểm soát** (`usp_User_*`, `usp_Role_*`).
  - Không ghi audit (GV-09 yêu cầu audit tạo / sửa / khóa / xóa tài khoản, sửa vai trò và quyền).
  - `@UpdatedBy` mặc định `'admin'` (`usp_User_Update`), `'SYSTEM'` (`usp_Role_*`) → app quên truyền thì audit ghi sai người.
  - SP không nhận ID người thao tác nên không kiểm được **A7** (chặn tự nâng quyền) và quy tắc tự thao tác trên tài khoản mình (mục 3.3, 3.4). *Cần xem app*: nếu kiểm ở Service thì ghi rõ; nên thêm tham số người thao tác và kiểm lại trong SP.
  - "Admin tối cao" gắn cứng theo `Username = 'admin'` hoặc `UserID = 1`; nên dựa vào vai trò `IsSystem = 1` và quy tắc "còn ít nhất một ADMIN hoạt động".

## 2. Lệch nghiệp vụ — mức trung bình

- [ ] **T1. BR-19c (PO trễ hạn nhận).** `usp_Position_LoadSnapshot` (bộ kết quả 9) và `usp_Position_GetPairDetail` tính `DATEDIFF(DAY) >= PoLateMonths × 30`. Đặc tả: đếm tháng dương lịch đủ như `EDATE` (31/05 + 1 tháng = 30/06), rồi số ngày lẻ; cờ kèm tuổi dòng cũ nhất. Nên trả `DeliveryDate` thô và tính tuổi ở `domain/`.
- [ ] **T2. BR-37 (tồn không sử dụng).** Đang dùng `MAX(WipIssue MTD) > 0` trong cửa sổ `UnusedStockDays`. Số MTD gồm cả phần tiêu hao trước cửa sổ → cần dựa trên phát sinh từng ngày (BR-15a). Thiếu điều kiện "chưa đủ dữ liệu Movement cho N ngày thì không gắn cờ".
- [ ] **T3. BR-15d, bài kiểm 3 (POR = Receive).** Đang so tổng POR cả khoảng ngày trong file với `QtyReceive` lũy kế tháng → báo lệch giả. Đặc tả: tổng POR **một ngày** = Receive phát sinh của ngày đó. Ngưỡng chấp nhận đang là 1 kg cho mọi bài; BR-01a: số cột cộng trừ × 0,5 kg.
- [ ] **T4. BR-21, BR-22a (lỗi dòng).**
  - Gặp mã nhà máy hoặc NL lạ đầu tiên là từ chối cả bộ 5 file, chỉ báo một mã → nên báo lỗi theo từng dòng (đủ danh sách).
  - Số sai định dạng bị `TRY_CAST` đổi thành 0 lặng lẽ → phải là lỗi dòng.
  - Chưa kiểm đơn vị khác kg (BR-18a, BR-22a); kiểm trùng khóa chỉ có ở Movement (On Hand, PO Pending, POR đang cộng dồn).
  - Dòng On Hand `TRANSIT` có mã kho dạng `<kho>-Transit` sẽ bị coi là kho lạ. *Cần xem app*: bộ đọc có chuẩn hóa trước không.
  - Mã kho ở đầu đi / đầu đến của TO không được kiểm (Q-003: một đầu ngoài Master → từ chối dòng).
- [ ] **T5. BR-02 (tra nhà máy).** Mọi SP nạp tra bằng `WarehouseCode OR FactoryCode`. Đặc tả chỉ dùng `WarehouseCode`; nếu mã chéo nhau, một dòng khớp hai nhà máy và bị cộng gấp đôi.
- [ ] **T6. BR-05b (nhu cầu sửa tay)** — `usp_DemandOverride_Create`, `usp_DemandOverride_Remove` chưa kiểm:
  - ngày áp dụng nằm trong tháng `PeriodMonth`;
  - không sớm hơn ngày áp dụng của dòng mới nhất cùng (cặp, tháng) — cần khóa `UPDLOCK, HOLDLOCK` khi đọc dòng mới nhất;
  - không sau max(ngày chốt mới nhất, ngày 1 của tháng), và đó là giá trị mặc định. Hiện mặc định là ngày chốt mới nhất → sửa cho **tháng sau** nhận ngày áp dụng thuộc tháng hiện tại.
  - Audit ghi `UserID = NULL` và `NewValues` dạng câu chữ (không phải JSON như SP khác).
- [ ] **T7. Mã đề nghị mua theo UTC.** `usp_PurchaseRequest_Create` lấy ngày từ `SYSUTCDATETIME()` → 0h–7h giờ Việt Nam ra ngày hôm trước (Phụ lục B). Dùng một nguồn "hôm nay" theo `APP_TIMEZONE` (truyền từ app).
- [ ] **T8. Lead time.** `dim_Supplier.LeadTimeDays NOT NULL DEFAULT 7` và SP vị thế dùng `ISNULL(LeadTimeDays, 7)` → lý do `NO_LEAD_TIME` của BR-34a không bao giờ xảy ra; NCC mới đều nhận 7 ngày. Baseline cho phép NULL.
- [ ] **T9. Xóa tài khoản (D3).** `usp_User_Delete` chỉ kiểm khóa hàng, đề nghị mua, sửa nhu cầu, lần nạp. Thiếu kế hoạch giao, ngưỡng theo cặp, cấu hình chung, audit log (mục 8.2 đề xuất thêm audit vào danh sách kiểm).
- [ ] **T10. Đề nghị mua.** Thiếu kiểm `NeedByDate ≥ ngày đề nghị` (baseline có `RequestDate` và CHECK `CK_Req_NeedBy`); không kiểm cặp có trong danh mục và NCC còn dùng.
- [ ] **T11. Lưới kế hoạch giao.** BR-26c: tấn tối đa 3 số lẻ → SP làm tròn lặng lẽ thay vì từ chối; không kiểm cặp thuộc nhà máy và đang theo dõi.

## 3. Lệch schema so với baseline (Phụ lục A mục 1: "giữ nguyên 23 bảng, khóa, CHECK")

Quyết định giữ hay sửa từng mục cần chủ dự án chốt; nếu giữ thì cập nhật đặc tả và ERD của dự án mới cho khớp.

- [ ] **S1. Đổi tên cột, trái quy ước `*QtyKg` (mục 8.1):**

  | Bảng | Baseline | Dự án mới |
  |---|---|---|
  | `fact_Demand_Forecast` | `ForecastQtyKg` | `ForecastKg` |
  | `fact_Inventory_Movement` | `BeginQtyKg`, `ReceiveQtyKg`, `WipIssueQtyKg`, `TransferInQtyKg`, `TransferOutQtyKg`, `AdjustQtyKg`, `ClosedQtyKg` | `BeginOnhandKg`, `QtyReceiveKg`, `WipIssueKg`, `TransferInKg`, `TransferOutKg`, `AdjustKg`, `ClosedOnhandKg` |
  | `fact_PO_Pending` | `OrderedQtyKg`, `RemainingQtyKg` | `OrderQtyKg`, `DeliverRemainderKg` |
  | `fact_Inventory_Block` | `BlockedQtyKg` | `BlockedKg` |
  | `fact_Delivery_Plan` | `PlannedQtyKg` | `PlanQtyKg` |
  | `fact_Purchase_Request` | `RequestStatus`, `MatchedPONumber` | `Status`, `PONumber` |
  | `fact_Demand_Override` | `DemandQtyKg` | `OverrideKg` |
  | `dim_Material` | `MaterialGroup` | `ItemGroup` |
  | `dim_Supplier` | `SupplierType` (`LOCAL`/`IMPORT`) | `VendorGroup` (chuỗi tự do) |
  | `dim_Material_Substitution` | `PrimaryMaterialID`, `AltMaterialID`, `SubstitutionRatio DECIMAL(8,4)` | `MaterialID`, `SubMaterialID`, `Ratio DECIMAL(5,2)` |

- [ ] **S2. Cột người thao tác đổi từ `INT` (khóa ngoại `sys_User`) sang `NVARCHAR` username**: `CreatedBy`, `ReleasedBy`, `UpdatedBy`, `ImportedBy`. Mất toàn vẹn tham chiếu, đổi username là đứt liên kết. Đề xuất: giữ `UserID` làm khóa ngoại như baseline, chỉ ghi thêm username trong `sys_Audit_Log`.
- [ ] **S3. Kiểu ngưỡng ngày:** `cfg_System.CriticalDays/WarningDays/OverstockDays/OverstockDaysLowUsage/DeliveryDays` và `cfg_Stock_Threshold.WarningDays/OverstockDays` đổi `DECIMAL(6,1)` → `INT`; `SafetyDays`, `DeliveryDays` của cặp đổi `(6,1)` → `(4,1)`. Baseline cho phép 1 số lẻ.
- [ ] **S4. Thiếu CHECK (15 so với khoảng 60 ở baseline).** Ưu tiên khôi phục:
  - `sys_Role`: mẫu mã `COLLATE Latin1_General_BIN` (bẫy Phụ lục B), `UQ RoleName`, cột `UpdatedBy`.
  - `fact_Internal_Transfer`: trạng thái `Created/Shipped/Received`, hai nhà máy khác nhau, ngày nhận khi Received, thứ tự ngày, lượng ≥ 0.
  - `fact_Demand_Override`: tháng là ngày 1, ngày áp dụng trong tháng, lý do không rỗng; khóa ngoại tới cặp `dim_Factory_Material`.
  - `fact_Purchase_Request`: MATCHED phải có số PO, `NeedByDate ≥ RequestDate`.
  - `fact_Inventory_Block`: mở khóa phải đủ người, thời điểm, `EndDate` (BR-28).
  - Lượng ≥ 0 ở `fact_Inventory_SOH`, `fact_Inventory_Movement`, `fact_PO_Pending`, `fact_PO_Receipt`, `fact_Demand_Forecast`; `DocType IN (PO, PAG)`.
  - `cfg_System`: khoảng giá trị (`StandardMonthDays` 20–31, `PoLateMonths` 1–24, `MinActiveDays ≥ 1`, `BulkDeliveryKg > 0`, 4 tham số mới theo mục 8.5).
  - `cfg_Stock_Threshold`: ít nhất một cột có giá trị, Warning < Overstock, giá trị dương.
  - Danh mục: `Region`, `MaterialGroup`, `SupplierType`, mã không rỗng, `BagKg > 0`, NL thay thế khác NL gốc.
  - `sys_Import_Batch`: loại batch, số dòng, tháng, `CutoffDate = SnapshotDate + 1`; `sys_Data_Quality_Issue.Severity`.
- [ ] **S5. `fact_Internal_Transfer`:** thiếu `TransferQtyKg`, `ReceivedQtyKg`, `ScrappedQtyKg`; `FromFactoryID/ToFactoryID` cho phép NULL và không có khóa ngoại (baseline: NOT NULL + khóa ngoại).
- [ ] **S6. `sys_Import_Batch`:** ghi **một** batch `DAILY_SET` cho cả bộ 5 file, baseline là mỗi file một lần nạp (DM-14) với `BatchType` theo loại file. `FileHash` có lưu nhưng không dùng để nhận file nạp lại.
- [ ] **S7. `fact_Demand_Forecast`:** thiếu `ForecastWeek` (baseline có, 1–53).
- [ ] **S8. Kiểu thời điểm:** kiểm lại `DATETIME2` đang dùng độ chính xác mặc định (7) hay `DATETIME2(0)` như quy ước mục 8.1.

## 4. Vệ sinh

- [ ] **V1.** Trùng hai bộ `sp_Audit_List/Write` và `usp_Audit_List/Write`. Giữ một bộ `usp_` (tiền tố `sp_` khiến SQL Server tìm trong `master` trước) và sửa đặc tả GV-03 / E.2 (đang ghi `sp_<Module>_<Hành động>`).
- [ ] **V2.** Hai kiểu báo lỗi lẫn lộn: `THROW 50400/50403/50404/50409` (app đổi được sang mã HTTP) và `RAISERROR(..., 16, 1)` (nhóm User, Role, Import). Thống nhất về `THROW 50xxx` để Exception Filter trả đúng 400/403/404/409.
- [ ] **V3.** Audit của nạp file gắn cứng IP (localhost) và `UserID = NULL`; truyền IP và người nạp thật từ app.
- [ ] **V4.** `usp_Position_LoadSnapshot` trả SOH, khóa hàng, ngưỡng, PO… của **mọi** nhà máy, chỉ danh sách cặp được lọc theo phạm vi. *Cần xem app*: đảm bảo không trả phần ngoài phạm vi ra API; tốt hơn là lọc luôn trong SP.
- [ ] **V5.** Dữ liệu test còn trong DB: 28 tài khoản, vai trò `QA_58916`, `TEST_QA_LEAD`. Dọn trước khi demo (xin duyệt trước khi xóa).

## 5. Đã làm tốt (giữ nguyên)

- Phụ lục A đã áp: đổi tên DB, `sys_Audit_Log`, 4 tham số mới trong `cfg_System`, `dim_Factory_Material.IsActive`, collation UTF-8, RCSI, compatibility 150.
- SP ghi có `TRY/CATCH`, transaction, `XACT_ABORT`; audit ghi trong cùng transaction.
- `usp_Block_Create` kiểm BR-28a với `UPDLOCK, HOLDLOCK`; `usp_PurchaseRequest_Create` sinh mã có khóa; `usp_Config_Update` kiểm BR-12, BR-12b (trả danh sách cặp xung đột); `usp_Threshold_Upsert` kiểm BR-12a; `usp_PurchaseRequest_ChangeStatus` đúng BR-27a.
- `usp_Position_LoadSnapshot` chỉ trả dữ liệu thô, không tính DOI hay mức trong SQL (đúng "công thức một nơi", BR-13); dự báo theo BR-14, sửa tay theo thứ tự BR-05b, hàng đi đường theo BR-20, chặn hiệu lực theo BR-04.
- Nạp Master đúng BR-31 (không ghi đè PIC, số lẻ, lead time, `IsTracked`) và BR-31a (mã vắng mặt → ngưng dùng, xuất hiện lại → bật lại).
- Nạp bộ 5 file trong một transaction (BR-17), có chế độ xem trước (DryRun) rollback sạch.

## 6. Thứ tự sửa đề xuất

1. N1 (mã hóa tiếng Việt) — mọi thông báo lỗi và cảnh báo hiển thị đều phụ thuộc.
2. Xem mã nguồn app để chốt các mục *"cần xem app"* (N2, N5, N6, T4, V4).
3. N2 → N6 (mất dữ liệu, bảo mật).
4. S2, S4 (khóa ngoại người thao tác, CHECK) — làm sớm vì đổi sau sẽ phải migrate dữ liệu.
5. T1 → T11, rồi S còn lại và V.
