# TỔNG QUAN HỆ THỐNG & QUY CHUẨN KỸ THUẬT PREMIXTRACK

> **Tài liệu đặc tả kiến trúc, công nghệ và quy chuẩn dùng chung**  
> **Dự án:** PremixTrack – Hệ thống theo dõi tồn kho và đặt hàng nguyên liệu premix cho thức ăn gia súc  
> **Phiên bản:** 1.0 · **Ngày lập:** 12/10/2026  
> **Tiêu chuẩn tuân thủ:** `.skill/Architechture.md`, `.skill/skill.md`, `DAC-TA-NGHIEP-VU-PREMIXTRACK.md`

---

## 1. Bối cảnh, Mục tiêu & Phạm vi Dự án

### 1.1. Bối cảnh Nghiệp vụ
Doanh nghiệp sản xuất thức ăn gia súc vận hành nhiều nhà máy (6 nhà máy tiêu chuẩn: DN, BD, VL2, HG, BD1, BD2). Việc theo dõi tồn kho và lập kế hoạch mua sắm/giao hàng nguyên liệu premix hiện phụ thuộc vào việc tổng hợp thủ công nhiều báo cáo Excel xuất từ hệ thống ERP Microsoft Dynamics 365 (D365). Quy trình thủ công này gây mất nhiều thời gian, dễ nhầm lẫn và khó phát hiện kịp thời nguy cơ thiếu hụt nguyên liệu (ngừng máy) hoặc tồn trữ vượt mức an toàn (ứ đọng vốn, rủi ro hết hạn).

### 1.2. Mục tiêu Hệ thống
- **Tự động hóa nạp và kiểm tra dữ liệu:** Đọc và thẩm định bộ 5 file giao dịch ERP mỗi ngày chốt (Cut-off 06h ngày D, ngày chốt $C = D - 1$), file Master Data và file Forecast (RM Usage).
- **Tính toán vị thế tồn kho tự động & tập trung:** Xác định chính xác số ngày tồn kho (DOI), tồn khả dụng, ngày dự kiến hết hàng và phân loại 4 mức cảnh báo (CRITICAL, WARNING, BALANCED, OVERSTOCK) cùng trạng thái không có nhu cầu (NO_DEMAND).
- **Hỗ trợ điều hành & ra quyết định:** Cung cấp Bảng điều khiển (Dashboard) trực quan, Lưới lập kế hoạch giao hàng tuần đối chiếu thực nhận từ PO Receipt (POR), và cơ chế Gợi ý mua hàng / Xuất phiếu đề nghị mua hàng (Purchase Request).
- **Kiểm soát chặt chẽ:** Phân quyền động (RBAC) theo chức năng và phạm vi nhà máy, hỗ trợ chặn tồn thủ công (khóa hàng chờ kiểm nghiệm), ghi nhật ký kiểm toán (Audit Log) toàn diện.

### 1.3. Phạm vi Hệ thống (Scope)
- **Hệ thống xử lý:** 6 nhà máy, 26 nguyên liệu premix/ngoài premix, 72 cặp Nhà máy – Nguyên liệu (Plant Items) được theo dõi.
- **Đơn vị đo lường:** Toàn bộ lưu trữ và tính toán bằng đơn vị **kg (nguyên)**. Riêng màn hình lưới kế hoạch giao hàng hiển thị và nhập liệu bằng **tấn** (tối đa 3 chữ số thập phân, quy đổi sang kg nguyên khi lưu trữ).
- **Phi tiền tệ:** Hệ thống **không** lưu trữ, tính toán hoặc hiển thị giá tiền, doanh thu hay chi phí nguyên liệu.
- **Tích hợp:** Nạp dữ liệu gián tiếp qua file Excel từ ERP D365 (không kết nối API trực tiếp vào D365).

---

## 2. Kiến trúc Kỹ thuật Chuẩn (Standard Architecture)

Tuân thủ nghiêm ngặt theo `.skill/Architechture.md` và `.skill/skill.md`:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER (NestJS Controllers)              │
│  - RESTful API (/api/v1/...)                                           │
│  - ValidationPipe (DTOs)                                               │
│  - AuthGuard & RolesGuard (Server-side RBAC + Factory Scope Check)     │
│  - ResponseTransformInterceptor ({ success, message, data, meta })    │
│  - HttpExceptionFilter                                                 │
│  - Swagger / OpenAPI Decorators                                        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                  APPLICATION LAYER (Use Cases / Services)              │
│  - Single Responsibility: Mỗi Use Case là 1 Service / Method công khai │
│  - Transaction Orchestration (QueryRunner)                             │
│  - Phân trang, lọc, sắp xếp dữ liệu sau tính toán                      │
│  - Audit Logging Trigger                                               │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
┌───────────────────▼──────────────┐   ┌─────────────▼──────────────────┐
│          DOMAIN LAYER            │   │      INFRASTRUCTURE LAYER      │
│  - Pure TypeScript Functions     │   │  - TypeORM Repositories        │
│  - 100% Core Business Logic:     │   │  - Stored Procedures Caller    │
│    + calculatePosition.ts        │   │    (sp_<Module>_<Action>)      │
│    + actualUsage.ts              │   │  - Table-Valued Parameters     │
│    + projectStock.ts             │   │    (TVP) for bulk insert       │
│    + suggestDeliveries.ts        │   │  - Excel Parsers (Stream-based)│
│    + thresholdRules.ts           │   │  - MS SQL Server 2019          │
│  - Hoàn toàn độc lập Framework   │   │  - TypeORM Entities            │
│  - Deterministic Unit Tests      │   │    (synchronize: false)        │
└──────────────────────────────────┘   └────────────────────────────────┘
```

### 2.1. Quy tắc Tách tầng (Clean Architecture)
1. **Domain Layer:** Chứa toàn bộ công thức toán học và quy tắc nghiệp vụ cốt lõi (DOI, mức cảnh báo, phân loại dùng ít, dự phóng 28 ngày, thuật toán đề xuất lịch giao, đối chiếu POR). Domain là hàm thuần (Pure Functions), **tuyệt đối không** import NestJS, TypeORM hay bất kỳ thư viện I/O nào.
2. **Application Layer:** Điều phối luồng xử lý (Use Cases). Gọi Infrastructure lấy dữ liệu, đưa vào Domain tính toán, thực hiện phân trang/lọc, ghi nhật ký Audit Log và lưu trữ kết quả.
3. **Infrastructure Layer:** Quản lý kết nối Database MS SQL Server 2019 qua TypeORM. Mọi thao tác ghi/đọc dữ liệu phức tạp **bắt buộc gọi qua Stored Procedures**. Quản lý bộ đọc file Excel ở server.
4. **Presentation Layer:** Controller NestJS tiếp nhận HTTP Request, xác thực token phiên, phân quyền (Role & Factory Scope Guard), kiểm tra dữ liệu bằng DTO (`class-validator`), trả dữ liệu qua Response Envelope Interceptor chuẩn.

---

## 3. Quy chuẩn Cơ sở Dữ liệu & Stored Procedures

### 3.1. Quy ước Thiết kế Database (MS SQL Server 2019)
- **Collation:** `Vietnamese_100_CI_AS_SC_UTF8`.
- **Chế độ cô lập:** `READ_COMMITTED_SNAPSHOT ON` (RCSI) để tránh xung đột đọc/ghi.
- **Khóa chính:** Khóa số tự tăng `INT IDENTITY(1,1)` hoặc `BIGINT IDENTITY(1,1)`.
- **Khóa nghiệp vụ:** Đặt ràng buộc `UNIQUE` (ví dụ `FactoryCode`, `MaterialCode`, `SupplierCode`).
- **Khóa khi đọc-rồi-ghi đồng thời:** Bắt buộc sử dụng gợi ý khóa `WITH (UPDLOCK, HOLDLOCK)` trong transaction đối với các tác vụ kiểm tra hạn mức rồi chèn (khóa tồn, cấp mã đề nghị mua).
- **Kiểu dữ liệu số lượng:** `DECIMAL(18,0)` tương ứng số nguyên kg. Tên cột kết thúc bằng `*QtyKg`.
- **Thời gian:** `DATETIME2(0)` lưu theo giờ chuẩn quốc tế UTC (`SYSUTCDATETIME()`). Múi giờ ứng dụng quy định qua biến môi trường `APP_TIMEZONE` (mặc định `Asia/Ho_Chi_Minh`).
- **Không lưu dữ liệu tính toán:** Tuyệt đối không lưu các trường phát sinh (Tồn khả dụng, DOI, Mức cảnh báo, Ngày hết hàng) vào database (tuân thủ BR-13); các giá trị này luôn được tính toán động tại thời điểm truy vấn.

### 3.2. Quy chuẩn Stored Procedure (Bắt buộc theo `.skill/skill.md`)
Mọi thao tác thay đổi dữ liệu (Insert, Update, Delete) và các truy vấn tổng hợp phức tạp **bắt buộc** viết dưới dạng Stored Procedure theo cấu trúc chuẩn:

```sql
CREATE OR ALTER PROCEDURE dbo.sp_<Module>_<Action>
    @Param1 INT,
    @Param2 NVARCHAR(100),
    @UpdatedBy NVARCHAR(50),
    @TvData dbo.tvp_<TypeName> READONLY -- Dùng TVP khi nạp nhiều dòng
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON; -- Tự động rollback khi gặp run-time error

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Validate điều kiện nghiệp vụ với gợi ý khóa nếu cần
        -- 2. Thao tác dữ liệu (Insert / Update / Delete)
        -- 3. Ghi log kiểm toán vào sys_Audit_Log (nếu thao tác quan trọng)

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Log và ném lỗi rõ ràng cho tầng ứng dụng
        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END;
```

---

## 4. Danh mục 24 Bảng CSDL Toàn cục

| Nhóm bảng | Tên bảng CSDL | Khóa nghiệp vụ | Mục đích sử dụng |
|---|---|---|---|
| **Danh mục (dim_)** | `dim_Factory` | `FactoryCode`, `WarehouseCode` | Danh mục 6 nhà máy & mã kho |
| | `dim_Material` | `MaterialCode` | Danh mục 26 nguyên liệu, phân loại, bao bì |
| | `dim_Supplier` | `SupplierCode` | Danh mục 14 nhà cung cấp, lead time |
| | `dim_Factory_Material` | `(FactoryID, MaterialID)` | 72 cặp theo dõi (Plant Items), cờ `IsTracked` |
| | `dim_Material_Substitution` | `(MaterialID, SubMaterialID)` | Nguyên liệu thay thế (lưu trữ sẵn, chưa kích hoạt) |
| **Cấu hình (cfg_)** | `cfg_System` | `ConfigID = 1` | 1 dòng cấu hình chung 16 tham số toàn hệ thống |
| | `cfg_Stock_Threshold` | `(FactoryID, MaterialID)` | Ngưỡng tồn kho và định mức giao theo từng cặp |
| **Dữ liệu nạp (fact_)** | `fact_Inventory_SOH` | `(SnapshotDate, FactoryID, MaterialID)` | Tồn kho thực tế (SOH RAW) theo ngày chốt |
| | `fact_Inventory_Movement` | `(SnapshotDate, FactoryID, MaterialID)` | Lũy kế nhập xuất tiêu hao (MTD Wip Issue) |
| | `fact_PO_Pending` | `(SnapshotDate, PONumber, MaterialID, DeliveryDate)` | Đơn mua hàng mở & hợp đồng khung (Deliver remainder) |
| | `fact_Demand_Forecast` | `(PeriodMonth, VersionDate, FactoryID, MaterialID)` | Dự báo nhu cầu nguyên liệu theo tháng/version |
| | `fact_PO_Receipt` | `(ReceiptNumber, MaterialID)` | Phiếu thực nhận hàng từ NCC (POR) |
| | `fact_Internal_Transfer` | `(TransferNumber, MaterialID)` | Lệnh điều chuyển nội bộ giữa các nhà máy (TO) |
| **Giao dịch người dùng** | `fact_Inventory_Block` | `BlockID` | Lệnh khóa hàng thủ công (chặn tồn) |
| | `fact_Delivery_Plan` | `(PlanDate, FactoryID, MaterialID, SupplierID, PONumber)` | Kế hoạch nhận hàng tuần chi tiết theo ngày |
| | `fact_Purchase_Request` | `RequestCode` | Đề nghị mua hàng (mã PR duy nhất) |
| | `fact_Demand_Override` | `OverrideID` (Insert-only) | Lịch sử ghi đè nhu cầu tháng sửa tay |
| **Hệ thống & Kiểm toán** | `sys_User` | `Username` | Tài khoản người dùng |
| | `sys_User_Factory` | `(UserID, FactoryID)` | Gán phạm vi nhà máy cho tài khoản FACTORY |
| | `sys_Role` | `RoleCode` | Danh mục vai trò người dùng (ADMIN, PLANNER, ...) |
| | `sys_Role_Permission` | `(RoleCode, PermissionCode)` | Ma trận 27 quyền động theo vai trò |
| | `sys_Import_Batch` | `BatchID` | Lịch sử các lần tải file lên hệ thống |
| | `sys_Data_Quality_Issue` | `IssueID` | Cảnh báo sai lệch kiểm chéo khi nạp file |
| | `sys_Audit_Log` | `LogID` | Nhật ký kiểm toán thao tác hệ thống (Audit Trail) |

---

## 5. Quy chuẩn RESTful API & Gói phản hồi

### 5.1. Định dạng Phản hồi Chuẩn (Response Envelope)
Mọi API trả về định dạng JSON thống nhất qua `ResponseTransformInterceptor`:

#### Phản hồi thành công (Success Response):
```json
{
  "success": true,
  "message": "Thao tác thành công",
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 72,
    "totalPages": 4
  }
}
```
*(Ghi chú: Trường `meta` bắt buộc xuất hiện trong tất cả các API danh sách có phân trang).*

#### Phản hồi lỗi (Error Response):
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Dữ liệu đầu vào không hợp lệ",
    "details": [
      {
        "field": "blockedKg",
        "issue": "Số lượng khóa phải lớn hơn 0"
      }
    ]
  }
}
```

### 5.2. Quy chuẩn Phân trang, Lọc, Sắp xếp & Tìm kiếm (GV-08 & `.skill/skill.md`)
Áp dụng trên **tất cả** các API và giao diện quản lý danh sách:
- **Phân trang (`page`, `pageSize`):** Hỗ trợ các kích thước trang chuẩn: `10`, `20`, `50`, hoặc `all` (lấy tất cả).
- **Sắp xếp (`sort`, `order`):** `sort` chỉ định tên trường (ví dụ `doi`, `materialCode`, `createdAt`); `order` nhận giá trị `asc` hoặc `desc`.
- **Tìm kiếm (`search`):** Tìm kiếm chuỗi (hỗ trợ tiếng Việt không dấu/có dấu trên mã và tên).
- **Bộ lọc riêng (`filter`):** Theo Nhà máy (`factoryId`), Nhóm nguyên liệu (`category`, `group`), Mức cảnh báo (`level`), Trạng thái (`status`), v.v.

---

## 6. Bản đồ Module & Phụ thuộc Nghiệp vụ

```
                       ┌────────────────────────┐
                       │ F01 Xác thực & Quyền   │
                       └───────────┬────────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │ F02 Danh mục & Cấu hình│
                       └───────────┬────────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │   F03 Nạp dữ liệu ERP   │
                       └───────────┬────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│F06 Tồn bị khóa   │     │F04 Vị thế & Báo  │     │F07 Kế hoạch giao │
│(Chặn tồn)        │────►│động (Lõi Engine) │◄────│hàng tuần         │
└──────────────────┘     └────────┬─────────┘     └──────────────────┘
                                  │                         │
                                  ├─────────────────────────┤
                                  ▼                         ▼
                         ┌──────────────────┐     ┌──────────────────┐
                         │F05 Dashboard     │     │F08 Đề nghị mua   │
                         │Tổng quan         │     │hàng (PR)         │
                         └──────────────────┘     └──────────────────┘
                                  ▲
                                  │
                       ┌────────────────────────┐
                       │F09 Hệ thống & Kiểm toán│
                       └────────────────────────┘
```

---

## 7. Danh sách Tài liệu Đặc tả Chi tiết từng Module

Hệ thống được chia nhỏ thành 9 file tài liệu đặc tả chuyên sâu:

1. [F01-XAC-THUC-TAI-KHOAN-PHAN-QUYEN.md](file:///c:/Premix_GE/docs/modules/F01-XAC-THUC-TAI-KHOAN-PHAN-QUYEN.md): Quản lý phiên, xác thực, danh mục tài khoản, gán nhà máy và ma trận phân quyền động 27 quyền.
2. [F02-DANH-MUC-VA-CAU-HINH.md](file:///c:/Premix_GE/docs/modules/F02-DANH-MUC-VA-CAU-HINH.md): Quản lý Master Data (chỉ đọc), tham số hệ thống `cfg_System`, cấu hình ngưỡng tồn kho `cfg_Stock_Threshold`.
3. [F03-NAP-DU-LIEU-ERP-FORECAST.md](file:///c:/Premix_GE/docs/modules/F03-NAP-DU-LIEU-ERP-FORECAST.md): Quy trình nạp bộ 5 file ERP, Master Data, Forecast, kiểm tra cấp dòng/file và kiểm chéo BR-15d.
4. [F04-VI-THE-TON-KHO-VA-CANH-BAO.md](file:///c:/Premix_GE/docs/modules/F04-VI-THE-TON-KHO-VA-CANH-BAO.md): Lõi thuật toán tính vị thế, 4 mức cảnh báo, nhu cầu sửa tay, dự phóng 28 ngày và đề xuất giao hàng.
5. [F05-BANG-DIEU-KHIEN-TONG-QUAN.md](file:///c:/Premix_GE/docs/modules/F05-BANG-DIEU-KHIEN-TONG-QUAN.md): Bảng điều khiển giám sát, ma trận nhiệt NM × NL, thẻ chỉ số và điều hướng thông minh.
6. [F06-QUAN-LY-TON-BI-KHOA.md](file:///c:/Premix_GE/docs/modules/F06-QUAN-LY-TON-BI-KHOA.md): Nghiệp vụ chặn tồn (khóa/mở khóa), kiểm tra hạn mức an toàn trong transaction CSDL.
7. [F07-KE-HOACH-GIAO-HANG.md](file:///c:/Premix_GE/docs/modules/F07-KE-HOACH-GIAO-HANG.md): Lập lịch giao hàng tuần theo ngày (tấn), đối chiếu phiếu nhận hàng thực tế và đề xuất lịch nháp.
8. [F08-DE-NGHI-MUA-HANG.md](file:///c:/Premix_GE/docs/modules/F08-DE-NGHI-MUA-HANG.md): Thuật toán gợi ý mua hàng, vòng đời trạng thái đề xuất, xuất file Excel cho bộ phận thu mua.
9. [F09-HE-THONG-KIEM-TOAN-VA-VAN-HANH.md](file:///c:/Premix_GE/docs/modules/F09-HE-THONG-KIEM-TOAN-VA-VAN-HANH.md): Ghi nhận nhật ký thao tác `sys_Audit_Log`, API Swagger, cơ chế giám sát sức khỏe và quy trình vận hành.
