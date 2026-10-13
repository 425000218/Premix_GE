# ĐẶC TẢ CHI TIẾT MODULE F02: DANH MỤC & CẤU HÌNH HỆ THỐNG

> **Mã phân hệ:** F02 (Bao gồm F02a, F02b)  
> **Tên module:** Catalog Management & System Configuration  
> **Mức độ ưu tiên:** Must Have (M - Xem & Cấu hình chung), Should Have (S - Ngưỡng theo cặp & Thuộc tính mở rộng)  
> **Tiêu chuẩn kỹ thuật:** Clean Architecture, Domain Validation, Stored Procedures, Audit Log

---

## 1. Mục tiêu & Phạm vi Nghiệp vụ

### 1.1. Mục tiêu
- Quản lý và tra cứu tập trung toàn bộ dữ liệu danh mục gốc (Master Data) bao gồm Nhà máy, Nguyên liệu, Nhà cung cấp và Danh sách cặp theo dõi.
- Đảm bảo tính toàn vẹn dữ liệu từ ERP D365: Dữ liệu Master Data trên giao diện Web là **chỉ đọc** đối với các trường thông tin kế thừa từ ERP, chỉ cho phép quản trị viên/planner bổ sung các thuộc tính mở rộng nội bộ mà ERP không hỗ trợ.
- Cung cấp cơ chế thiết lập linh hoạt các tham số điều hành toàn hệ thống (`cfg_System`) và cơ chế ghi đè ngưỡng cảnh báo/định mức giao hàng theo từng cặp Nhà máy – Nguyên liệu (`cfg_Stock_Threshold`).

### 1.2. Phạm vi Chức năng
- **F02a: Tra cứu danh mục Master Data:**
  - Danh mục 6 Nhà máy (`dim_Factory`): Mã NM, tên NM, vùng miền (SOUTH, CENTRAL, NORTH), loại nhà máy (Feed, Aqua), mã kho (WarehouseCode).
  - Danh mục 26 Nguyên liệu (`dim_Material`): Mã NL, tên NL, Category, Phân nhóm (Premix / Ngoài premix), quy cách bao (kg), đơn vị tính. Cho phép sửa: Người phụ trách (`PIC`), số lẻ hiển thị (`DisplayDecimals`: 0–3).
  - Danh mục 14 Nhà cung cấp (`dim_Supplier`): Mã NCC, tên NCC, nhóm vendor (`LOC_*`, `FOR_*`), quốc gia. Cho phép sửa: Thời gian giao hàng (`LeadTimeDays`: 0–365).
  - Danh mục Cặp theo dõi (`dim_Factory_Material` - Plant Items, 72 cặp). Cho phép sửa: Trạng thái theo dõi (`IsTracked`: Bật/Tắt).
  - Bảng Nguyên liệu thay thế (`dim_Material_Substitution`): Lưu trữ cấu trúc trong CSDL, chưa mở giao diện trong phiên bản này (theo Q-009).
- **F02b: Cấu hình hệ thống & Ngưỡng tồn kho:**
  - Cấu hình chung (`cfg_System`): Quản lý 1 dòng duy nhất chứa 16 tham số thuật toán toàn hệ thống.
  - Ngưỡng theo cặp (`cfg_Stock_Threshold`): Thiết lập ngưỡng cảnh báo riêng (`WarningDays`, `OverstockDays`), số ngày an toàn (`SafetyDays`), định mức chuyến (`DeliveryDays`, `DeliveryQtyKg`).

---

## 2. Ma trận Phân quyền Module F02

| Mã quyền (`PermissionCode`) | Hành động được phép | ADMIN | PLANNER | FACTORY | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `catalog.view` | Xem màn hình menu Danh mục và các bảng dữ liệu | ✓ | ✓ | ✓ | ✓ |
| `material.edit` | Cập nhật trường PIC và DisplayDecimals của Nguyên liệu | ✓ | | | |
| `supplier.edit` | Cập nhật trường LeadTimeDays của Nhà cung cấp | ✓ | | | |
| `factory-material.edit` | Bật / Tắt trạng thái theo dõi cặp (`IsTracked`) | ✓ | | | |
| `threshold.edit` | Ghi đè hoặc xóa ngưỡng cảnh báo/định mức theo cặp | ✓ | ✓ | | |
| `system-config.edit` | Thay đổi các tham số cấu hình chung hệ thống | ✓ | | | |

*(Lưu ý: Các API dropdown tra cứu nhanh nhà máy, nguyên liệu, NCC mở tự do cho mọi người dùng đã đăng nhập để nạp các bộ lọc).*

---

## 3. Quy tắc Nghiệp vụ Chi tiết (Business Rules)

### 3.1. Quy tắc Master Data
- **BR-31 (Dữ liệu ERP chỉ đọc):** Toàn bộ thông tin định danh từ Master Data (Mã nhà máy, Tên, Mã nguyên liệu, Tên nguyên liệu, Category, Phân nhóm, Mã NCC, Tên NCC) là **bất biến trên Web**. Tuyệt đối không cung cấp API tạo mới, sửa tên hoặc xóa các trường này trên Web.
- **BR-31a (Xử lý mã vắng mặt khi nạp Master mới - Q-037):** Khi nạp file Master Data mới, các thực thể có trong CSDL nhưng không còn xuất hiện trong file mới sẽ được tự động đánh dấu ngừng dùng (`IsActive = 0`).
  - Khi `IsActive = 0`, thực thể bị ẩn khỏi Bảng vị thế, Bảng điều khiển, Gợi ý mua hàng và các ô chọn dropdown, nhưng dữ liệu lịch sử vẫn được bảo toàn.
  - Riêng bảng Danh mục vẫn cho phép xem (thông qua bộ lọc trạng thái "Ngừng sử dụng").
  - Nếu mã đó xuất hiện lại ở lần nạp sau, hệ thống tự động kích hoạt lại (`IsActive = 1`).
- **BR-32 (Hai trục phân nhóm nguyên liệu):** Mọi nguyên liệu bắt buộc được phân loại đồng thời theo 2 chiều:
  1. `Category`: Vitamin, Khoáng vi lượng, Enzyme, Acid hữu cơ, Hương liệu, v.v.
  2. `Group (Nhóm)`: `Premix` hoặc `Ngoài premix`.
  - Cả 2 trường này đều được sử dụng làm bộ lọc đa năng trên Bảng vị thế và Bảng điều khiển.
- **Cặp theo dõi (`IsTracked`):** Khi tắt theo dõi (`IsTracked = 0`), cặp NM–NL sẽ không xuất hiện trên Bảng vị thế và Bảng điều khiển. Dữ liệu nạp từ các file giao dịch của cặp này vẫn được ghi nhận đầy đủ vào CSDL.

### 3.2. Quy tắc Thứ tự Ngưỡng & Cấu hình Hệ thống
- **BR-12 (Ràng buộc Cấu hình Chung):** Các tham số ngưỡng cảnh báo trong `cfg_System` bắt buộc thỏa mãn quan hệ toán học ngặt nghèo:
  $$\text{CriticalDays} < \text{WarningDays} < \text{OverstockDays} \le \text{OverstockDaysLowUsage}$$
  - Mặc định: $7 < 15 < 75 \le 90$.
- **BR-12a (Tính Hợp lệ của Ngưỡng Ghi đè theo Cặp):**
  - Khi một cặp NM–NL thiết lập ngưỡng ghi đè, ngưỡng đó hợp lệ khi và chỉ khi:
    $$\text{CriticalDays (chung)} < \text{WarningDays (hiệu lực)} < \text{OverstockDays (hiệu lực)}$$
  - Trong đó: Nếu ô ghi đè để trống (NULL), hệ thống tự động lấy giá trị mặc định từ cấu hình chung.
  - Các tham số `SafetyDays` ($0 \le \text{SafetyDays} \le 365$, tối đa 1 số lẻ), `DeliveryDays` ($1 \le \text{DeliveryDays} \le 365$, tối đa 1 số lẻ), và `DeliveryQtyKg` (nguyên $> 0$) là các tham số vận hành độc lập, **không tham gia** vào chuỗi so sánh trên.
- **BR-12b (Bảo vệ Toàn vẹn khi Sửa Cấu hình Chung):** Khi người dùng sửa cấu hình chung trong `cfg_System` (ví dụ tăng `CriticalDays` hoặc giảm `OverstockDays`), nếu sự thay đổi này làm cho bất kỳ cặp NM–NL nào đã ghi đè ngưỡng bị vi phạm quy tắc BR-12a:
  - Hệ thống **từ chối lưu** (HTTP 400).
  - Trả về danh sách chi tiết các cặp NM–NL bị xung đột để người dùng điều chỉnh hoặc xóa ngưỡng ghi đè của các cặp đó trước.

### 3.3. Bảng 16 Tham số Cấu hình Chung Hệ thống (`cfg_System`)

| Tên tham số | Mặc định | Giới hạn kiểm tra | Sử dụng tại | Ý nghĩa nghiệp vụ |
|---|:---:|:---:|---|---|
| `StandardMonthDays` | 28 | 20 – 31 | BR-05 | Số ngày chuẩn của một tháng chu kỳ (mặc định 28 ngày) |
| `CriticalDays` | 7 | $> 0$, $< \text{Warning}$ | BR-10, 25, 35 | Ngưỡng số ngày tồn kho Nguy cấp (CRITICAL) |
| `WarningDays` | 15 | $< \text{Overstock}$ | BR-10, 25 | Ngưỡng số ngày tồn kho Cảnh báo (WARNING) |
| `OverstockDays` | 75 | $\le \text{LowUsage}$ | BR-10 | Ngưỡng số ngày tồn kho Dư thừa (OVERSTOCK) thông thường |
| `OverstockDaysLowUsage` | 90 | $\ge \text{Overstock}$ | BR-10 | Ngưỡng tồn dư dành riêng cho nguyên liệu dùng ít |
| `LowUsageKgPerMonth` | 1.000 | $\ge 0$ | BR-10 | Định mức tiêu hao tháng để phân loại "nguyên liệu dùng ít" |
| `MinActiveDays` | 3 | $\ge 1$ | BR-07, 39 | Số ngày chạy máy tối thiểu trong tháng để dùng nhịp thực tế |
| `ActualWindowDays` | 14 | $\ge \text{MinActiveDays}$ | Dự phòng | Tham số cửa sổ (giữ lại theo baseline, chưa áp dụng tính toán) |
| `PoLateMonths` | 3 | 1 – 24 | BR-19c | Số tháng trôi qua kể từ ngày tạo PO để gắn cờ PO trễ hạn nhận |
| `PoAgeReference` | `SNAPSHOT` | `SNAPSHOT`/`TODAY` | BR-19c | Mốc tính tuổi PO (theo ngày chốt hay ngày thực tế hôm nay) |
| `DeliveryDays` | 7 | 1 – 365 | BR-36a | Số ngày tiêu hao mặc định cho 1 chuyến giao (N chung) |
| `BulkDeliveryKg` | 30.000 | $> 0$ | BR-36a | Định mức chuyến giao mặc định cho hàng xá (kg) |
| `UnusedStockDays` *(mới)* | 60 | $\ge 1$ | BR-37 | Số ngày không xuất dùng để kích hoạt cờ Tồn không sử dụng |
| `ReorderCoverDays` *(mới)*| 20 | $> 0$ | BR-38 | Số ngày bảo vệ tối thiểu, dưới mức này bật cờ Cần đặt hàng |
| `UsageDeviationPct` *(mới)*| 30 | $> 0$ | BR-39 | Tỷ lệ % lệch giữa tiêu hao thực tế và chuẩn để bật cờ cảnh báo |
| `StaleDataDays` *(mới)* | 2 | $\ge 1$ | BR-40 | Số ngày chênh lệch để hiển thị thanh cảnh báo Dữ liệu cũ |

---

## 4. User Stories & Tiêu chí Chấp nhận (AC)

### 4.1. User Stories
1. **US-06 (Xem danh mục nguyên liệu):** Là một *Planner*, tôi muốn xem danh sách các nguyên liệu kèm phân loại Category, Nhóm và bao bì có hỗ trợ phân trang và tìm kiếm, để nắm bắt thông tin vật tư.
2. **US-07 (Cập nhật thuộc tính nguyên liệu):** Là *Quản trị viên (ADMIN)*, tôi muốn cấu hình người phụ trách (PIC) và số chữ số thập phân hiển thị cho nguyên liệu, để chuẩn hóa hiển thị trên báo cáo vị thế.
3. **US-08 (Thiết lập thời gian giao hàng NCC):** Là *Quản trị viên (ADMIN)*, tôi muốn cập nhật số ngày Lead Time của nhà cung cấp, để hệ thống tính toán mốc đặt hàng muộn nhất chính xác.
4. **US-09 (Ghi đè ngưỡng tồn kho):** Là một *Planner*, tôi muốn thiết lập ngưỡng tồn dư riêng cho nguyên liệu đặc thù tại nhà máy mình, để tránh hệ thống báo động sai lệch.
5. **US-10 (Cập nhật cấu hình chung):** Là *Quản trị viên (ADMIN)*, tôi muốn cập nhật các tham số cấu hình hệ thống, để điều chỉnh chính sách tồn kho linh hoạt theo chỉ đạo ban giám đốc.

### 4.2. Acceptance Criteria (Given - When - Then)

- **AC-02.01 (Bảo vệ Master Data bất biến):**
  - **Given:** Người dùng cố tình gửi request `PUT /api/v1/materials/RM001` với trường `materialName: "Tên mới"`.
  - **When:** Hệ thống xử lý request qua ValidationPipe.
  - **Then:** API từ chối hoặc bỏ qua trường `materialName`, chỉ chấp nhận `pic` và `displayDecimals`.

- **AC-02.02 (Kiểm tra thứ tự ngưỡng cấu hình chung):**
  - **Given:** ADMIN sửa cấu hình chung `PUT /api/v1/system-config`.
  - **When:** Nhập `criticalDays = 15` và `warningDays = 10` (Warning $\le$ Critical).
  - **Then:** Hệ thống từ chối với HTTP 400 Bad Request, thông báo: *"Ngưỡng CriticalDays phải nhỏ hơn WarningDays"*; CSDL giữ nguyên giá trị cũ.

- **AC-02.03 (Ghi đè ngưỡng theo cặp hợp lệ):**
  - **Given:** Ngưỡng mặc định chung là Critical = 7, Warning = 15, Overstock = 75.
  - **When:** Planner thiết lập ngưỡng riêng cho cặp (NM DN, NL PREMIX_01) với `overstockDays = 60`.
  - **Then:** Hệ thống kiểm tra $7 < 15 < 60 \rightarrow$ Hợp lệ; lưu vào `cfg_Stock_Threshold`. Vị thế cặp này sẽ sử dụng mức 60 ngày để xét tồn dư.

- **AC-02.04 (Kiểm tra xung đột BR-12b khi đổi cấu hình chung):**
  - **Given:** Cặp (NM BD, NL VIT_A) đang có ngưỡng ghi đè `WarningDays = 10`.
  - **When:** ADMIN sửa cấu hình chung tăng `CriticalDays` từ 7 lên 12.
  - **Then:** Hệ thống phát hiện cặp trên bị vi phạm ($12 \not< 10$); từ chối lưu và trả về HTTP 400 kèm danh sách cặp xung đột: `[{ factoryCode: 'BD', materialCode: 'VIT_A' }]`.

---

## 5. Thiết kế Cơ sở Dữ liệu & Stored Procedures

### 5.1. Cấu trúc Bảng CSDL

#### 1. Bảng `cfg_System` (1 dòng duy nhất)
```sql
CREATE TABLE dbo.cfg_System (
    ConfigID INT NOT NULL DEFAULT 1,
    StandardMonthDays INT NOT NULL DEFAULT 28,
    CriticalDays INT NOT NULL DEFAULT 7,
    WarningDays INT NOT NULL DEFAULT 15,
    OverstockDays INT NOT NULL DEFAULT 75,
    OverstockDaysLowUsage INT NOT NULL DEFAULT 90,
    LowUsageKgPerMonth DECIMAL(18,0) NOT NULL DEFAULT 1000,
    MinActiveDays INT NOT NULL DEFAULT 3,
    ActualWindowDays INT NOT NULL DEFAULT 14,
    PoLateMonths INT NOT NULL DEFAULT 3,
    PoAgeReference VARCHAR(10) NOT NULL DEFAULT 'SNAPSHOT',
    DeliveryDays INT NOT NULL DEFAULT 7,
    BulkDeliveryKg DECIMAL(18,0) NOT NULL DEFAULT 30000,
    UnusedStockDays INT NOT NULL DEFAULT 60,
    ReorderCoverDays INT NOT NULL DEFAULT 20,
    UsageDeviationPct DECIMAL(5,2) NOT NULL DEFAULT 30.00,
    StaleDataDays INT NOT NULL DEFAULT 2,
    UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy NVARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
    CONSTRAINT PK_cfg_System PRIMARY KEY CLUSTERED (ConfigID),
    CONSTRAINT CK_cfg_System_SingleRow CHECK (ConfigID = 1),
    CONSTRAINT CK_cfg_System_Thresholds CHECK (CriticalDays < WarningDays AND WarningDays < OverstockDays AND OverstockDays <= OverstockDaysLowUsage)
);
```

#### 2. Bảng `cfg_Stock_Threshold` (Ghi đè theo cặp)
```sql
CREATE TABLE dbo.cfg_Stock_Threshold (
    ThresholdID INT IDENTITY(1,1) NOT NULL,
    FactoryID INT NOT NULL,
    MaterialID INT NOT NULL,
    WarningDays INT NULL,
    OverstockDays INT NULL,
    SafetyDays DECIMAL(4,1) NULL,
    DeliveryDays DECIMAL(4,1) NULL,
    DeliveryQtyKg DECIMAL(18,0) NULL,
    Note NVARCHAR(250) NULL,
    UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedBy NVARCHAR(50) NOT NULL,
    CONSTRAINT PK_cfg_Stock_Threshold PRIMARY KEY CLUSTERED (ThresholdID),
    CONSTRAINT UQ_cfg_Stock_Threshold_Pair UNIQUE (FactoryID, MaterialID),
    CONSTRAINT FK_StockThreshold_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
    CONSTRAINT FK_StockThreshold_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
    CONSTRAINT CK_StockThreshold_SafetyDays CHECK (SafetyDays IS NULL OR (SafetyDays >= 0 AND SafetyDays <= 365)),
    CONSTRAINT CK_StockThreshold_DeliveryDays CHECK (DeliveryDays IS NULL OR (DeliveryDays >= 1 AND DeliveryDays <= 365)),
    CONSTRAINT CK_StockThreshold_DeliveryQty CHECK (DeliveryQtyKg IS NULL OR DeliveryQtyKg > 0)
);
```

### 5.2. Stored Procedures Chuẩn

#### 1. `sp_Material_List` (Phân trang, lọc Category, Nhóm, IsTracked, IsActive)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_Material_List
    @Search NVARCHAR(100) = NULL,
    @Category NVARCHAR(50) = NULL,
    @ItemGroup NVARCHAR(50) = NULL,
    @IsActive BIT = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'MaterialCode',
    @SortOrder NVARCHAR(4) = 'ASC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    WITH FilteredItems AS (
        SELECT 
            m.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            m.PackingSpec,
            m.BagKg,
            m.UOM,
            m.ItemType,
            m.PIC,
            m.DisplayDecimals,
            m.IsActive,
            m.UpdatedAt,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.dim_Material m
        WHERE (@Search IS NULL OR m.MaterialCode LIKE '%' + @Search + '%' OR m.MaterialName LIKE '%' + @Search + '%')
          AND (@Category IS NULL OR m.Category = @Category)
          AND (@ItemGroup IS NULL OR m.ItemGroup = @ItemGroup)
          AND (@IsActive IS NULL OR m.IsActive = @IsActive)
    )
    SELECT *
    FROM FilteredItems
    ORDER BY 
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'MaterialCode' THEN MaterialCode END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'MaterialCode' THEN MaterialCode END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'MaterialName' THEN MaterialName END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'MaterialName' THEN MaterialName END DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
```

#### 2. `sp_Config_Update` (Kiểm tra xung đột BR-12 & BR-12b)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_Config_Update
    @StandardMonthDays INT,
    @CriticalDays INT,
    @WarningDays INT,
    @OverstockDays INT,
    @OverstockDaysLowUsage INT,
    @LowUsageKgPerMonth DECIMAL(18,0),
    @MinActiveDays INT,
    @PoLateMonths INT,
    @PoAgeReference VARCHAR(10),
    @DeliveryDays INT,
    @BulkDeliveryKg DECIMAL(18,0),
    @UnusedStockDays INT,
    @ReorderCoverDays INT,
    @UsageDeviationPct DECIMAL(5,2),
    @StaleDataDays INT,
    @UpdatedBy NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Kiểm tra ràng buộc BR-12
        IF NOT (@CriticalDays < @WarningDays AND @WarningDays < @OverstockDays AND @OverstockDays <= @OverstockDaysLowUsage)
        BEGIN
            RAISERROR(N'Quy tắc ngưỡng vi phạm: Yêu cầu Critical < Warning < Overstock <= OverstockLowUsage', 16, 1);
            RETURN;
        END

        -- 2. Kiểm tra BR-12b: Có cặp nào bị phá vỡ thứ tự không?
        IF EXISTS (
            SELECT 1 
            FROM dbo.cfg_Stock_Threshold t
            CROSS JOIN (SELECT @CriticalDays AS C, @WarningDays AS W, @OverstockDays AS O) cfg
            WHERE (@CriticalDays >= ISNULL(t.WarningDays, cfg.W))
               OR (ISNULL(t.WarningDays, cfg.W) >= ISNULL(t.OverstockDays, cfg.O))
        )
        BEGIN
            RAISERROR(N'Không thể cập nhật cấu hình chung do gây xung đột thứ tự ngưỡng với các cặp đã ghi đè riêng (BR-12b)', 16, 2);
            RETURN;
        END

        -- 3. Cập nhật bảng cấu hình
        UPDATE dbo.cfg_System
        SET StandardMonthDays = @StandardMonthDays,
            CriticalDays = @CriticalDays,
            WarningDays = @WarningDays,
            OverstockDays = @OverstockDays,
            OverstockDaysLowUsage = @OverstockDaysLowUsage,
            LowUsageKgPerMonth = @LowUsageKgPerMonth,
            MinActiveDays = @MinActiveDays,
            PoLateMonths = @PoLateMonths,
            PoAgeReference = @PoAgeReference,
            DeliveryDays = @DeliveryDays,
            BulkDeliveryKg = @BulkDeliveryKg,
            UnusedStockDays = @UnusedStockDays,
            ReorderCoverDays = @ReorderCoverDays,
            UsageDeviationPct = @UsageDeviationPct,
            StaleDataDays = @StaleDataDays,
            UpdatedAt = SYSUTCDATETIME(),
            UpdatedBy = @UpdatedBy
        WHERE ConfigID = 1;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
```

#### 3. `sp_Threshold_Upsert` (Ghi đè ngưỡng theo cặp có kiểm tra BR-12a)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_Threshold_Upsert
    @FactoryID INT,
    @MaterialID INT,
    @WarningDays INT = NULL,
    @OverstockDays INT = NULL,
    @SafetyDays DECIMAL(4,1) = NULL,
    @DeliveryDays DECIMAL(4,1) = NULL,
    @DeliveryQtyKg DECIMAL(18,0) = NULL,
    @Note NVARCHAR(250) = NULL,
    @UpdatedBy NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Lấy ngưỡng chung
        DECLARE @GenCritical INT, @GenWarning INT, @GenOverstock INT;
        SELECT @GenCritical = CriticalDays, @GenWarning = WarningDays, @GenOverstock = OverstockDays
        FROM dbo.cfg_System WHERE ConfigID = 1;

        -- 2. Tính ngưỡng hiệu lực
        DECLARE @EffWarning INT = ISNULL(@WarningDays, @GenWarning);
        DECLARE @EffOverstock INT = ISNULL(@OverstockDays, @GenOverstock);

        -- 3. Kiểm tra BR-12a
        IF NOT (@GenCritical < @EffWarning AND @EffWarning < @EffOverstock)
        BEGIN
            RAISERROR(N'Ngưỡng ghi đè không hợp lệ: Yêu cầu Critical chung (%d) < Warning hiệu lực (%d) < Overstock hiệu lực (%d)', 
                      16, 1, @GenCritical, @EffWarning, @EffOverstock);
            RETURN;
        END

        -- 4. Thực hiện Upsert
        IF EXISTS (SELECT 1 FROM dbo.cfg_Stock_Threshold WITH (UPDLOCK, HOLDLOCK) WHERE FactoryID = @FactoryID AND MaterialID = @MaterialID)
        BEGIN
            UPDATE dbo.cfg_Stock_Threshold
            SET WarningDays = @WarningDays,
                OverstockDays = @OverstockDays,
                SafetyDays = @SafetyDays,
                DeliveryDays = @DeliveryDays,
                DeliveryQtyKg = @DeliveryQtyKg,
                Note = @Note,
                UpdatedAt = SYSUTCDATETIME(),
                UpdatedBy = @UpdatedBy
            WHERE FactoryID = @FactoryID AND MaterialID = @MaterialID;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.cfg_Stock_Threshold (FactoryID, MaterialID, WarningDays, OverstockDays, SafetyDays, DeliveryDays, DeliveryQtyKg, Note, UpdatedAt, UpdatedBy)
            VALUES (@FactoryID, @MaterialID, @WarningDays, @OverstockDays, @SafetyDays, @DeliveryDays, @DeliveryQtyKg, @Note, SYSUTCDATETIME(), @UpdatedBy);
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
```

---

## 6. Đặc tả API RESTful

| Phương thức | Đường dẫn API | Mã quyền | Mô tả chức năng |
|---|---|---|---|
| `GET` | `/api/v1/factories` | Đã đăng nhập | Danh sách nhà máy (hỗ trợ phân trang/lọc) |
| `GET` | `/api/v1/materials` | `catalog.view` | Danh sách nguyên liệu (phân trang, lọc Category, Nhóm) |
| `PATCH`| `/api/v1/materials/:id` | `material.edit` | Cập nhật PIC, DisplayDecimals của nguyên liệu |
| `GET` | `/api/v1/suppliers` | `catalog.view` | Danh sách nhà cung cấp (phân trang, lọc nhóm) |
| `PATCH`| `/api/v1/suppliers/:id` | `supplier.edit` | Cập nhật LeadTimeDays của NCC |
| `GET` | `/api/v1/factory-materials` | `catalog.view`| Danh sách cặp theo dõi (72 cặp) |
| `PATCH`| `/api/v1/factory-materials/:id/tracking`| `factory-material.edit`| Bật/tắt cờ theo dõi `IsTracked` |
| `GET` | `/api/v1/system-config` | `catalog.view` | Lấy 16 tham số cấu hình chung hệ thống |
| `PUT`  | `/api/v1/system-config` | `system-config.edit` | Cập nhật cấu hình chung (kiểm tra BR-12, BR-12b) |
| `GET` | `/api/v1/thresholds` | `catalog.view` | Danh sách ngưỡng ghi đè theo cặp |
| `POST` | `/api/v1/thresholds` | `threshold.edit`| Thiết lập / Cập nhật ngưỡng ghi đè theo cặp |
| `DELETE`| `/api/v1/thresholds/:id` | `threshold.edit`| Xóa ngưỡng ghi đè (trở về dùng mặc định) |

---

## 7. Đặc tả Giao diện Người dùng (UI/UX)

- **Màn hình Danh mục Vật tư (`/catalog/materials`):**
  - Thanh công cụ phía trên: Dropdown lọc Category (Vitamin, Khoáng, Enzyme...), Dropdown lọc Nhóm (Premix, Ngoài premix), Dropdown Trạng thái (Đang dùng / Ngưng dùng), Ô tìm kiếm mã hoặc tên.
  - Bảng danh sách: Phân trang (10, 20, 50, Tất cả), sắp xếp cột Mã, Tên, Category.
  - Cột hành động: Nút "Sửa thuộc tính" mở Modal chỉnh sửa PIC và số lẻ hiển thị.
- **Màn hình Cấu hình Ngưỡng Tồn kho (`/catalog/thresholds`):**
  - Bảng hiển thị toàn bộ cặp theo dõi kèm cột Ngưỡng Warning, Overstock, SafetyDays, Định mức chuyến.
  - Hiển thị badge: "Mặc định hệ thống" (màu xám) hoặc "Đã ghi đè" (màu xanh dương).
  - Modal chỉnh sửa: Tự động kiểm tra và hiển thị cảnh báo trực tiếp nếu người dùng nhập Warning $\ge$ Overstock trước khi nhấn Lưu.
- **Màn hình Cấu hình Chung (`/admin/system-config`):**
  - Form chia nhóm trực quan: Nhóm ngưỡng tồn kho (7, 15, 75, 90 ngày), Nhóm tiêu hao & PO (28 ngày, 3 tháng, 3 ngày), Nhóm cảnh báo mở rộng (60, 20 ngày, 30%, 2 ngày).
  - Có thanh giải thích trực quan về các dải mức cảnh báo màu.

---

## 8. Kiểm toán & Nhật ký (Audit Log)

Ghi nhận các sự kiện sau vào `sys_Audit_Log`:
1. `SYSTEM_CONFIG_UPDATE`: Cập nhật tham số hệ thống kèm giá trị trước/sau.
2. `THRESHOLD_UPSERT`: Thiết lập hoặc điều chỉnh ngưỡng ghi đè theo cặp.
3. `THRESHOLD_DELETE`: Xóa ngưỡng ghi đè của một cặp.
4. `MATERIAL_UPDATE_ATTRIBUTES`: Thay đổi PIC hoặc số lẻ hiển thị của nguyên liệu.
5. `SUPPLIER_UPDATE_LEADTIME`: Cập nhật lead time của nhà cung cấp.
6. `TRACKING_STATUS_CHANGE`: Bật hoặc tắt cờ theo dõi của một cặp NM–NL.
