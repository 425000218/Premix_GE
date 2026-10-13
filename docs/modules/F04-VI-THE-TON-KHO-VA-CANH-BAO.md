# ĐẶC TẢ CHI TIẾT MODULE F04: VỊ THẾ TỒN KHO, DỰ PHÓNG & CẢNH BÁO

> **Mã phân hệ:** F04 (Bao gồm F04a, F04b, F04c)  
> **Tên module:** Stock Position Calculation Engine, 28-day Projection & Warnings (LÕI HỆ THỐNG)  
> **Mức độ ưu tiên:** Must Have (M - Cốt lõi đề tài)  
> **Tiêu chuẩn kỹ thuật:** Pure TypeScript Domain Engine (Clean Architecture), Single-point Calculation (DEC-04), MS SQL Server 2019 Stored Procedures

---

## 1. Mục tiêu & Phạm vi Nghiệp vụ

### 1.1. Mục tiêu
- Đóng vai trò là "Bộ não tính toán" tập trung của hệ thống PremixTrack: Đọc dữ liệu giao dịch thô tại ngày chốt $C$, áp dụng toàn bộ các công thức toán học và quy tắc nghiệp vụ để tính toán vị thế tồn kho của từng cặp Nhà máy – Nguyên liệu.
- Phân loại chính xác 4 mức cảnh báo tồn kho và nhận diện các cờ bất thường (Flags) nhằm phát hiện sớm nguy cơ dừng sản xuất hoặc ứ đọng vốn.
- Tính toán mô hình dự phóng tồn kho 28 ngày tới (2 tầng dự phóng) và tự động sinh lịch giao hàng đề xuất tối ưu.
- Quản lý lịch sử ghi đè nhu cầu tháng sửa tay (Demand Override) của người dùng lập kế hoạch.

### 1.2. Phạm vi Chức năng
- **F04a: Động cơ tính Vị thế & 4 Mức Cảnh báo:** Tính toán SOH, Tồn bị khóa, Tồn khả dụng, Tiêu hao chuẩn, Tiêu hao thực tế, Tiêu hao dùng cảnh báo ($d$), Số ngày tồn kho (DOI), Ngày dự kiến hết hàng, Phân loại 4 mức (CRITICAL, WARNING, BALANCED, OVERSTOCK) và trạng thái NO_DEMAND.
- **F04b: Nhu cầu tháng Sửa tay & Các Cờ Dữ liệu Mở rộng:** Ghi đè nhu cầu tháng, xử lý PO trễ hạn nhận (PO Late Age), cờ Tồn không sử dụng (`UNUSED_STOCK`), cờ Cần đặt hàng (`REORDER_NEEDED`), cờ Lệch tiêu hao (`USAGE_DEVIATION`), cờ Dữ liệu cũ (`STALE_DATA`).
- **F04c: Dự phóng Tồn 28 ngày & Đề xuất Lịch giao:** Mô phỏng biến động tồn kho hàng ngày từ $C+1$ đến $C+28$ theo 2 tầng (Tầng 1: Đã lên lịch; Tầng 2: Theo đề xuất), xác định 3 mốc thời gian quan trọng (Hết hàng, Cần hàng về trước, Đặt muộn nhất).

---

## 2. Ma trận Phân quyền Module F04

| Mã quyền (`PermissionCode`) | Hành động được phép | ADMIN | PLANNER | FACTORY | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| `position.view` | Xem bảng vị thế, xem chi tiết cặp, xem dự phóng 28 ngày và lịch sử sửa tay | ✓ | ✓ | ✓ | ✓ |
| `demand-override.edit` | Tạo mới hoặc hủy bỏ nhu cầu tháng sửa tay cho một cặp | ✓ | ✓ | | |

*(Lưu ý: Tài khoản vai trò FACTORY chỉ xem được các dòng vị thế thuộc các nhà máy được phân công phụ trách).*

---

## 3. Thuật toán Cốt lõi & Quy tắc Nghiệp vụ (Core Domain Rules)

Toàn bộ công thức dưới đây được cài đặt tập trung tại **Domain Layer** (TypeScript thuần). Tuyệt đối không tính toán lại DOI hay Mức cảnh báo ở SQL hay giao diện Frontend (tuân thủ DEC-04).

### 3.1. Đại lượng Đầu vào tại Ngày Chốt $C$ cho Cặp $(NM, NL)$

1. $\text{SOH}(C)$: Tồn kho thực tế lấy từ `fact_Inventory_SOH` tại ngày chốt $C$ (chỉ lấy SUB INV = 'RAW'). Nếu không có dòng, $\text{SOH}(C) = 0$ (BR-15c).
2. $\text{BlockedKg}(C)$: Tổng lượng hàng đang bị khóa hiệu lực tại $C$ từ `fact_Inventory_Block` (BR-03, BR-04).
3. $\text{ForecastKg}(M)$: Lượng dự báo nhu cầu tháng $M$ (chứa $C$) lấy từ bản ghi Forecast mới nhất có $\text{VersionDate} \le C$ (BR-14).
4. $\text{DemandOverrideKg}(M)$: Lượng nhu cầu tháng sửa tay hiệu lực tại $C$ (nếu có, theo BR-05b).
5. $\text{WipIssueMTD}(C)$: Tiêu hao sản xuất lũy kế từ ngày 1 của tháng $M$ đến $C$ từ `fact_Inventory_Movement`.
6. $\text{ActiveDays}(C)$: Số ngày chạy máy trong tháng $M$ tính đến $C$ (số ngày có Wip Issue phát sinh trong ngày $> 0$).

---

### 3.2. Chuỗi Công thức Tính Vị thế Tồn kho (Theo thứ tự)

#### Bước 1: Tính Tồn khả dụng (`availableKg`)
$$\text{availableKg} = \max(0, \text{SOH}(C) - \text{BlockedKg}(C)) \quad (\text{BR-03})$$
- Nếu $\text{BlockedKg}(C) > \text{SOH}(C)$: $\text{availableKg} = 0$ và bật cờ `BLOCKED_EXCEEDS_SOH` (BR-04a).

#### Bước 2: Xác định Nhu cầu Tháng áp dụng (`demandMonthKg`)
$$\text{demandMonthKg} = \begin{cases} \text{DemandOverrideKg}(M) & \text{nếu có ghi đè hiệu lực tại } C \text{ (BR-05a)} \\ \text{ForecastKg}(M) & \text{nếu không có số sửa tay (BR-14)} \\ 0 & \text{nếu không có cả hai} \end{cases}$$

#### Bước 3: Tính Tiêu hao Chuẩn / Ngày (`stdDailyKg`)
$$\text{stdDailyKg} = \frac{\text{demandMonthKg}}{\text{StandardMonthDays}} \quad (\text{BR-05})$$
*(Với `StandardMonthDays` lấy từ `cfg_System`, mặc định 28 ngày).*

#### Bước 4: Tính Tiêu hao Thực tế / Ngày (`actualDailyKg`)
$$\text{actualDailyKg} = \begin{cases} \frac{\text{WipIssueMTD}(C)}{\text{ActiveDays}(C)} & \text{nếu } \text{ActiveDays}(C) \ge \text{MinActiveDays (3)} \text{ (BR-06)} \\ \max(\text{Nhịp tháng này}, \text{Nhịp tháng trước}) & \text{nếu } \text{ActiveDays}(C) < 3 \text{ (BR-07)} \end{cases}$$
- **Nhịp tháng này:** $\frac{\text{WipIssueMTD}(C)}{\max(1, \text{ActiveDays}(C))}$.
- **Nhịp tháng trước:** Lấy Wip Issue MTD ngày cuối tháng trước chia cho số ngày chạy máy tháng trước.
- Khi áp dụng nhịp tháng trước $\rightarrow$ Bật cờ `PREV_MONTH_USAGE`.

#### Bước 5: Tiêu hao Dùng để Cảnh báo (`dailyKg` - Ký hiệu $d$)
$$d = \max(\text{stdDailyKg}, \text{actualDailyKg}) \quad (\text{BR-08})$$

#### Bước 6: Tính Số ngày Tồn kho (`doi`) & Ngày Hết hàng
$$\text{doi} = \begin{cases} \text{null} & \text{nếu } d = 0 \text{ (NO\_DEMAND, BR-11)} \\ \frac{\text{availableKg}}{d} & \text{nếu } d > 0 \quad (\text{BR-09}) \end{cases}$$
- **Khử sai số dấu phẩy động (BR-09a):** Giá trị `doi` bắt buộc được làm tròn **12 chữ số có nghĩa** trước khi so sánh ngưỡng hoặc lấy phần nguyên:
  $$\text{doi}_{\text{norm}} = \text{round}(\text{doi}, 12)$$
- **Ngày dự kiến hết hàng (`stockoutDate`):**
  $$\text{stockoutDate} = C + \lfloor \text{doi}_{\text{norm}} \rfloor \text{ ngày}$$

---

### 3.3. Quy tắc Phân loại Mức Cảnh báo (Level Classification - BR-10, BR-11)

Quy trình xếp mức được thực hiện tuần tự theo độ ưu tiên:

1. **`NO_DEMAND`:** Nếu $d = 0$ (Không có tiêu hao chuẩn và không có tiêu hao thực tế).
2. **`CRITICAL`:** Nếu $d > 0$ và $\text{availableKg} = 0$ (Hết hàng nhưng vẫn có nhu cầu sản xuất).
3. **`CRITICAL`:** Nếu $\text{doi}_{\text{norm}} < \text{CriticalDays}_{\text{eff}}$ (Mặc định: $\text{doi} < 7$).
4. **`WARNING`:** Nếu $\text{CriticalDays}_{\text{eff}} \le \text{doi}_{\text{norm}} < \text{WarningDays}_{\text{eff}}$ (Mặc định: $7 \le \text{doi} < 15$).
5. **`OVERSTOCK`:** Nếu $\text{doi}_{\text{norm}} > \text{OverstockThreshold}$:
   - Ngưỡng xét tồn dư thông thường: $\text{OverstockDays}_{\text{eff}}$ (Mặc định 75).
   - Ngưỡng đối với **Nguyên liệu dùng ít**: $\text{OverstockDaysLowUsage}$ (Mặc định 90).
   - **Tiêu chí xét nguyên liệu dùng ít (BR-10, Q-011):**
     $$\text{Cơ sở tiêu hao} = \max(\text{demandMonthKg}, \text{actualDailyKg} \times 28)$$
     Nếu $\text{Cơ sở tiêu hao} < \text{LowUsageKgPerMonth (1.000 kg)}$ $\rightarrow$ Áp dụng ngưỡng 90 ngày.
   - *Lưu ý:* Nếu cặp có cấu hình ghi đè `OverstockDays` riêng, giá trị ghi đè sẽ **thắng** ngưỡng dùng ít.
6. **`BALANCED`:** Trường hợp còn lại ($\text{WarningDays}_{\text{eff}} \le \text{doi}_{\text{norm}} \le \text{OverstockThreshold}$).

---

### 3.4. Danh mục Các Cờ Cảnh báo & Dữ liệu Bất thường (Flags)

Các cờ sau được tính toán độc lập để cảnh báo cho người dùng, **tuyệt đối không làm thay đổi mức cảnh báo tồn kho**:

| Mã cờ (`FlagCode`) | Điều kiện kích hoạt | Mức độ |
|---|---|:---:|
| `BLOCKED_EXCEEDS_SOH` | Lượng khóa $\text{BlockedKg}(C) > \text{SOH}(C)$ | Cảnh báo |
| `PREV_MONTH_USAGE` | Tháng này mới chạy $< 3$ ngày máy, đang mượn nhịp tiêu hao tháng trước | Thông tin |
| `FEW_ACTIVE_DAYS` | Số ngày chạy máy tháng này mới có 1 hoặc 2 ngày | Thông tin |
| `MISSING_PO_PENDING` | Ngày chốt $C$ chưa nạp được file PO Pending | Cảnh báo |
| `PO_LATE_RECEIPT` | Tồn tại ít nhất 1 dòng PO Pending có tuổi $\ge 3$ tháng và lượng còn $> 0$ (BR-19c) | Cảnh báo |
| `DEMAND_OVERRIDE` | Đang sử dụng số nhu cầu tháng do người dùng sửa tay thay cho Forecast | Thông tin |
| `FORECAST_NEWER_THAN_OVERRIDE`| Đã có bản Forecast mới nạp sau ngày áp dụng số sửa tay | Cảnh báo |
| `PAIR_NOT_IN_MASTER` | Cặp NM–NL phát sinh giao dịch nhưng không có trong `Plant Items` | Cảnh báo |
| `UNUSED_STOCK` *(mới - BR-37)*| $\text{SOH} > 0$ nhưng không có Wip Issue phát sinh trong 60 ngày qua | Cảnh báo |
| `REORDER_NEEDED` *(mới - BR-38)*| Có nhu cầu và Số ngày được bảo vệ (Cover DOI) $< 20$ ngày | Cảnh báo |
| `USAGE_DEVIATION` *(mới - BR-39)*| Tiêu hao thực tế lệch so với chuẩn $> 30\%$ (kèm ghi chú Tăng/Giảm) | Cảnh báo |
| `STALE_DATA` *(mới - BR-40)* | Ngày hôm nay trừ đi ngày chốt mới nhất $> 2$ ngày | Cảnh báo |

---

### 3.5. Mô hình Dự phóng Tồn kho 28 Ngày & Đề xuất Lịch giao (BR-34, BR-36)

Hệ thống tính toán mô phỏng lượng tồn cuối ngày cho chuỗi 28 ngày tiếp theo: $t = C+1, C+2, \dots, C+28$. Mọi ngày trong chu kỳ đều sử dụng chung mức tiêu hao ngày $d$ của ngày chốt $C$.

$$\text{tồn}(t) = \text{tồn}(t-1) + \text{về}(t) - d$$
*(với $\text{tồn}(C) = \text{availableKg}$, tồn được phép âm để phản ánh lượng thiếu hụt lũy kế).*

#### 1. Tầng 1: Đã lên lịch (Scheduled)
- Lượng hàng về $\text{về}(t)$ tại ngày $t$ gồm:
  - Kế hoạch giao hàng đã lưu trên lưới tại ngày $t$ của cặp (`fact_Delivery_Plan`).
  - Hàng đi đường điều chuyển (TO) đang đến được xếp toàn bộ về ngày $C+1$ (BR-34).

#### 2. Tầng 2: Theo đề xuất tự động (Suggested)
- Bằng Tầng 1 cộng thêm các chuyến giao hàng do thuật toán BR-36 tự động đề xuất từ nguồn PO Pending còn lại của cặp.
- **Thuật toán Đề xuất Lịch giao (BR-36):**
  - Mức an toàn cần bảo vệ: $L = d \times \text{SafetyDays}$ (với $\text{SafetyDays}$ lấy từ cấu hình cặp hoặc mặc định `CriticalDays`).
  - Duyệt tuần tự từ $t = C+1 \dots C+28$, khi phát hiện tồn cuối ngày $< L$, đánh dấu mốc cần hàng $M$.
  - Chọn ngày giao đề xuất $G$: Ngày Thứ 2 đến Thứ 7 muộn nhất trong khoảng $[C+1, M]$ (tránh Chủ nhật). Nếu không kịp, lấy ngày Thứ 2-7 đầu tiên và ghi chú "Trễ so với mốc".
  - Định mức 1 chuyến giao $U$ (BR-36a): Lấy theo `DeliveryQtyKg` của cặp $\rightarrow$ hoặc $d \times \text{DeliveryDays}$ của cặp $\rightarrow$ hoặc định mức hàng xá 30.000 kg $\rightarrow$ hoặc mặc định $d \times 7$ ngày. Làm tròn lên theo bao (`BagKg`) hoặc 1.000 kg đối với hàng xá.
  - Số chuyến giao: $k \times U$ với $k$ nhỏ nhất sao cho tồn cuối ngày duy trì $\ge L$.
  - Nguồn trừ PO Pending: Lấy theo nguyên tắc **FIFO** (PO tạo trước lấy trước).

#### 3. Ba Mốc Thời gian Quan trọng (Key Milestones - BR-34a)
1. **Mốc Hết hàng:** Ngày đầu tiên tồn rơi xuống $< 0$ (xét theo Tầng 1 hoặc Tầng 2).
2. **Mốc Cần hàng về trước:** Ngày đầu tiên tồn rơi xuống $< L$ (dưới mức an toàn).
3. **Mốc Đặt muộn nhất:** Bằng (Mốc Cần hàng về trước của Tầng 2) trừ đi $\text{LeadTimeDays}$ của Nhà cung cấp ở dòng PO gần nhất.

---

## 4. Quản lý Nhu cầu Tháng Sửa tay (Demand Override - BR-05a, BR-05b)

- Áp dụng khi Planner nắm được kế hoạch sản xuất thực tế thay đổi đột xuất so với Forecast của tháng.
- **Quy tắc ghi nhận:** Bảng `fact_Demand_Override` là bảng **chỉ thêm dòng (Append-only)**. Tuyệt đối không chỉnh sửa hay xóa các dòng lịch sử cũ.
- Khi người dùng muốn hủy bỏ số sửa tay để quay về dùng Forecast, hệ thống ghi thêm 1 dòng mới với số lượng `OverrideKg = NULL`.
- Mỗi lần sửa tay bắt buộc phải nhập trường **Lý do (Reason)** và chỉ được phép sửa cho tháng hiện tại của ngày chốt hoặc tháng kế tiếp.

---

## 5. Thiết kế Cơ sở Dữ liệu & Stored Procedures

### 5.1. Bảng `fact_Demand_Override`

```sql
CREATE TABLE dbo.fact_Demand_Override (
    OverrideID INT IDENTITY(1,1) NOT NULL,
    FactoryID INT NOT NULL,
    MaterialID INT NOT NULL,
    PeriodMonth DATE NOT NULL,          -- Ngày đầu tháng (ví dụ 2026-10-01)
    EffectiveDate DATE NOT NULL,        -- Ngày bắt đầu áp dụng
    OverrideKg DECIMAL(18,0) NULL,      -- NULL biểu thị việc HỦY BỎ số sửa tay
    Reason NVARCHAR(250) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CreatedBy NVARCHAR(50) NOT NULL,
    CONSTRAINT PK_fact_Demand_Override PRIMARY KEY CLUSTERED (OverrideID),
    CONSTRAINT FK_DemandOverride_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
    CONSTRAINT FK_DemandOverride_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
    CONSTRAINT CK_DemandOverride_Kg CHECK (OverrideKg IS NULL OR OverrideKg >= 0)
);
```

### 5.2. Stored Procedure Nạp Toàn bộ Dữ liệu Thô: `sp_Position_LoadSnapshot`

Stored procedure này trả về đồng thời 8 tập kết quả (Multi-result set) để Domain Engine xử lý:

```sql
CREATE OR ALTER PROCEDURE dbo.sp_Position_LoadSnapshot
    @SnapshotDate DATE,
    @FactoryID INT = NULL -- Nếu có thì lọc theo nhà máy của user FACTORY
AS
BEGIN
    SET NOCOUNT ON;

    -- 1. Bảng cấu hình chung & ngưỡng
    SELECT * FROM dbo.cfg_System WHERE ConfigID = 1;
    SELECT * FROM dbo.cfg_Stock_Threshold;

    -- 2. Danh mục 72 cặp theo dõi đang kích hoạt
    SELECT fm.FactoryID, f.FactoryCode, f.FactoryName,
           fm.MaterialID, m.MaterialCode, m.MaterialName, m.Category, m.ItemGroup, m.BagKg, m.DisplayDecimals
    FROM dbo.dim_Factory_Material fm
    INNER JOIN dbo.dim_Factory f ON fm.FactoryID = f.FactoryID
    INNER JOIN dbo.dim_Material m ON fm.MaterialID = m.MaterialID
    WHERE fm.IsTracked = 1 AND f.IsActive = 1 AND m.IsActive = 1
      AND (@FactoryID IS NULL OR fm.FactoryID = @FactoryID);

    -- 3. Tồn kho thực tế (SOH RAW) tại ngày chốt C
    SELECT FactoryID, MaterialID, SohQtyKg
    FROM dbo.fact_Inventory_SOH
    WHERE SnapshotDate = @SnapshotDate;

    -- 4. Lệnh khóa hàng đang có hiệu lực tại C
    SELECT FactoryID, MaterialID, BlockedKg
    FROM dbo.fact_Inventory_Block
    WHERE StartDate <= @SnapshotDate AND (EndDate IS NULL OR EndDate > @SnapshotDate);

    -- 5. Tiêu hao MTD và số ngày chạy máy
    SELECT FactoryID, MaterialID, WipIssueKg
    FROM dbo.fact_Inventory_Movement
    WHERE SnapshotDate = @SnapshotDate;

    -- 6. Dự báo Forecast mới nhất có VersionDate <= C
    -- (Lấy theo Partition Row_Number để chọn bản ghi mới nhất của tháng)
    WITH RankedForecast AS (
        SELECT FactoryID, MaterialID, ForecastKg, VersionDate,
               ROW_NUMBER() OVER(PARTITION BY FactoryID, MaterialID, PeriodMonth ORDER BY VersionDate DESC) AS rn
        FROM dbo.fact_Demand_Forecast
        WHERE VersionDate <= CAST(@SnapshotDate AS DATETIME2)
          AND PeriodMonth = DATEFROMPARTS(YEAR(@SnapshotDate), MONTH(@SnapshotDate), 1)
    )
    SELECT FactoryID, MaterialID, ForecastKg, VersionDate
    FROM RankedForecast WHERE rn = 1;

    -- 7. Nhu cầu tháng sửa tay hiệu lực tại C
    WITH RankedOverride AS (
        SELECT FactoryID, MaterialID, OverrideKg, CreatedAt,
               ROW_NUMBER() OVER(PARTITION BY FactoryID, MaterialID, PeriodMonth ORDER BY EffectiveDate DESC, CreatedAt DESC) AS rn
        FROM dbo.fact_Demand_Override
        WHERE EffectiveDate <= @SnapshotDate
          AND PeriodMonth = DATEFROMPARTS(YEAR(@SnapshotDate), MONTH(@SnapshotDate), 1)
    )
    SELECT FactoryID, MaterialID, OverrideKg
    FROM RankedOverride WHERE rn = 1;

    -- 8. PO Pending bản C & Hàng điều chuyển TO
    SELECT FactoryID, MaterialID, PONumber, DeliveryDate, DeliverRemainderKg, VendorAccount
    FROM dbo.fact_PO_Pending
    WHERE SnapshotDate = @SnapshotDate AND DeliverRemainderKg > 0;

    SELECT ToFactoryID AS FactoryID, MaterialID, ShippedQtyKg, ShippedDate
    FROM dbo.fact_Internal_Transfer
    WHERE TransferStatus <> 'Created' 
      AND ShippedDate <= @SnapshotDate 
      AND (ReceivedDate IS NULL OR ReceivedDate > @SnapshotDate);
END;
```

---

## 6. Đặc tả API RESTful Module F04

| Phương thức | Đường dẫn API | Quyền | Mô tả |
|---|---|---|---|
| `GET` | `/api/v1/positions` | `position.view` | Lấy danh sách vị thế tồn kho tại ngày chốt $C$ (phân trang, lọc, tìm kiếm) |
| `GET` | `/api/v1/positions/snapshot-dates` | `position.view` | Lấy danh sách các ngày chốt đã có dữ liệu |
| `GET` | `/api/v1/positions/:factoryId/:materialId` | `position.view` | Lấy chi tiết cặp: PO, TO, Block, Lịch sử tiêu hao, Ngưỡng áp dụng |
| `GET` | `/api/v1/positions/:factoryId/:materialId/projection`| `position.view` | Lấy chi tiết chuỗi dữ liệu dự phóng 28 ngày (Tầng 1 & Tầng 2) |
| `POST`| `/api/v1/positions/demand-override` | `demand-override.edit` | Thiết lập nhu cầu tháng sửa tay |
| `DELETE`| `/api/v1/positions/demand-override` | `demand-override.edit` | Hủy bỏ nhu cầu tháng sửa tay (dùng lại Forecast) |

### Tham số Query API `GET /api/v1/positions`:
- `snapshotDate`: Ngày chốt xem báo cáo (mặc định lấy ngày chốt mới nhất).
- `factoryId`: Lọc theo nhà máy.
- `category`: Lọc theo Category nguyên liệu.
- `itemGroup`: Lọc theo Phân nhóm (`Premix` / `Ngoài premix`).
- `level`: Lọc theo Mức cảnh báo (`CRITICAL`, `WARNING`, `BALANCED`, `OVERSTOCK`, `NO_DEMAND`).
- `flag`: Lọc theo mã cờ dữ liệu (`PO_LATE_RECEIPT`, `REORDER_NEEDED`, v.v.).
- `search`: Tìm kiếm theo mã hoặc tên nguyên liệu.
- `page`, `pageSize`: Phân trang chuẩn (`10`, `20`, `50`, `all`).
- `sort`, `order`: Sắp xếp theo `doi`, `materialCode`, `availableKg`, `level`.

---

## 7. Đặc tả Giao diện Người dùng (UI/UX)

- **Màn hình Bảng Vị thế Tồn kho (`/positions`):**
  - **Thanh tiêu đề:** Dropdown chọn Ngày chốt $C$, Badge trạng thái nạp dữ liệu, Thanh báo "Dữ liệu cũ" (màu cam) nếu $C$ quá 2 ngày.
  - **Thanh bộ lọc đa năng:** Lọc Nhà máy, Category, Nhóm, Mức cảnh báo, Cờ dữ liệu, Ô tìm kiếm từ khóa.
  - **Tùy chọn hiển thị cột:** 2 chế độ: **Gọn** (Mức, Cặp, SOH, Khả dụng, Tiêu hao ngày, DOI, Cảnh báo) và **Đầy đủ** (Bổ sung thêm Dự báo tháng, Đi đường, PO về, Cover DOI, Ngày hết hàng).
  - **Bảng dữ liệu:**
    - Cột đầu cố định (Freeze Column): Badge Mức cảnh báo (màu + icon) + Mã NM + Mã & Tên NL.
    - Màu sắc dòng/badge: CRITICAL (Đỏ đậm), WARNING (Vàng cam), BALANCED (Xanh lá), OVERSTOCK (Tím), NO_DEMAND (Xám tro).
    - Cột DOI hiển thị 1 số lẻ (ví dụ: `6.5 ngày`), có chấm vàng cảnh báo nếu cặp có cờ bất thường.
  - **Phân trang:** Chân bảng hỗ trợ chuyển trang và chọn số dòng (`10`, `20`, `50`, `Tất cả`).
  - **Drawer / Modal Chi tiết Cặp:** Khi bấm vào 1 dòng, mở Drawer chi tiết từ bên phải hiển thị:
    - Tab 1: Thành phần tồn kho & Bảng kê các dòng PO Pending (tô đỏ dòng trễ tuổi), TO đi đường, Phiếu nhận sau $C$.
    - Tab 2: Nhu cầu tháng (Số Forecast, Form sửa tay, Nút "Dùng lại Forecast mới").
    - Tab 3: Biểu đồ & Bảng dự phóng 28 ngày (2 tầng, đường kẻ đỏ mốc an toàn, ô âm tô đỏ).

---

## 8. Kiểm toán & Nhật ký (Audit Log)

1. `DEMAND_OVERRIDE_CREATE`: Ghi nhận người dùng thiết lập số nhu cầu tháng sửa tay (kèm lý do và số kg).
2. `DEMAND_OVERRIDE_REMOVE`: Ghi nhận người dùng hủy bỏ số sửa tay để quay về dùng Forecast.
