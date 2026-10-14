-- ============================================================================
-- PHÂN HỆ F01c: QUẢN LÝ VAI TRÒ & PHÂN QUYỀN (ROLES & PERMISSIONS PROCEDURES)
-- File: database/stored_procedures/14_role_procedures.sql
-- Quy tắc áp dụng:
--   - Default Deny & Kiểm tra người thực hiện (CurrentUserID, CurrentUsername)
--   - Bảo vệ vai trò hệ thống cốt lõi (IsSystem = 1, ADMIN luôn toàn quyền scope ALL)
--   - Nhật ký kiểm toán GV-09: Tự động ghi dbo.sys_Audit_Log cho mọi thao tác
--   - Danh mục 27 mã quyền chuẩn hóa kèm UTF-8 tiếng Việt
-- ============================================================================

USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- ============================================================================
-- 1. dbo.usp_Role_List: Lấy danh sách toàn bộ vai trò và thống kê
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Role_List
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        r.RoleCode,
        r.RoleName,
        r.Description,
        r.FactoryScope,
        r.IsSystem,
        r.CreatedAt,
        r.UpdatedAt,
        (SELECT COUNT(1) FROM dbo.sys_User u WHERE u.RoleCode = r.RoleCode) AS UserCount,
        (SELECT COUNT(1) FROM dbo.sys_Role_Permission rp WHERE rp.RoleCode = r.RoleCode) AS PermissionCount
    FROM dbo.sys_Role r
    ORDER BY r.IsSystem DESC, r.RoleCode ASC;
END;
GO

-- ============================================================================
-- 2. dbo.usp_Role_GetByCode: Lấy chi tiết vai trò và danh sách quyền
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Role_GetByCode
    @RoleCode VARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON;

    SET @RoleCode = UPPER(LTRIM(RTRIM(@RoleCode)));

    -- Kết quả 1: Thông tin cơ bản của vai trò
    SELECT 
        r.RoleCode,
        r.RoleName,
        r.Description,
        r.FactoryScope,
        r.IsSystem,
        r.CreatedAt,
        r.UpdatedAt,
        (SELECT COUNT(1) FROM dbo.sys_User u WHERE u.RoleCode = r.RoleCode) AS UserCount,
        (SELECT COUNT(1) FROM dbo.sys_Role_Permission rp WHERE rp.RoleCode = r.RoleCode) AS PermissionCount
    FROM dbo.sys_Role r
    WHERE r.RoleCode = @RoleCode;

    -- Kết quả 2: Danh sách mã quyền đã cấp
    SELECT rp.PermissionCode
    FROM dbo.sys_Role_Permission rp
    WHERE rp.RoleCode = @RoleCode
    ORDER BY rp.PermissionCode ASC;
END;
GO

-- ============================================================================
-- 3. dbo.usp_Role_Create: Tạo mới vai trò tùy biến (IsSystem = 0) & Audit GV-09
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Role_Create
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @RoleCode VARCHAR(30),
    @RoleName NVARCHAR(100),
    @Description NVARCHAR(255) = NULL,
    @FactoryScope VARCHAR(10) = 'ALL',
    @PermissionsJson NVARCHAR(MAX) = NULL,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra người thực hiện (Default Deny)
        DECLARE @CallerRoleCode VARCHAR(30) = NULL;
        SELECT @CallerRoleCode = RoleCode
        FROM dbo.sys_User
        WHERE UserID = @CurrentUserID AND IsActive = 1;

        IF @CallerRoleCode IS NULL
        BEGIN
            THROW 50401, N'[50401] Người thực hiện không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        -- 2. Chuẩn hóa & kiểm tra trường dữ liệu
        SET @RoleCode = UPPER(LTRIM(RTRIM(@RoleCode)));

        IF @RoleCode IS NULL OR LEN(@RoleCode) = 0
        BEGIN
            THROW 50400, N'[50400] Mã vai trò không được để trống.', 1;
        END

        IF @RoleName IS NULL OR LEN(LTRIM(RTRIM(@RoleName))) = 0
        BEGIN
            THROW 50400, N'[50400] Tên vai trò không được để trống.', 1;
        END

        IF @FactoryScope NOT IN ('ALL', 'ASSIGNED')
        BEGIN
            THROW 50400, N'[50400] Phạm vi nhà máy không hợp lệ (chỉ chấp nhận ALL hoặc ASSIGNED).', 1;
        END

        BEGIN TRANSACTION;

        -- 3. Kiểm tra trùng mã vai trò
        IF EXISTS (SELECT 1 FROM dbo.sys_Role WITH (UPDLOCK, HOLDLOCK) WHERE RoleCode = @RoleCode)
        BEGIN
            THROW 50409, N'[50409] Mã vai trò đã tồn tại trong hệ thống.', 1;
        END

        -- 4. Thêm vai trò mới (luôn IsSystem = 0 cho vai trò tạo tùy biến)
        INSERT INTO dbo.sys_Role (
            RoleCode, RoleName, Description, FactoryScope, IsSystem, CreatedAt, UpdatedAt
        )
        VALUES (
            @RoleCode, @RoleName, @Description, @FactoryScope, 0, SYSUTCDATETIME(), SYSUTCDATETIME()
        );

        -- 5. Thêm danh sách quyền nếu có
        IF @PermissionsJson IS NOT NULL AND ISJSON(@PermissionsJson) = 1
        BEGIN
            INSERT INTO dbo.sys_Role_Permission (RoleCode, PermissionCode, CreatedAt)
            SELECT DISTINCT 
                @RoleCode, 
                LTRIM(RTRIM(value)), 
                SYSUTCDATETIME()
            FROM OPENJSON(@PermissionsJson)
            WHERE LTRIM(RTRIM(value)) <> '';
        END

        -- 6. Ghi Audit Log (GV-09)
        DECLARE @AuditNewValues NVARCHAR(MAX) = (
            SELECT 
                @RoleCode AS roleCode,
                @RoleName AS roleName,
                @Description AS description,
                @FactoryScope AS factoryScope,
                @PermissionsJson AS permissions
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'ROLE_CREATE', 'sys_Role',
            @RoleCode, @IPAddress, NULL, @AuditNewValues, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        -- Trả về thông tin vừa tạo
        SELECT 
            RoleCode, RoleName, Description, FactoryScope, IsSystem, CreatedAt, UpdatedAt
        FROM dbo.sys_Role
        WHERE RoleCode = @RoleCode;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 4. dbo.usp_Role_Update: Cập nhật thông tin vai trò & Audit GV-09
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Role_Update
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @RoleCode VARCHAR(30),
    @RoleName NVARCHAR(100),
    @Description NVARCHAR(255) = NULL,
    @FactoryScope VARCHAR(10) = 'ALL',
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra người thực hiện (Default Deny)
        DECLARE @CallerRoleCode VARCHAR(30) = NULL;
        SELECT @CallerRoleCode = RoleCode
        FROM dbo.sys_User
        WHERE UserID = @CurrentUserID AND IsActive = 1;

        IF @CallerRoleCode IS NULL
        BEGIN
            THROW 50401, N'[50401] Người thực hiện không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        SET @RoleCode = UPPER(LTRIM(RTRIM(@RoleCode)));

        IF @FactoryScope NOT IN ('ALL', 'ASSIGNED')
        BEGIN
            THROW 50400, N'[50400] Phạm vi nhà máy không hợp lệ (chỉ chấp nhận ALL hoặc ASSIGNED).', 1;
        END

        BEGIN TRANSACTION;

        -- 2. Kiểm tra tồn tại
        DECLARE @IsSystem BIT;
        DECLARE @OldRoleName NVARCHAR(100);
        DECLARE @OldDescription NVARCHAR(255);
        DECLARE @OldFactoryScope VARCHAR(10);

        SELECT 
            @IsSystem = IsSystem,
            @OldRoleName = RoleName,
            @OldDescription = Description,
            @OldFactoryScope = FactoryScope
        FROM dbo.sys_Role WITH (UPDLOCK, HOLDLOCK)
        WHERE RoleCode = @RoleCode;

        IF @IsSystem IS NULL
        BEGIN
            THROW 50404, N'[50404] Vai trò không tồn tại trong hệ thống.', 1;
        END

        -- 3. Bảo vệ vai trò hệ thống ADMIN
        IF @RoleCode = 'ADMIN' AND @FactoryScope <> 'ALL'
        BEGIN
            THROW 50400, N'[50400] Vai trò ADMIN bắt buộc phải có phạm vi toàn hệ thống (ALL).', 1;
        END

        -- 4. Thu thập OldValues để ghi Audit
        DECLARE @AuditOldValues NVARCHAR(MAX) = (
            SELECT 
                @RoleCode AS roleCode,
                @OldRoleName AS roleName,
                @OldDescription AS description,
                @OldFactoryScope AS factoryScope
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- 5. Cập nhật
        UPDATE dbo.sys_Role
        SET 
            RoleName = @RoleName,
            Description = @Description,
            FactoryScope = CASE WHEN @RoleCode = 'ADMIN' THEN 'ALL' ELSE @FactoryScope END,
            UpdatedAt = SYSUTCDATETIME()
        WHERE RoleCode = @RoleCode;

        -- 6. Thu thập NewValues & Ghi Audit Log (GV-09)
        DECLARE @AuditNewValues NVARCHAR(MAX) = (
            SELECT 
                @RoleCode AS roleCode,
                @RoleName AS roleName,
                @Description AS description,
                CASE WHEN @RoleCode = 'ADMIN' THEN 'ALL' ELSE @FactoryScope END AS factoryScope
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'ROLE_UPDATE', 'sys_Role',
            @RoleCode, @IPAddress, @AuditOldValues, @AuditNewValues, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        -- Trả về kết quả
        SELECT 
            RoleCode, RoleName, Description, FactoryScope, IsSystem, CreatedAt, UpdatedAt
        FROM dbo.sys_Role
        WHERE RoleCode = @RoleCode;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 5. dbo.usp_Role_Delete: Xóa vai trò tùy biến & Audit GV-09
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Role_Delete
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @RoleCode VARCHAR(30),
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra người thực hiện (Default Deny)
        DECLARE @CallerRoleCode VARCHAR(30) = NULL;
        SELECT @CallerRoleCode = RoleCode
        FROM dbo.sys_User
        WHERE UserID = @CurrentUserID AND IsActive = 1;

        IF @CallerRoleCode IS NULL
        BEGIN
            THROW 50401, N'[50401] Người thực hiện không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        SET @RoleCode = UPPER(LTRIM(RTRIM(@RoleCode)));

        BEGIN TRANSACTION;

        -- 2. Kiểm tra tồn tại và IsSystem
        DECLARE @IsSystem BIT;
        DECLARE @OldRoleName NVARCHAR(100);

        SELECT 
            @IsSystem = IsSystem,
            @OldRoleName = RoleName
        FROM dbo.sys_Role WITH (UPDLOCK, HOLDLOCK)
        WHERE RoleCode = @RoleCode;

        IF @IsSystem IS NULL
        BEGIN
            THROW 50404, N'[50404] Vai trò không tồn tại trong hệ thống.', 1;
        END

        -- Chặn xóa vai trò hệ thống mặc định (IsSystem = 1)
        IF @IsSystem = 1 OR @RoleCode IN ('ADMIN', 'PLANNER', 'FACTORY', 'VIEWER')
        BEGIN
            THROW 50403, N'[50403] Không thể xóa vai trò hệ thống mặc định (IsSystem = 1).', 1;
        END

        -- 3. Chặn xóa nếu còn người dùng gán vai trò này
        IF EXISTS (SELECT 1 FROM dbo.sys_User WHERE RoleCode = @RoleCode)
        BEGIN
            THROW 50409, N'[50409] Không thể xóa vai trò đang được gán cho người dùng trong hệ thống.', 1;
        END

        -- 4. Thu thập OldValues để ghi Audit
        DECLARE @AuditOldValues NVARCHAR(MAX) = (
            SELECT 
                @RoleCode AS roleCode,
                @OldRoleName AS roleName
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- 5. Xóa ma trận quyền liên kết và xóa vai trò
        DELETE FROM dbo.sys_Role_Permission WHERE RoleCode = @RoleCode;
        DELETE FROM dbo.sys_Role WHERE RoleCode = @RoleCode;

        -- 6. Ghi Audit Log (GV-09)
        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'ROLE_DELETE', 'sys_Role',
            @RoleCode, @IPAddress, @AuditOldValues, NULL, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        SELECT 1 AS Success;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 6. dbo.usp_Role_GetPermissionsCatalog: Danh mục 27 mã quyền chuẩn kèm phân nhóm
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Role_GetPermissionsCatalog
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        PermissionCode,
        PermissionName,
        ModuleCode,
        ModuleName,
        Description,
        SortOrder
    FROM (
        VALUES
        -- 1. Dashboard
        ('dashboard.view', N'Xem Tổng quan hệ thống', 'DASHBOARD', N'Tổng quan & KPI', N'Xem chỉ số KPI tổng thể và ma trận nhiệt 6 nhà máy', 1),

        -- 2. Vị thế
        ('position.view', N'Xem Vị thế tồn kho', 'POSITIONS', N'Vị thế tồn kho & Cảnh báo', N'Xem tồn khả dụng, DOI, dự phóng và chi tiết lô hàng', 2),
        ('demand-override.edit', N'Sửa tay Nhu cầu tháng', 'POSITIONS', N'Vị thế tồn kho & Cảnh báo', N'Ghi đè số nhu cầu tháng (Demand Override) và quản lý cờ bất thường', 3),

        -- 3. Nạp dữ liệu
        ('import.view', N'Xem Lịch sử nạp dữ liệu', 'IMPORT', N'Nạp dữ liệu ERP & Forecast', N'Xem lịch sử các đợt nạp file Master Data và ERP', 4),
        ('import.run', N'Thực thi Nạp dữ liệu ERP', 'IMPORT', N'Nạp dữ liệu ERP & Forecast', N'Tải lên và nạp bộ 5 file ERP ngày chốt và Forecast', 5),

        -- 4. Danh mục Master Data
        ('catalog.view', N'Xem Danh mục Master Data', 'CATALOG', N'Danh mục Master Data', N'Xem danh mục Nhà máy, Nguyên liệu, NCC và Cặp theo dõi', 6),
        ('material.edit', N'Quản lý Nguyên liệu', 'CATALOG', N'Danh mục Master Data', N'Thêm, sửa thông tin danh mục nguyên liệu', 7),
        ('supplier.edit', N'Quản lý Nhà cung cấp', 'CATALOG', N'Danh mục Master Data', N'Cập nhật Lead Time, thông tin nhà cung cấp', 8),
        ('factory-material.edit', N'Quản lý Cặp theo dõi', 'CATALOG', N'Danh mục Master Data', N'Bật/tắt theo dõi và gán NCC chính cho cặp NM-NL', 9),
        ('threshold.edit', N'Cấu hình Ngưỡng theo cặp', 'CATALOG', N'Danh mục Master Data', N'Cấu hình ngưỡng an toàn và định mức giao theo cặp (BR-12)', 10),
        ('system-config.edit', N'Cấu hình Tham số hệ thống', 'CATALOG', N'Danh mục Master Data', N'Cập nhật cấu hình chung toàn hệ thống (cfg_System)', 11),

        -- 5. Tồn bị khóa
        ('block.view', N'Xem Danh sách Tồn bị khóa', 'BLOCKS', N'Quản lý Tồn bị khóa', N'Xem chi tiết các lệnh chặn/khóa tồn kho và tỷ lệ vượt trần', 12),
        ('block.create', N'Tạo Lệnh chặn tồn kho', 'BLOCKS', N'Quản lý Tồn bị khóa', N'Tạo lệnh khóa tồn theo lô hoặc toàn bộ kho', 13),
        ('block.release', N'Mở khóa Tồn kho', 'BLOCKS', N'Quản lý Tồn bị khóa', N'Giải phóng tồn bị khóa trở lại tồn khả dụng SOH', 14),

        -- 6. Kế hoạch giao hàng
        ('delivery-plan.view', N'Xem Kế hoạch giao hàng', 'DELIVERY_PLAN', N'Kế hoạch giao hàng tuần', N'Xem lưới tuần, lịch giao và đối chiếu thực nhận POR', 15),
        ('delivery-plan.edit', N'Biên tập Kế hoạch giao', 'DELIVERY_PLAN', N'Kế hoạch giao hàng tuần', N'Thêm, sửa chuyến giao hàng, chọn PO và lưu lưới tuần', 16),

        -- 7. Đề nghị mua hàng (PR)
        ('purchase-request.view', N'Xem Đề nghị mua hàng (PR)', 'PURCHASE_REQUEST', N'Đề nghị mua hàng (PR)', N'Xem danh sách PR, gợi ý mua và phân tích nhu cầu', 17),
        ('purchase-request.create', N'Tạo Đề nghị mua hàng', 'PURCHASE_REQUEST', N'Đề nghị mua hàng (PR)', N'Tạo PR thủ công hoặc chuyển từ gợi ý mua tự động', 18),
        ('purchase-request.status', N'Duyệt / Chuyển trạng thái PR', 'PURCHASE_REQUEST', N'Đề nghị mua hàng (PR)', N'Chuyển trạng thái PR (SENT, MATCHED, EXPIRED, CANCELLED)', 19),
        ('purchase-request.export', N'Xuất Excel Đề nghị mua', 'PURCHASE_REQUEST', N'Đề nghị mua hàng (PR)', N'Xuất báo cáo PR dạng bảng tính Excel chuẩn ERP', 20),

        -- 8. Người dùng & Vai trò
        ('user.view', N'Xem Danh sách Người dùng', 'USERS_ROLES', N'Quản trị Người dùng & Phân quyền', N'Xem danh sách tài khoản, hồ sơ và nhật ký kiểm toán Audit', 21),
        ('user.create', N'Tạo mới Người dùng', 'USERS_ROLES', N'Quản trị Người dùng & Phân quyền', N'Tạo tài khoản người dùng mới và phân quyền ban đầu', 22),
        ('user.update', N'Cập nhật Người dùng', 'USERS_ROLES', N'Quản trị Người dùng & Phân quyền', N'Chỉnh sửa thông tin, đặt lại mật khẩu và gán nhà máy', 23),
        ('user.delete', N'Xóa Người dùng', 'USERS_ROLES', N'Quản trị Người dùng & Phân quyền', N'Xóa tài khoản người dùng chưa phát sinh giao dịch', 24),
        ('role.view', N'Xem Danh mục Vai trò & Quyền', 'USERS_ROLES', N'Quản trị Người dùng & Phân quyền', N'Xem danh sách vai trò và ma trận 27 mã quyền', 25),
        ('role.manage', N'Quản lý Vai trò & Ma trận quyền', 'USERS_ROLES', N'Quản trị Người dùng & Phân quyền', N'Tạo/sửa/xóa vai trò và cập nhật ma trận phân quyền', 26),

        -- 9. Tài liệu API
        ('api-docs.view', N'Xem Tài liệu API Swagger', 'SYSTEM', N'Hệ thống & Tích hợp', N'Truy cập tài liệu OpenAPI / Swagger API Docs', 27)
    ) AS P (PermissionCode, PermissionName, ModuleCode, ModuleName, Description, SortOrder)
    ORDER BY SortOrder ASC;
END;
GO

-- ============================================================================
-- 7. dbo.usp_Role_SetPermissions: Cập nhật ma trận quyền cho vai trò & Audit GV-09
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Role_SetPermissions
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @RoleCode VARCHAR(30),
    @PermissionsJson NVARCHAR(MAX),
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra người thực hiện (Default Deny)
        DECLARE @CallerRoleCode VARCHAR(30) = NULL;
        SELECT @CallerRoleCode = RoleCode
        FROM dbo.sys_User
        WHERE UserID = @CurrentUserID AND IsActive = 1;

        IF @CallerRoleCode IS NULL
        BEGIN
            THROW 50401, N'[50401] Người thực hiện không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        SET @RoleCode = UPPER(LTRIM(RTRIM(@RoleCode)));

        BEGIN TRANSACTION;

        -- 2. Kiểm tra tồn tại
        IF NOT EXISTS (SELECT 1 FROM dbo.sys_Role WITH (UPDLOCK, HOLDLOCK) WHERE RoleCode = @RoleCode)
        BEGIN
            THROW 50404, N'[50404] Vai trò không tồn tại trong hệ thống.', 1;
        END

        -- 3. Chặn can thiệp quyền của ADMIN hệ thống
        IF @RoleCode = 'ADMIN'
        BEGIN
            THROW 50403, N'[50403] Không được phép tùy biến quyền của vai trò ADMIN hệ thống.', 1;
        END

        -- 4. Thu thập danh sách quyền cũ (OldValues)
        DECLARE @AuditOldValues NVARCHAR(MAX) = (
            SELECT STRING_AGG(PermissionCode, ',')
            FROM dbo.sys_Role_Permission
            WHERE RoleCode = @RoleCode
        );

        -- 5. Xóa các quyền hiện tại của vai trò
        DELETE FROM dbo.sys_Role_Permission WHERE RoleCode = @RoleCode;

        -- 6. Chèn danh sách quyền mới từ JSON
        IF @PermissionsJson IS NOT NULL AND ISJSON(@PermissionsJson) = 1
        BEGIN
            INSERT INTO dbo.sys_Role_Permission (RoleCode, PermissionCode, CreatedAt)
            SELECT DISTINCT 
                @RoleCode, 
                LTRIM(RTRIM(value)), 
                SYSUTCDATETIME()
            FROM OPENJSON(@PermissionsJson)
            WHERE LTRIM(RTRIM(value)) <> '';
        END

        -- 7. Cập nhật UpdatedAt của vai trò
        UPDATE dbo.sys_Role
        SET UpdatedAt = SYSUTCDATETIME()
        WHERE RoleCode = @RoleCode;

        -- 8. Ghi Audit Log (GV-09)
        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'ROLE_SET_PERMISSIONS', 'sys_Role_Permission',
            @RoleCode, @IPAddress, @AuditOldValues, @PermissionsJson, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        -- Trả về danh sách quyền vừa được cập nhật
        SELECT rp.PermissionCode
        FROM dbo.sys_Role_Permission rp
        WHERE rp.RoleCode = @RoleCode
        ORDER BY rp.PermissionCode ASC;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
