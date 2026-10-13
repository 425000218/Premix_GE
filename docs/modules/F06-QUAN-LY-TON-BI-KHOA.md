# ĐẶC TẢ CHI TIẾT MODULE F06: QUẢN LÝ TỒN BỊ KHÓA (CHẶN TỒN THỦ CÔNG)

> **Mã phân hệ:** F06  
> **Tên module:** Blocked Inventory Management (Manual Stock Holding)  
> **Mức độ ưu tiên:** Should Have (S)  
> **Tiêu chuẩn kỹ thuật:** Concurrency Locking (`UPDLOCK, HOLDLOCK`), Atomic Stored Procedures, Audit Trail

---

## 1. Mục tiêu & Phạm vi Nghiệp vụ

### 1.1. Mục tiêu
- Cung cấp cơ chế cho phép nhân viên vận hành (Planner hoặc Thủ kho nhà máy) chủ động tạm giữ / khóa một lượng nguyên liệu tồn kho thực tế phục vụ các mục đích nghiệp vụ: Chờ kiểm nghiệm chất lượng (QC pending), lô hàng bị nghi ngờ biến chất, giữ hàng cho mục đích thử nghiệm sản xuất riêng biệt.
- Lượng hàng bị khóa sẽ được tự động trừ khỏi Tồn kho thực tế (SOH) để tạo ra **Tồn khả dụng (Available SOH)**, đảm bảo hệ thống không tính toán số lượng này vào nguồn nguyên liệu sẵn sàng cho sản xuất.
- Đảm bảo kiểm soát an toàn nghiêm ngặt: Tổng lượng hàng khóa không bao giờ được vượt quá tồn kho thực tế có sẵn tại ngày chốt mới nhất.

### 1.2. Phạm vi Chức năng
- **Tạo lệnh Khóa hàng (Block Stock):** Thiết lập lệnh khóa mới cho một cặp NM–NL với số lượng kg cụ thể, ngày bắt đầu và lý do.
- **Mở khóa hàng (Release Block):** Kết thúc hiệu lực của lệnh khóa bằng cách cập nhật ngày kết thúc (`EndDate`).
- **Danh sách Lệnh khóa:** Tra cứu toàn bộ các lệnh khóa với đầy đủ tính năng phân trang (10, 20, 50, Tất cả), sắp xếp, lọc theo nhà máy, trạng thái và tìm kiếm lý do.

---

## 2. Ma trận Phân quyền Module F06

| Mã quyền (`PermissionCode`) | Hành động được phép | ADMIN | PLANNER | FACTORY | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `block.view` | Xem danh sách các lệnh khóa hàng | ✓ | ✓ | ✓ | ✓ |
| `block.create` | Tạo mới lệnh khóa tồn kho | ✓ | ✓ | ✓ | |
| `block.release`| Thực hiện mở khóa hàng | ✓ | ✓ | ✓ | |

*(Lưu ý về phạm vi: Người dùng vai trò `FACTORY` chỉ được tạo và mở khóa hàng tại các nhà máy mà mình được phân công phụ trách. Người dùng `VIEWER` chỉ có quyền xem).*

---

## 3. Quy tắc Nghiệp vụ Chi tiết (Business Rules)

### 3.1. Quy tắc Trạng thái & Tính Hiệu lực (BR-28, BR-04)
- **Thuật ngữ giao diện:** Tên phân hệ là **Tồn bị khóa**; các nút thao tác là **Khóa hàng** và **Mở khóa**.
- **Không có cột trạng thái độc lập (BR-28):** Trạng thái của lệnh khóa được suy luận tự động từ trường Ngày kết thúc (`EndDate`):
  - **Đang khóa (Active):** Khi `EndDate IS NULL` hoặc `EndDate > C` (với $C$ là ngày chốt đang xét).
  - **Đã mở khóa (Released):** Khi `EndDate IS NOT NULL` và `EndDate \le C`.
- **Tính hiệu lực tại ngày chốt $C$ (BR-04):** Lệnh khóa được tính là có hiệu lực làm giảm tồn khả dụng tại ngày chốt $C$ khi và chỉ khi:
  $$\text{StartDate} \le C \quad \text{VÀ} \quad (\text{EndDate IS NULL} \text{ HOẶC } \text{EndDate} > C)$$
- **Bất biến số lượng:** Hệ thống **không cung cấp chức năng chỉnh sửa số lượng kg** của một lệnh khóa sau khi tạo. Nếu người dùng nhập sai số lượng, quy trình bắt buộc là: Mở khóa lệnh cũ và tạo một lệnh khóa mới.

### 3.2. Quy tắc Hạn mức & Kiểm soát Đồng thời (BR-28a, BR-04a)
- **BR-28a (Kiểm tra Hạn mức Khóa An toàn):** Khi tạo một lệnh khóa mới cho cặp $(NM, NL)$:
  $$\sum \text{BlockedKg (Các lệnh đang khóa)} + \text{BlockedKg (Lệnh mới)} \le \text{SOH}(C_{\text{mới nhất}})$$
  - Nếu tổng lượng khóa vượt quá tồn kho thực tế của ngày chốt mới nhất: Hệ thống **từ chối lệnh** (HTTP 400) và trả về thông báo rõ ràng:
    $$\text{"Số lượng khóa vượt quá tồn kho khả dụng. Khối lượng tối đa có thể khóa thêm là: X kg."}$$
  - Nếu cặp chưa từng có dữ liệu tồn kho (chưa nạp SOH): Hệ thống từ chối cho phép khóa hàng.
- **Khóa Đồng thời trong CSDL (Concurrency Control):** Để ngăn chặn trường hợp hai người dùng thao tác cùng lúc dẫn đến tổng lượng khóa vượt SOH, Stored Procedure `sp_Block_Create` bắt buộc bọc trong một transaction với gợi ý khóa dòng:
  `WITH (UPDLOCK, HOLDLOCK)` trên bảng `fact_Inventory_SOH`.
- **BR-04a (Lớp An toàn Dự phòng):** Trường hợp sau khi tạo lệnh khóa, lần nạp SOH mới từ ERP làm tồn thực tế giảm xuống thấp hơn tổng lượng đang khóa:
  - Hệ thống tự động gán $\text{availableKg} = 0$ (không để tồn âm).
  - Tự động bật cờ cảnh báo `BLOCKED_EXCEEDS_SOH` trên Bảng vị thế và Bảng điều khiển.

---

## 4. User Stories & Tiêu chí Chấp nhận (AC)

### 4.1. User Stories
1. **US-11 (Khóa hàng chờ kiểm nghiệm):** Là một *Thủ kho nhà máy (FACTORY)*, tôi muốn khóa 2.000 kg nguyên liệu vừa phát hiện rách bao chờ kiểm định, để phân xưởng không xuất dùng số hàng này.
2. **US-12 (Mở khóa hàng):** Là một *Planner*, tôi muốn mở khóa 5.000 kg nguyên liệu sau khi có kết quả kiểm nghiệm đạt chuẩn, để hàng sẵn sàng đưa vào kế hoạch sản xuất.
3. **US-13 (Xem danh sách tồn bị khóa):** Là một *Quản lý (VIEWER)*, tôi muốn xem danh sách các lệnh khóa trên toàn hệ thống có lọc theo trạng thái và nhà máy, để theo dõi tỷ lệ hàng ứ đọng chờ xử lý.

### 4.2. Acceptance Criteria (Given - When - Then)

- **AC-06.01 (Tạo lệnh khóa hợp lệ):**
  - **Given:** Cặp (NM BD, NL PREMIX_01) có $\text{SOH} = 10.000\text{ kg}$, hiện chưa có lệnh khóa nào.
  - **When:** Người dùng gửi lệnh khóa $3.000\text{ kg}$ với $\text{StartDate} = 05/10/2026$.
  - **Then:** Hệ thống lưu thành công; Tồn khả dụng của cặp này tại ngày 05/10 giảm xuống còn $7.000\text{ kg}$.

- **AC-06.02 (Từ chối khi khóa vượt tồn thực tế):**
  - **Given:** Cặp (NM DN, NL VIT_E) có $\text{SOH} = 5.000\text{ kg}$, đang bị khóa $4.000\text{ kg}$.
  - **When:** Người dùng cố tình tạo thêm lệnh khóa $2.000\text{ kg}$ (tổng thành $6.000\text{ kg}$).
  - **Then:** Hệ thống từ chối với HTTP 400 Bad Request, báo lỗi: *"Số lượng khóa vượt quá SOH. Tối đa có thể khóa thêm: 1.000 kg"*.

- **AC-06.03 (Mở khóa hàng):**
  - **Given:** Lệnh khóa ID = 10 đang có hiệu lực từ ngày 01/10/2026 (`EndDate = NULL`).
  - **When:** Người dùng thực hiện mở khóa với $\text{EndDate} = 05/10/2026$.
  - **Then:** Lệnh chuyển trạng thái "Đã mở khóa"; tại các ngày chốt sau ngày 05/10, lượng $3.000\text{ kg}$ này được trả lại vào tồn khả dụng.

- **AC-06.04 (Mở khóa với ngày kết thúc không hợp lệ):**
  - **Given:** Lệnh khóa có $\text{StartDate} = 10/10/2026$.
  - **When:** Người dùng nhập $\text{EndDate} = 08/10/2026$ ($\text{EndDate} < \text{StartDate}$).
  - **Then:** Hệ thống từ chối với HTTP 400: *"Ngày kết thúc mở khóa không được sớm hơn ngày bắt đầu khóa"*.

---

## 5. Thiết kế Cơ sở Dữ liệu & Stored Procedures

### 5.1. Bảng `fact_Inventory_Block`

```sql
CREATE TABLE dbo.fact_Inventory_Block (
    BlockID INT IDENTITY(1,1) NOT NULL,
    FactoryID INT NOT NULL,
    MaterialID INT NOT NULL,
    BlockedKg DECIMAL(18,0) NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NULL,
    Reason NVARCHAR(250) NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedBy NVARCHAR(50) NOT NULL,
    ReleasedAt DATETIME2(0) NULL,
    ReleasedBy NVARCHAR(50) NULL,
    CONSTRAINT PK_fact_Inventory_Block PRIMARY KEY CLUSTERED (BlockID),
    CONSTRAINT FK_InventoryBlock_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
    CONSTRAINT FK_InventoryBlock_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
    CONSTRAINT CK_InventoryBlock_Kg CHECK (BlockedKg > 0),
    CONSTRAINT CK_InventoryBlock_Dates CHECK (EndDate IS NULL OR EndDate >= StartDate)
);
```

### 5.2. Stored Procedures Chuẩn

#### 1. `sp_Block_List` (Phân trang, lọc nhà máy, trạng thái, tìm kiếm)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_Block_List
    @Search NVARCHAR(100) = NULL,
    @FactoryID INT = NULL,
    @Status VARCHAR(10) = NULL, -- 'ACTIVE' (đang khóa) hoặc 'RELEASED' (đã mở)
    @AsOfDate DATE = NULL,      -- Ngày mốc xét trạng thái (mặc định hôm nay)
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'CreatedAt',
    @SortOrder NVARCHAR(4) = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    IF @AsOfDate IS NULL SET @AsOfDate = CAST(SYSUTCDATETIME() AS DATE);
    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    WITH FilteredBlocks AS (
        SELECT 
            b.BlockID,
            b.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            b.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            b.BlockedKg,
            b.StartDate,
            b.EndDate,
            b.Reason,
            b.CreatedAt,
            b.CreatedBy,
            b.ReleasedAt,
            b.ReleasedBy,
            CASE 
                WHEN b.EndDate IS NULL OR b.EndDate > @AsOfDate THEN 'ACTIVE'
                ELSE 'RELEASED'
            END AS BlockStatus,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.fact_Inventory_Block b
        INNER JOIN dbo.dim_Factory f ON b.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON b.MaterialID = m.MaterialID
        WHERE (@Search IS NULL OR m.MaterialCode LIKE '%' + @Search + '%' OR m.MaterialName LIKE '%' + @Search + '%' OR b.Reason LIKE '%' + @Search + '%')
          AND (@FactoryID IS NULL OR b.FactoryID = @FactoryID)
          AND (@Status IS NULL OR (
                (@Status = 'ACTIVE' AND (b.EndDate IS NULL OR b.EndDate > @AsOfDate)) OR
                (@Status = 'RELEASED' AND b.EndDate IS NOT NULL AND b.EndDate <= @AsOfDate)
              ))
    )
    SELECT *
    FROM FilteredBlocks
    ORDER BY 
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'CreatedAt' THEN CreatedAt END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'CreatedAt' THEN CreatedAt END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'BlockedKg' THEN BlockedKg END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'BlockedKg' THEN BlockedKg END DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
```

#### 2. `sp_Block_Create` (Có kiểm tra hạn mức & Khóa dòng an toàn)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_Block_Create
    @FactoryID INT,
    @MaterialID INT,
    @BlockedKg DECIMAL(18,0),
    @StartDate DATE,
    @Reason NVARCHAR(250) = NULL,
    @CreatedBy NVARCHAR(50),
    @NewBlockID INT OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Tìm ngày chốt mới nhất
        DECLARE @LatestSnapshot DATE;
        SELECT @LatestSnapshot = MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH;

        IF @LatestSnapshot IS NULL
        BEGIN
            RAISERROR(N'Hệ thống chưa có dữ liệu tồn kho. Không thể thực hiện khóa hàng.', 16, 1);
            RETURN;
        END

        -- 2. Đọc SOH tại ngày chốt mới nhất với khóa an toàn
        DECLARE @CurrentSoh DECIMAL(18,0);
        SELECT @CurrentSoh = SohQtyKg 
        FROM dbo.fact_Inventory_SOH WITH (UPDLOCK, HOLDLOCK)
        WHERE FactoryID = @FactoryID AND MaterialID = @MaterialID AND SnapshotDate = @LatestSnapshot;

        IF @CurrentSoh IS NULL OR @CurrentSoh <= 0
        BEGIN
            RAISERROR(N'Tồn kho thực tế của nguyên liệu tại nhà máy này đang bằng 0.', 16, 2);
            RETURN;
        END

        -- 3. Tính tổng lượng hàng đang bị khóa
        DECLARE @CurrentlyBlocked DECIMAL(18,0);
        SELECT @CurrentlyBlocked = ISNULL(SUM(BlockedKg), 0)
        FROM dbo.fact_Inventory_Block WITH (UPDLOCK, HOLDLOCK)
        WHERE FactoryID = @FactoryID AND MaterialID = @MaterialID
          AND (EndDate IS NULL OR EndDate > @LatestSnapshot);

        -- 4. Kiểm tra điều kiện không vượt SOH (BR-28a)
        DECLARE @AvailableToBlock DECIMAL(18,0) = @CurrentSoh - @CurrentlyBlocked;
        IF @BlockedKg > @AvailableToBlock
        BEGIN
            DECLARE @Msg NVARCHAR(500) = FORMATMESSAGE(N'Số lượng khóa vượt quá tồn kho khả dụng. Khối lượng tối đa có thể khóa thêm là: %s kg.', FORMAT(@AvailableToBlock, '#,0'));
            RAISERROR(@Msg, 16, 3);
            RETURN;
        END

        -- 5. Thực hiện thêm lệnh khóa
        INSERT INTO dbo.fact_Inventory_Block (
            FactoryID, MaterialID, BlockedKg, StartDate, EndDate, Reason, CreatedAt, CreatedBy
        )
        VALUES (
            @FactoryID, @MaterialID, @BlockedKg, @StartDate, NULL, @Reason, SYSUTCDATETIME(), @CreatedBy
        );

        SET @NewBlockID = SCOPE_IDENTITY();

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
```

#### 3. `sp_Block_Release` (Giải phóng lệnh khóa)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_Block_Release
    @BlockID INT,
    @EndDate DATE,
    @ReleasedBy NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @StartDate DATE, @CurrentEndDate DATE;
        SELECT @StartDate = StartDate, @CurrentEndDate = EndDate
        FROM dbo.fact_Inventory_Block WITH (UPDLOCK, HOLDLOCK)
        WHERE BlockID = @BlockID;

        IF @StartDate IS NULL
        BEGIN
            RAISERROR(N'Lệnh khóa hàng không tồn tại.', 16, 1);
            RETURN;
        END

        IF @CurrentEndDate IS NOT NULL
        BEGIN
            RAISERROR(N'Lệnh khóa hàng này đã được mở khóa trước đó.', 16, 2);
            RETURN;
        END

        IF @EndDate < @StartDate
        BEGIN
            RAISERROR(N'Ngày kết thúc mở khóa không được sớm hơn ngày bắt đầu khóa.', 16, 3);
            RETURN;
        END

        UPDATE dbo.fact_Inventory_Block
        SET EndDate = @EndDate,
            ReleasedAt = SYSUTCDATETIME(),
            ReleasedBy = @ReleasedBy
        WHERE BlockID = @BlockID;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
```

---

## 6. Đặc tả API RESTful Module F06

| Phương thức | Đường dẫn API | Quyền | Mô tả |
|---|---|---|---|
| `GET` | `/api/v1/blocks` | `block.view` | Danh sách lệnh khóa (phân trang, lọc NM, trạng thái, tìm kiếm) |
| `POST`| `/api/v1/blocks` | `block.create` | Tạo mới lệnh khóa tồn kho (kiểm tra hạn mức) |
| `POST`| `/api/v1/blocks/:id/release` | `block.release` | Mở khóa hàng (cập nhật `EndDate`) |

---

## 7. Đặc tả Giao diện Người dùng (UI/UX)

- **Màn hình Quản lý Tồn bị khóa (`/blocks`):**
  - **Thanh công cụ:**
    - Dropdown lọc Nhà máy (FACTORY bị khóa cố định nhà máy mình).
    - Dropdown lọc Trạng thái: "Tất cả", "Đang khóa", "Đã mở khóa".
    - Ô tìm kiếm: Mã nguyên liệu, Tên nguyên liệu, Lý do khóa.
    - Nút "+ Tạo lệnh khóa hàng" (Mở modal).
  - **Bảng dữ liệu:**
    - Phân trang dưới chân: `10`, `20`, `50`, `Tất cả`.
    - Các cột: Mã NM, Tên Nguyên liệu, Số lượng khóa (kg), Ngày bắt đầu, Ngày kết thúc, Trạng thái (Badge xanh: Đang khóa; Badge xám: Đã mở), Lý do, Người tạo/mở.
    - Cột hành động: Nếu lệnh đang khóa $\rightarrow$ Nút "Mở khóa".
  - **Modal Tạo lệnh khóa:**
    - Ô chọn Nhà máy & Nguyên liệu (tự động hiện số SOH hiện tại và số kg tối đa có thể khóa).
    - Ô nhập số lượng (kg) kèm kiểm tra trực tiếp.
    - Ô chọn Ngày bắt đầu (mặc định ngày chốt đang xem).
    - Ô nhập Lý do (tối đa 250 ký tự).
  - **Modal Mở khóa:**
    - Hiển thị tóm tắt lệnh khóa.
    - Ô chọn Ngày kết thúc (mặc định ngày hôm nay, không cho chọn trước StartDate).

---

## 8. Kiểm toán & Nhật ký (Audit Log)

1. `INVENTORY_BLOCK_CREATE`: Ghi nhận tạo lệnh khóa mới (Cặp NM–NL, số kg, lý do, người thực hiện).
2. `INVENTORY_BLOCK_RELEASE`: Ghi nhận giải phóng lệnh khóa (ID lệnh, ngày kết thúc, người mở khóa).
