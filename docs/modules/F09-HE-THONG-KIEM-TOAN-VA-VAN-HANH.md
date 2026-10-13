# ĐẶC TẢ CHI TIẾT MODULE F09: HỆ THỐNG, KIỂM TOÁN & VẬN HÀNH

> **Mã phân hệ:** F09 (Hạ tầng hệ thống & Vận hành)  
> **Tên module:** System Infrastructure, Audit Logging, API Documentation & Operations  
> **Mức độ ưu tiên:** Should Have (S)  
> **Tiêu chuẩn kỹ thuật:** Clean Architecture, TypeORM `synchronize: false`, Audit Logging Interceptor, NestJS Swagger OpenAPI 3.0.3, Health Monitoring

---

## 1. Mục tiêu & Phạm vi Nghiệp vụ

### 1.1. Mục tiêu
- Cung cấp nền tảng hạ tầng kỹ thuật vững chắc, an toàn và dễ bảo trì cho toàn bộ các module nghiệp vụ của hệ thống PremixTrack.
- Đảm bảo tính minh bạch và truy vết tối đa (Accountability & Auditability) thông qua cơ chế ghi nhận nhật ký kiểm toán (Audit Trail) tự động cho toàn bộ các hành vi ghi/sửa/xóa dữ liệu quan trọng.
- Chuẩn hóa tài liệu hóa giao diện lập trình ứng dụng (API Documentation) theo chuẩn OpenAPI 3.0.3 phục vụ phát triển Frontend và kiểm thử.
- Cung cấp cơ chế tự giám sát sức khỏe dịch vụ (Health Check), quản lý múi giờ thống nhất và quy trình vận hành, sao lưu dự phòng CSDL.

### 1.2. Phạm vi Chức năng
- **Nhật ký Kiểm toán Hệ thống (`sys_Audit_Log`):** Ghi nhận vết kiểm toán có cấu trúc; giao diện tra cứu nhật ký phân trang dành riêng cho Quản trị viên (ADMIN).
- **Tài liệu API Swagger (`/api/docs`):** Tự động sinh từ các Decorator và DTO của NestJS; bảo vệ bằng quyền `api-docs.view`.
- **Kiểm tra Sức khỏe Dịch vụ (`/api/v1/health`):** Endpoint giám sát trạng thái kết nối Cơ sở dữ liệu MS SQL Server, mức chiếm dụng bộ nhớ RAM và thời gian hoạt động liên tục (Uptime).
- **Hạ tầng Bảo mật & Múi giờ:** Middleware HTTP Request Logger, Interceptor đóng gói Response, Exception Filter chuẩn hóa lỗi, cơ chế đồng bộ múi giờ quốc tế UTC và giờ hiển thị Việt Nam (`Asia/Ho_Chi_Minh`).

---

## 2. Ma trận Phân quyền Module F09

| Mã quyền (`PermissionCode`) | Hành động được phép | ADMIN | PLANNER | FACTORY | VIEWER |
|---|---|:---:|:---:|:---:|:---:|
| Không cần mã (Public) | Kiểm tra sức khỏe dịch vụ (`GET /api/v1/health`) | ✓ | ✓ | ✓ | ✓ |
| `api-docs.view` | Truy cập trang tài liệu Swagger UI (`/api/docs`) | ✓ | | | |
| `user.view` / Quản trị | Xem danh sách nhật ký kiểm toán hệ thống (`sys_Audit_Log`) | ✓ | | | |

---

## 3. Quy chuẩn Kỹ thuật Nền tảng (Technical Standards)

### 3.1. Quản lý Múi giờ & Thời gian (BR-Timezone & DEC-19)
- **Lưu trữ CSDL:** Toàn bộ các cột mốc thời gian (`CreatedAt`, `UpdatedAt`, `ImportedAt`, `Timestamp`) trong SQL Server bắt buộc lưu theo kiểu `DATETIME2(0)` với giá trị **giờ chuẩn quốc tế UTC** (`SYSUTCDATETIME()`).
- **Múi giờ Ứng dụng:** Backend NestJS định nghĩa biến môi trường `APP_TIMEZONE` (mặc định: `Asia/Ho_Chi_Minh`, UTC+7).
- **Hàm "Hôm nay" duy nhất:** Tầng Domain và Application **tuyệt đối không gọi trực tiếp `new Date()`** của máy chủ mà bắt buộc gọi qua hàm tiện ích chuẩn `getAppToday()` để xác định ngày thực tế theo giờ Việt Nam. Mọi phép tính toán vị thế của Domain nhận ngày chốt $C$ làm tham số đầu vào độc lập, không phụ thuộc giờ máy chủ.

### 3.2. Cấu hình TypeORM & Cơ chế Migration (GV-02, GV-04)
- Thuộc tính `synchronize` trong TypeORM **bắt buộc cấu hình là `false`** trên mọi môi trường (kể cả Local Dev). Tuyệt đối không cho phép TypeORM tự động đồng bộ thay đổi bảng làm lệch cấu trúc chuẩn đã thiết kế.
- Mọi thay đổi schema CSDL trong quá trình phát triển bắt buộc được thực hiện thông qua script Migration đánh số thứ tự trong thư mục `database/migrations/` và cập nhật đồng thời sơ đồ ERD.

### 3.3. HTTP Access Logging & Error Handling (GV-07, GV-10)
- **Access Logging:** Mọi HTTP Request được ghi nhận tự động vào console/log stream theo định dạng chuẩn:
  `[TIMESTAMP] [METHOD] [URL] [STATUS_CODE] [DURATION_MS] - [IP] - [USER_ID]`
- **Bảo mật phản hồi lỗi:** Khi gặp lỗi hệ thống nội bộ (HTTP 500), Exception Filter bắt buộc che giấu toàn bộ chi tiết câu lệnh SQL, stack trace hoặc tên bảng CSDL, chỉ trả về mã lỗi chung: `INTERNAL_SERVER_ERROR`.

---

## 4. Thiết kế Cơ sở Dữ liệu & Stored Procedures Module Kiểm toán

### 4.1. Bảng `sys_Audit_Log`

```sql
CREATE TABLE dbo.sys_Audit_Log (
    LogID BIGINT IDENTITY(1,1) NOT NULL,
    Timestamp DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    UserID INT NULL,
    Username NVARCHAR(50) NOT NULL,
    ActionCode VARCHAR(50) NOT NULL,      -- Ví dụ: 'USER_CREATE', 'BLOCK_CREATE', 'CONFIG_UPDATE'
    TargetEntity VARCHAR(50) NOT NULL,    -- Ví dụ: 'User', 'Block', 'Threshold', 'Config'
    TargetID NVARCHAR(100) NULL,          -- Khóa của bản ghi bị tác động
    IPAddress VARCHAR(45) NULL,
    OldValues NVARCHAR(MAX) NULL,         -- JSON thể hiện dữ liệu trước khi sửa (nếu có)
    NewValues NVARCHAR(MAX) NULL,         -- JSON thể hiện dữ liệu sau khi sửa
    Status VARCHAR(10) NOT NULL DEFAULT 'SUCCESS', -- 'SUCCESS' hoặc 'FAILED'
    ErrorMessage NVARCHAR(500) NULL,
    CONSTRAINT PK_sys_Audit_Log PRIMARY KEY CLUSTERED (LogID)
);

CREATE NONCLUSTERED INDEX IX_sys_Audit_Log_Query
ON dbo.sys_Audit_Log (Timestamp DESC, ActionCode, Username);
```

### 4.2. Stored Procedures Chuẩn

#### 1. `sp_Audit_Write` (Ghi nhận nhật ký kiểm toán)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_Audit_Write
    @UserID INT = NULL,
    @Username NVARCHAR(50),
    @ActionCode VARCHAR(50),
    @TargetEntity VARCHAR(50),
    @TargetID NVARCHAR(100) = NULL,
    @IPAddress VARCHAR(45) = NULL,
    @OldValues NVARCHAR(MAX) = NULL,
    @NewValues NVARCHAR(MAX) = NULL,
    @Status VARCHAR(10) = 'SUCCESS',
    @ErrorMessage NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    INSERT INTO dbo.sys_Audit_Log (
        Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID,
        IPAddress, OldValues, NewValues, Status, ErrorMessage
    )
    VALUES (
        SYSUTCDATETIME(), @UserID, @Username, @ActionCode, @TargetEntity, @TargetID,
        @IPAddress, @OldValues, @NewValues, @Status, @ErrorMessage
    );
END;
```

#### 2. `sp_Audit_List` (Phân trang, lọc, tìm kiếm nhật ký dành cho Quản trị viên)
```sql
CREATE OR ALTER PROCEDURE dbo.sp_Audit_List
    @Search NVARCHAR(100) = NULL,
    @ActionCode VARCHAR(50) = NULL,
    @Username NVARCHAR(50) = NULL,
    @FromDate DATETIME2(0) = NULL,
    @ToDate DATETIME2(0) = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortOrder NVARCHAR(4) = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    WITH FilteredLogs AS (
        SELECT 
            LogID,
            Timestamp,
            UserID,
            Username,
            ActionCode,
            TargetEntity,
            TargetID,
            IPAddress,
            OldValues,
            NewValues,
            Status,
            ErrorMessage,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.sys_Audit_Log
        WHERE (@Search IS NULL OR Username LIKE '%' + @Search + '%' OR TargetID LIKE '%' + @Search + '%' OR ActionCode LIKE '%' + @Search + '%')
          AND (@ActionCode IS NULL OR ActionCode = @ActionCode)
          AND (@Username IS NULL OR Username = @Username)
          AND (@FromDate IS NULL OR Timestamp >= @FromDate)
          AND (@ToDate IS NULL OR Timestamp <= @ToDate)
    )
    SELECT *
    FROM FilteredLogs
    ORDER BY 
        CASE WHEN @SortOrder = 'ASC' THEN Timestamp END ASC,
        CASE WHEN @SortOrder = 'DESC' THEN Timestamp END DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
```

---

## 5. Đặc tả API RESTful Module F09

| Phương thức | Đường dẫn API | Quyền | Mô tả chức năng |
|---|---|---|---|
| `GET` | `/api/v1/health` | Public | Giám sát trạng thái hoạt động dịch vụ & CSDL |
| `GET` | `/api/docs` | `api-docs.view` | Trang tài liệu OpenAPI Swagger UI |
| `GET` | `/api/v1/audit-logs` | `user.view` (ADMIN) | Danh sách nhật ký kiểm toán (phân trang, lọc, tìm kiếm) |
| `GET` | `/api/v1/audit-logs/:id`| `user.view` (ADMIN) | Chi tiết một bản ghi kiểm toán kèm Diff JSON |

### Response Mẫu của `GET /api/v1/health`:
```json
{
  "success": true,
  "message": "Dịch vụ hoạt động bình thường",
  "data": {
    "status": "UP",
    "timestamp": "2026-10-12T16:30:00Z",
    "uptimeSeconds": 86400,
    "database": {
      "status": "CONNECTED",
      "type": "mssql",
      "responseTimeMs": 5
    },
    "memory": {
      "rssMb": 128.5,
      "heapUsedMb": 64.2
    },
    "appTimezone": "Asia/Ho_Chi_Minh"
  }
}
```

---

## 6. Đặc tả Giao diện Tra cứu Kiểm toán (UI/UX)

- **Màn hình Nhật ký Kiểm toán (`/admin/audit-logs`):**
  - **Thanh bộ lọc:** Dropdown lọc Mã hành động (`AUTH_*`, `USER_*`, `BLOCK_*`, `CONFIG_*`), Ô tìm kiếm theo Tên người thực hiện hoặc ID đối tượng, Bộ chọn khoảng thời gian (Từ ngày - Đến ngày).
  - **Bảng dữ liệu phân trang:** Hỗ trợ kích thước trang `10`, `20`, `50`, `Tất cả`.
  - **Các cột:** Thời điểm (định dạng `dd/MM/yyyy HH:mm:ss`), Người thực hiện, Địa chỉ IP, Hành động, Đối tượng tác động, Trạng thái (Thành công / Thất bại).
  - **Modal Chi tiết Bản ghi:** Hiển thị giao diện trực quan so sánh dữ liệu trước và sau (Diff Viewer) dạng JSON có tô màu cú pháp (Syntax highlighting), giúp quản trị viên dễ dàng phát hiện các thông tin bị thay đổi.

---

## 7. Quy trình Vận hành & Sao lưu Dự phòng (Operations & Backup)

- **Chiến lược Sao lưu Cơ sở Dữ liệu:**
  - Sao lưu toàn bộ (Full Backup): Chạy định kỳ vào 00:00 mỗi Chủ nhật.
  - Sao lưu chênh lệch (Differential Backup): Chạy vào 00:00 các ngày từ Thứ 2 đến Thứ 7.
  - Bản sao lưu được nén và mã hóa, lưu trữ tại thư mục an toàn ngoài ổ đĩa ứng dụng.
- **Quy trình Phục hồi (Rollback / Disaster Recovery):**
  - Khi có sự cố lỗi dữ liệu hoặc thao tác nạp file sai sót nghiêm trọng: Quản trị viên tiến hành khôi phục CSDL về điểm snapshot gần nhất trước thời điểm phát sinh lỗi.
