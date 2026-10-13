# ĐẶC TẢ CHI TIẾT MODULE F07: KẾ HOẠCH GIAO HÀNG TUẦN (DELIVERY PLANNING)

> **Mã phân hệ:** F07  
> **Tên module:** Weekly Delivery Planning & Receipt Reconciliation  
> **Mức độ ưu tiên:** Must Have (M)  
> **Tiêu chuẩn kỹ thuật:** Clean Architecture, Domain Reconciliation Algorithm, Batch TVP Save Transaction, Tons/Kg Conversion

---

## 1. Mục tiêu & Phạm vi Nghiệp vụ

### 1.1. Mục tiêu
- Cung cấp công cụ lập kế hoạch nhận hàng chi tiết theo từng ngày trong tuần (Thứ 2 đến Chủ nhật) cho từng cặp Nhà máy – Nguyên liệu và Nhà cung cấp.
- Tự động đối chiếu lượng hàng thực tế nhà máy đã nhận từ các phiếu PO Receipt (POR) với kế hoạch đã lập theo từng ngày và tổng kết tuần, phát hiện sớm tình trạng giao thiếu hoặc giao lệch ngày.
- Tích hợp tính năng Đề xuất lịch giao tự động nháp lên lưới (kế thừa từ thuật toán BR-36 của Module F04) giúp Planner giảm thiểu thao tác nhập liệu thủ công.

### 1.2. Phạm vi Chức năng
- **Bảng Lưới Lập Kế hoạch Tuần (Weekly Grid):** Hiển thị ma trận kế hoạch từ Thứ 2 đến Chủ nhật. Hỗ trợ nhập liệu số lượng theo đơn vị **tấn** (tối đa 3 chữ số thập phân).
- **Đối chiếu Phiếu nhận thực tế (POR Reconciliation):** Tự động gom các phiếu nhận hàng thực tế từ ERP vào từng ngày tương ứng và tính toán lượng còn thiếu / giao dư.
- **Cảnh báo Vượt đơn mua hàng (Over-PO Warning):** Cảnh báo khi tổng kế hoạch giao hàng vượt quá khối lượng còn lại trên PO Pending.
- **Nút "Đề xuất Lịch giao":** Tự động điền các dòng kế hoạch nháp vào lưới cho các cặp đang lọc.
- **Lưu đồng loạt cả tuần:** Lưu toàn bộ thay đổi trên lưới trong một transaction duy nhất.

---

## 2. Ma trận Phân quyền Module F07

| Mã quyền (`PermissionCode`) | Hành động được phép | ADMIN | PLANNER | FACTORY | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `delivery-plan.view` | Xem bảng lưới kế hoạch giao hàng và kết quả đối chiếu | ✓ | ✓ | ✓ | ✓ |
| `delivery-plan.edit` | Tạo dòng mới, chỉnh sửa sản lượng, lưu lưới tuần | ✓ | ✓ | | |

*(Lưu ý: Nhân viên nhà máy `FACTORY` chỉ được xem kế hoạch của nhà máy mình, không có quyền chỉnh sửa lưới kế hoạch).*

---

## 3. Quy tắc Nghiệp vụ Chi tiết (Business Rules)

### 3.1. Quy tắc Lưu trữ & Đơn vị Đo lường (BR-26, BR-26c, BR-33)
- **Đơn vị giao dịch:**
  - Trên giao diện Lưới kế hoạch giao hàng: Người dùng **xem và nhập liệu bằng TẤN** (cho phép tối đa 3 chữ số thập phân, ví dụ: `15.250` tấn).
  - Trong cơ sở dữ liệu (`fact_Delivery_Plan`): Hệ thống **luôn quy đổi sang KG NGUYÊN** để lưu trữ:
    $$\text{PlanQtyKg} = \text{round}(\text{QtyInTons} \times 1.000, 0)$$
  - Số lượng nhập bắt buộc phải $> 0$.
- **Lưu trữ theo từng ngày (BR-26):** Mỗi dòng trong CSDL đại diện cho kế hoạch của 1 ngày cụ thể (`PlanDate`). Bảng không lưu cờ "Đã nhận"; lượng đã nhận luôn được tính toán động từ bảng phiếu nhận `fact_PO_Receipt`.
- **Ràng buộc dòng có PO và không có PO (BR-26a):**
  - **Dòng có số PO:** Khóa duy nhất trong CSDL đảm bảo không có hai dòng cùng một `(PlanDate, FactoryID, MaterialID, SupplierID, PONumber)`. Số PO được chọn từ danh sách các PO Pending còn mở của cặp (sắp xếp theo FIFO ngày tạo).
  - **Dòng không có PO (Dự kiến trước):** Cho phép nhập nhiều dòng trong cùng một ngày cho cùng một cặp và nhà cung cấp.

### 3.2. Quy tắc Đối chiếu Thực nhận từ POR (Reconciliation Engine - BR-26b)
Hệ thống thực hiện đối chiếu tự động giữa kế hoạch giao và các phiếu nhận hàng thực tế (`fact_PO_Receipt`) phát sinh trong tuần:

1. **Khớp dòng có PO:** Các phiếu nhận hàng có số `PONumber` hoặc `PAGNumber` trùng khớp với số PO của dòng kế hoạch sẽ được gán cho dòng đó.
2. **Khớp dòng không PO:** Các phiếu nhận hàng còn lại (chưa khớp với dòng nào) sẽ được tự động khớp vào các dòng không có PO của cùng Nhà cung cấp và cặp NM–NL.
3. **Nguyên tắc tính 1 lần:** Mỗi phiếu POR chỉ được tính một lần duy nhất vào một dòng kế hoạch.
4. **Vị trí hiển thị lượng nhận:** Lượng thực nhận luôn hiển thị tại **ngày nhận hàng thực tế** ghi trên phiếu POR, bất kể kế hoạch ban đầu đặt ở ngày nào.
5. **Tính toán chênh lệch:**
   - **Còn thiếu theo ngày:** $\text{Thiếu}(t) = \text{Kế hoạch}(t) - \text{Đã nhận}(t)$.
   - **Tổng tuần:** Bù trừ tự do giữa các ngày trong tuần (giải quyết trường hợp nhà cung cấp giao sớm hoặc trễ 1–2 ngày so với kế hoạch). Nếu tổng nhận $>$ tổng kế hoạch $\rightarrow$ Hiển thị số âm (Giao dư).

### 3.3. Quy tắc Cảnh báo Vượt PO (BR-26d)
- Khi người dùng lập kế hoạch cho một đơn mua hàng cụ thể:
  $$\sum \text{Kế hoạch sau ngày chốt } C \text{ của PO} > \text{DeliverRemainderKg (của PO đó tại bản } C)$$
- Hệ thống sẽ hiển thị biểu tượng cảnh báo màu vàng kèm thông báo: *"Tổng kế hoạch (X tấn) vượt quá lượng còn lại trên PO (Y tấn)"*. Tuy nhiên, hệ thống **vẫn cho phép lưu** (đây là cảnh báo mềm để Planner linh hoạt điều phối).

### 3.4. Nút "Đề xuất Lịch giao" trên Lưới (BR-36b)
- Khi Planner bấm nút "Đề xuất":
  - Hệ thống chạy thuật toán BR-36 (kế thừa từ F04) cho toàn bộ các cặp đang nằm trong bộ lọc của lưới.
  - Khoảng thời gian đề xuất: Từ $E = \max(C+1, \text{Hôm nay})$ đến $H = \text{Chủ nhật của tuần đang xem}$.
  - Hệ thống **chỉ thêm các dòng nháp** (hiển thị khác màu, có nhãn "Đề xuất", kèm ghi chú trễ nếu có). Toàn bộ các dòng kế hoạch người dùng đã lưu trước đó được giữ nguyên 100%.
  - Người dùng có thể chỉnh sửa số lượng, đổi ngày hoặc xóa các dòng đề xuất nháp trước khi bấm nút "Lưu kế hoạch".

---

## 4. User Stories & Tiêu chí Chấp nhận (AC)

### 4.1. User Stories
1. **US-14 (Lập lịch nhận hàng tuần):** Là một *Planner*, tôi muốn nhập số tấn nguyên liệu dự kiến NCC giao trong tuần từ Thứ 2 đến Chủ nhật, để điều phối kho bãi sẵn sàng tiếp nhận.
2. **US-15 (Theo dõi thực nhận):** Là một *Planner*, tôi muốn nhìn thấy số lượng thực tế nhà máy đã cân nhận từ ERP cạnh số kế hoạch, để biết NCC nào giao thiếu hoặc giao trễ.
3. **US-16 (Đề xuất tự động lên lưới):** Là một *Planner*, tôi muốn bấm một nút để hệ thống tự điền các chuyến giao hàng cần thiết trong tuần, để tiết kiệm thời gian tính toán thủ công.

### 4.2. Acceptance Criteria (Given - When - Then)

- **AC-07.01 (Lưu và tải lại lưới tuần toàn vẹn):**
  - **Given:** Planner nhập kế hoạch cho 3 dòng nguyên liệu với các ngày Thứ 3, Thứ 5 (tổng cộng 45 tấn).
  - **When:** Bấm "Lưu kế hoạch", sau đó tải lại trang hoặc đổi tuần rồi quay lại.
  - **Then:** Hệ thống hiển thị chính xác toàn bộ các dòng và số lượng đã lưu; CSDL lưu trữ chính xác 45.000 kg.

- **AC-07.02 (Đối chiếu khớp phiếu nhận):**
  - **Given:** Kế hoạch đặt ngày Thứ 4 cho PO1001 là 20.000 kg. File POR nạp vào có phiếu nhận 15.000 kg đúng PO1001 vào ngày Thứ 4.
  - **When:** Xem lưới tuần của cặp đó.
  - **Then:** Ô ngày Thứ 4 hiển thị: Kế hoạch = 20 tấn; Đã nhận = 15 tấn; Còn thiếu = 5 tấn.

- **AC-07.03 (Phân quyền FACTORY chỉ xem):**
  - **Given:** Người dùng có vai trò `FACTORY` đăng nhập vào màn hình Lưới kế hoạch.
  - **When:** Xem giao diện.
  - **Then:** Toàn bộ các ô nhập số lượng bị khóa (Read-only); nút "Lưu kế hoạch" và nút "Đề xuất" bị ẩn hoặc vô hiệu hóa.

---

## 5. Thiết kế Cơ sở Dữ liệu & Stored Procedures

### 5.1. Bảng `fact_Delivery_Plan`

```sql
CREATE TABLE dbo.fact_Delivery_Plan (
    PlanID INT IDENTITY(1,1) NOT NULL,
    PlanDate DATE NOT NULL,
    FactoryID INT NOT NULL,
    MaterialID INT NOT NULL,
    SupplierID INT NOT NULL,
    PONumber NVARCHAR(50) NULL,
    PlanQtyKg DECIMAL(18,0) NOT NULL,
    Note NVARCHAR(250) NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedBy NVARCHAR(50) NOT NULL,
    UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy NVARCHAR(50) NOT NULL,
    CONSTRAINT PK_fact_Delivery_Plan PRIMARY KEY CLUSTERED (PlanID),
    CONSTRAINT FK_DeliveryPlan_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
    CONSTRAINT FK_DeliveryPlan_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
    CONSTRAINT FK_DeliveryPlan_Supplier FOREIGN KEY (SupplierID) REFERENCES dbo.dim_Supplier(SupplierID),
    CONSTRAINT CK_DeliveryPlan_Qty CHECK (PlanQtyKg > 0)
);

-- Khóa duy nhất chỉ áp dụng cho dòng có số PO
CREATE UNIQUE NONCLUSTERED INDEX UQ_fact_Delivery_Plan_Po
ON dbo.fact_Delivery_Plan (PlanDate, FactoryID, MaterialID, SupplierID, PONumber)
WHERE PONumber IS NOT NULL;
```

### 5.2. Kiểu Bảng TVP Lưu Lưới Tuần

```sql
CREATE TYPE dbo.tvp_DeliveryPlanItem AS TABLE (
    PlanDate DATE NOT NULL,
    FactoryID INT NOT NULL,
    MaterialID INT NOT NULL,
    SupplierID INT NOT NULL,
    PONumber NVARCHAR(50) NULL,
    PlanQtyKg DECIMAL(18,0) NOT NULL,
    Note NVARCHAR(250) NULL
);
```

### 5.3. Stored Procedures Chuẩn

#### 1. `sp_DeliveryPlan_GetWeek` (Lấy kế hoạch và dữ liệu POR đối chiếu)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_DeliveryPlan_GetWeek
    @WeekStartDate DATE, -- Ngày Thứ 2 của tuần
    @FactoryID INT = NULL,
    @MaterialID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @WeekEndDate DATE = DATEADD(DAY, 6, @WeekStartDate); -- Ngày Chủ nhật

    -- 1. Lấy toàn bộ các dòng kế hoạch đã lưu trong tuần
    SELECT 
        dp.PlanID,
        dp.PlanDate,
        dp.FactoryID,
        f.FactoryCode,
        dp.MaterialID,
        m.MaterialCode,
        m.MaterialName,
        dp.SupplierID,
        s.SupplierCode,
        s.SupplierName,
        dp.PONumber,
        dp.PlanQtyKg,
        CAST(dp.PlanQtyKg / 1000.0 AS DECIMAL(10,3)) AS PlanQtyTons,
        dp.Note
    FROM dbo.fact_Delivery_Plan dp
    INNER JOIN dbo.dim_Factory f ON dp.FactoryID = f.FactoryID
    INNER JOIN dbo.dim_Material m ON dp.MaterialID = m.MaterialID
    INNER JOIN dbo.dim_Supplier s ON dp.SupplierID = s.SupplierID
    WHERE dp.PlanDate BETWEEN @WeekStartDate AND @WeekEndDate
      AND (@FactoryID IS NULL OR dp.FactoryID = @FactoryID)
      AND (@MaterialID IS NULL OR dp.MaterialID = @MaterialID);

    -- 2. Lấy toàn bộ các phiếu nhận POR phát sinh trong tuần để Domain đối chiếu
    SELECT 
        pr.ReceiptNumber,
        pr.DeliveryDate AS ReceiptDate,
        pr.FactoryID,
        pr.MaterialID,
        pr.PONumber,
        pr.SupplierID,
        pr.ReceivedQtyKg,
        CAST(pr.ReceivedQtyKg / 1000.0 AS DECIMAL(10,3)) AS ReceivedQtyTons
    FROM dbo.fact_PO_Receipt pr
    WHERE pr.DeliveryDate BETWEEN @WeekStartDate AND @WeekEndDate
      AND (@FactoryID IS NULL OR pr.FactoryID = @FactoryID)
      AND (@MaterialID IS NULL OR pr.MaterialID = @MaterialID);
END;
```

#### 2. `sp_DeliveryPlan_SaveWeek` (Lưu cả lưới tuần trong 1 Transaction)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_DeliveryPlan_SaveWeek
    @WeekStartDate DATE,
    @FactoryID INT,
    @UpdatedBy NVARCHAR(50),
    @TvPlans dbo.tvp_DeliveryPlanItem READONLY
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @WeekEndDate DATE = DATEADD(DAY, 6, @WeekStartDate);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Xóa các kế hoạch cũ của nhà máy trong tuần tương ứng
        DELETE FROM dbo.fact_Delivery_Plan
        WHERE FactoryID = @FactoryID
          AND PlanDate BETWEEN @WeekStartDate AND @WeekEndDate;

        -- 2. Chèn các dòng kế hoạch mới từ TVP
        INSERT INTO dbo.fact_Delivery_Plan (
            PlanDate, FactoryID, MaterialID, SupplierID, PONumber, PlanQtyKg, Note,
            CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
        )
        SELECT 
            tv.PlanDate, tv.FactoryID, tv.MaterialID, tv.SupplierID, tv.PONumber, tv.PlanQtyKg, tv.Note,
            SYSUTCDATETIME(), @UpdatedBy, SYSUTCDATETIME(), @UpdatedBy
        FROM @TvPlans tv;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
```

---

## 6. Đặc tả API RESTful Module F07

| Phương thức | Đường dẫn API | Quyền | Mô tả |
|---|---|---|---|
| `GET` | `/api/v1/delivery-plans/week` | `delivery-plan.view` | Lấy kế hoạch tuần kèm số thực nhận POR đối chiếu |
| `POST`| `/api/v1/delivery-plans/week` | `delivery-plan.edit` | Lưu toàn bộ lưới kế hoạch tuần (nhận payload tấn, lưu kg) |
| `GET` | `/api/v1/delivery-plans/po-options` | `delivery-plan.view` | Lấy danh sách PO còn mở của cặp để nạp dropdown |
| `POST`| `/api/v1/delivery-plans/suggest` | `delivery-plan.view` | Chạy thuật toán gợi ý lịch giao nháp cho tuần |

---

## 7. Đặc tả Giao diện Người dùng (UI/UX)

- **Màn hình Lưới Kế hoạch Giao hàng (`/delivery-plan`):**
  - **Thanh điều khiển:**
    - Nút chuyển tuần: [Tuần trước] - **[Tuần XX: DD/MM - DD/MM/YYYY]** - [Tuần sau] - [Về tuần hiện tại].
    - Bộ lọc: Dropdown Nhà máy (bắt buộc chọn 1 NM hoặc Tất cả), Dropdown Nhóm nguyên liệu, Ô tìm kiếm nguyên liệu.
    - Nút hành động bên phải: Nút **"⚡ Đề xuất lịch giao"** (icon tia sét) và Nút **"💾 Lưu kế hoạch"** (màu xanh lá, có chỉ báo thay đổi chưa lưu).
  - **Bảng Lưới Tuần (Weekly Grid):**
    - Cột cố định bên trái: Mã & Tên Nguyên liệu, Nhà cung cấp, Số PO (có thể để trống), Nút "+ Thêm dòng".
    - 7 Cột Ngày (Thứ 2, Thứ 3, Thứ 4, Thứ 5, Thứ 6, Thứ 7, Chủ nhật):
      - Mỗi ô ngày chia làm 2 dòng:
        - Dòng trên: Ô input nhập số Tấn kế hoạch (viền nét, cho phép nhập số lẻ).
        - Dòng dưới: Số Tấn thực tế đã nhận (màu xanh dương đậm, lấy từ POR).
    - Cột Tổng tuần: Hiển thị Tổng kế hoạch (tấn), Tổng đã nhận (tấn), Chênh lệch còn thiếu (tô đỏ nếu thiếu, tô xanh nếu đủ/dư).
    - Các dòng đề xuất nháp được hiển thị nền vàng nhạt kèm nhãn "Đề xuất".
