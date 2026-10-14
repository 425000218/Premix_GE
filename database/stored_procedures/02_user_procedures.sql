-- ============================================================================
-- PHÂN HỆ F01b: QUẢN LÝ NGƯỜI DÙNG & TÀI KHOẢN (USER PROCEDURES)
-- File: database/stored_procedures/02_user_procedures.sql
-- Quy tắc áp dụng:
--   - Default Deny & Kiểm tra người thực hiện (CurrentUserID, CurrentUsername)
--   - Kiểm soát quyền A7: Cấm tự nâng quyền, chỉ ADMIN mới gán được quyền ADMIN
--   - Chống orphan lock-out: Bảo vệ tài khoản Quản trị viên (ADMIN) cuối cùng
--   - Nhật ký kiểm toán GV-09: Tự động ghi dbo.sys_Audit_Log cho mọi thao tác
--   - Hỗ trợ đầy đủ tiếng Việt UTF-8 (chạy với sqlcmd -f 65001)
-- ============================================================================

USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- ============================================================================
-- 1. dbo.usp_User_List: Lấy danh sách người dùng phân trang, tìm kiếm, lọc
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_List
    @Search NVARCHAR(100) = NULL,
    @RoleCode VARCHAR(30) = NULL,
    @IsActive BIT = NULL,
    @FactoryID INT = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'CreatedAt',
    @SortOrder NVARCHAR(4) = 'DESC',
    @CurrentUserID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    WITH UserData AS (
        SELECT 
            u.UserID,
            u.Username,
            u.FullName,
            u.Email,
            u.RoleCode,
            r.RoleName,
            r.FactoryScope,
            u.IsActive,
            u.CreatedAt,
            u.UpdatedAt,
            -- Danh sách mã nhà máy gán nối chuỗi
            (
                SELECT STRING_AGG(f.FactoryCode, ', ') WITHIN GROUP (ORDER BY f.FactoryCode)
                FROM dbo.sys_User_Factory uf
                INNER JOIN dbo.dim_Factory f ON uf.FactoryID = f.FactoryID
                WHERE uf.UserID = u.UserID
            ) AS AssignedFactoryCodes,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.sys_User u
        INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
        WHERE (@Search IS NULL OR u.Username LIKE '%' + @Search + '%' OR u.FullName LIKE '%' + @Search + '%' OR u.Email LIKE '%' + @Search + '%')
          AND (@RoleCode IS NULL OR u.RoleCode = @RoleCode)
          AND (@IsActive IS NULL OR u.IsActive = @IsActive)
          AND (@FactoryID IS NULL OR EXISTS (
                SELECT 1 FROM dbo.sys_User_Factory uf WHERE uf.UserID = u.UserID AND uf.FactoryID = @FactoryID
              ) OR r.FactoryScope = 'ALL')
    )
    SELECT *
    FROM UserData
    ORDER BY 
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'Username' THEN Username END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'Username' THEN Username END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'FullName' THEN FullName END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'FullName' THEN FullName END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'CreatedAt' THEN CreatedAt END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'CreatedAt' THEN CreatedAt END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'UserID' THEN UserID END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'UserID' THEN UserID END DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
GO

-- ============================================================================
-- 2. dbo.usp_User_GetById: Lấy chi tiết 1 người dùng kèm danh sách nhà máy
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_GetById
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Tập 1: Thông tin User
    SELECT 
        u.UserID,
        u.Username,
        u.FullName,
        u.Email,
        u.RoleCode,
        r.RoleName,
        r.FactoryScope,
        u.IsActive,
        u.CreatedAt,
        u.UpdatedAt
    FROM dbo.sys_User u
    INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
    WHERE u.UserID = @UserID;

    -- Tập 2: Danh sách nhà máy được phân công
    SELECT 
        uf.FactoryID,
        f.FactoryCode,
        f.FactoryName
    FROM dbo.sys_User_Factory uf
    INNER JOIN dbo.dim_Factory f ON uf.FactoryID = f.FactoryID
    WHERE uf.UserID = @UserID
    ORDER BY f.FactoryCode;
END;
GO

-- ============================================================================
-- 3. dbo.usp_User_Create: Tạo tài khoản mới, kiểm tra quyền A7, ghi Audit GV-09
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_Create
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @Username NVARCHAR(50),
    @PasswordHash NVARCHAR(255),
    @FullName NVARCHAR(100),
    @Email NVARCHAR(100) = NULL,
    @RoleCode VARCHAR(30),
    @FactoryIdsJson NVARCHAR(MAX) = NULL,
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

        -- 2. Kiểm tra quy tắc A7: Chỉ Quản trị viên (ADMIN) mới có quyền tạo user có vai trò ADMIN
        IF @RoleCode = 'ADMIN' AND @CallerRoleCode <> 'ADMIN'
        BEGIN
            THROW 50403, N'[50403] Quy tắc A7: Chỉ Quản trị viên (ADMIN) mới có quyền tạo tài khoản có vai trò Quản trị viên.', 1;
        END

        -- 3. Chuẩn hóa & kiểm tra trường dữ liệu
        SET @Username = LTRIM(RTRIM(@Username));
        IF @Username IS NULL OR LEN(@Username) = 0
        BEGIN
            THROW 50400, N'[50400] Tên đăng nhập không được để trống.', 1;
        END

        IF @FullName IS NULL OR LEN(LTRIM(RTRIM(@FullName))) = 0
        BEGIN
            THROW 50400, N'[50400] Họ và tên không được để trống.', 1;
        END

        -- 4. Kiểm tra vai trò đích
        DECLARE @Scope VARCHAR(10) = NULL;
        SELECT @Scope = FactoryScope FROM dbo.sys_Role WHERE RoleCode = @RoleCode;
        IF @Scope IS NULL
        BEGIN
            THROW 50400, N'[50400] Mã vai trò không hợp lệ trong hệ thống.', 1;
        END

        -- 5. Bắt buộc nhà máy nếu scope = ASSIGNED (BR-02b)
        DECLARE @FactoryCount INT = 0;
        IF @FactoryIdsJson IS NOT NULL AND ISJSON(@FactoryIdsJson) = 1
        BEGIN
            SELECT @FactoryCount = COUNT(*) FROM OPENJSON(@FactoryIdsJson);
        END

        IF @Scope = 'ASSIGNED' AND @FactoryCount = 0
        BEGIN
            THROW 50400, N'[50400] Vai trò phạm vi ASSIGNED bắt buộc phải gán ít nhất một nhà máy.', 1;
        END

        BEGIN TRANSACTION;

        -- 6. Kiểm tra trùng Username
        IF EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE Username = @Username)
        BEGIN
            THROW 50409, N'[50409] Tên đăng nhập đã tồn tại trong hệ thống.', 1;
        END

        -- 7. Kiểm tra trùng Email
        IF @Email IS NOT NULL AND LTRIM(RTRIM(@Email)) <> ''
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE Email = @Email)
            BEGIN
                THROW 50409, N'[50409] Email đã được sử dụng bởi tài khoản khác.', 1;
            END
        END

        -- 8. Chèn người dùng mới
        INSERT INTO dbo.sys_User (
            Username, PasswordHash, FullName, Email, RoleCode, IsActive, CreatedAt, UpdatedAt
        )
        VALUES (
            @Username, @PasswordHash, @FullName, NULLIF(LTRIM(RTRIM(@Email)), ''), @RoleCode, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
        );

        DECLARE @NewUserID INT = SCOPE_IDENTITY();

        -- 9. Gán nhà máy nếu scope = ASSIGNED
        IF @Scope = 'ASSIGNED' AND @FactoryCount > 0
        BEGIN
            INSERT INTO dbo.sys_User_Factory (UserID, FactoryID, CreatedAt)
            SELECT @NewUserID, CAST(value AS INT), SYSUTCDATETIME()
            FROM OPENJSON(@FactoryIdsJson)
            WHERE TRY_CAST(value AS INT) IS NOT NULL
              AND EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = CAST(value AS INT));
        END

        -- 10. Ghi nhật ký kiểm toán (GV-09)
        DECLARE @AuditNewValues NVARCHAR(MAX) = (
            SELECT 
                @NewUserID AS userId,
                @Username AS username,
                @FullName AS fullName,
                @Email AS email,
                @RoleCode AS roleCode,
                @Scope AS factoryScope,
                @FactoryIdsJson AS factoryIds
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'USER_CREATE', 'sys_User',
            CAST(@NewUserID AS NVARCHAR(100)), @IPAddress, NULL, @AuditNewValues, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        SELECT @NewUserID AS NewUserID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 4. dbo.usp_User_Update: Sửa thông tin tài khoản, kiểm tra quy tắc A7 & Audit
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_Update
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @UserID INT,
    @FullName NVARCHAR(100),
    @Email NVARCHAR(100) = NULL,
    @RoleCode VARCHAR(30),
    @IsActive BIT,
    @FactoryIdsJson NVARCHAR(MAX) = NULL,
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

        -- 2. Kiểm tra tồn tại người dùng mục tiêu
        DECLARE @TargetUsername NVARCHAR(50);
        DECLARE @TargetRoleCode VARCHAR(30);
        DECLARE @TargetIsActive BIT;
        DECLARE @TargetFullName NVARCHAR(100);
        DECLARE @TargetEmail NVARCHAR(100);

        SELECT 
            @TargetUsername = Username,
            @TargetRoleCode = RoleCode,
            @TargetIsActive = IsActive,
            @TargetFullName = FullName,
            @TargetEmail = Email
        FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK)
        WHERE UserID = @UserID;

        IF @TargetUsername IS NULL
        BEGIN
            THROW 50404, N'[50404] Người dùng cần cập nhật không tồn tại trong hệ thống.', 1;
        END

        -- 3. Quy tắc A7: Cấm người dùng tự thay đổi vai trò của chính mình
        IF @CurrentUserID = @UserID AND @RoleCode <> @TargetRoleCode
        BEGIN
            THROW 50403, N'[50403] Quy tắc A7: Người dùng không được phép tự thay đổi vai trò của chính mình.', 1;
        END

        -- 4. Quy tắc A7: Người không phải ADMIN không được gán quyền ADMIN cho người khác
        IF @RoleCode = 'ADMIN' AND @CallerRoleCode <> 'ADMIN'
        BEGIN
            THROW 50403, N'[50403] Quy tắc A7: Chỉ Quản trị viên (ADMIN) mới có quyền phân quyền vai trò Quản trị viên cho người khác.', 1;
        END

        -- 5. Chặn tự khóa chính mình
        IF @CurrentUserID = @UserID AND @IsActive = 0
        BEGIN
            THROW 50403, N'[50403] Bạn không thể tự vô hiệu hóa tài khoản của chính mình khi đang đăng nhập.', 1;
        END

        -- 6. Bảo vệ Quản trị viên (ADMIN) cuối cùng của hệ thống (Chống orphan lockout)
        IF @TargetRoleCode = 'ADMIN' AND (@IsActive = 0 OR @RoleCode <> 'ADMIN')
        BEGIN
            DECLARE @ActiveAdminCount INT = 0;
            SELECT @ActiveAdminCount = COUNT(1)
            FROM dbo.sys_User
            WHERE RoleCode = 'ADMIN' AND IsActive = 1 AND UserID <> @UserID;

            IF @ActiveAdminCount = 0
            BEGIN
                THROW 50403, N'[50403] Không thể vô hiệu hóa hoặc hạ quyền tài khoản Quản trị viên (ADMIN) hoạt động cuối cùng của hệ thống.', 1;
            END
        END

        -- 7. Kiểm tra vai trò mới
        DECLARE @Scope VARCHAR(10) = NULL;
        SELECT @Scope = FactoryScope FROM dbo.sys_Role WHERE RoleCode = @RoleCode;
        IF @Scope IS NULL
        BEGIN
            THROW 50400, N'[50400] Mã vai trò không hợp lệ trong hệ thống.', 1;
        END

        -- 8. Kiểm tra ràng buộc nhà máy nếu scope = ASSIGNED (BR-02b)
        DECLARE @FactoryCount INT = 0;
        IF @FactoryIdsJson IS NOT NULL AND ISJSON(@FactoryIdsJson) = 1
        BEGIN
            SELECT @FactoryCount = COUNT(*) FROM OPENJSON(@FactoryIdsJson);
        END

        IF @Scope = 'ASSIGNED' AND @FactoryCount = 0
        BEGIN
            THROW 50400, N'[50400] Vai trò phạm vi ASSIGNED bắt buộc phải gán ít nhất một nhà máy.', 1;
        END

        BEGIN TRANSACTION;

        -- 9. Kiểm tra trùng Email với tài khoản khác
        IF @Email IS NOT NULL AND LTRIM(RTRIM(@Email)) <> ''
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE Email = @Email AND UserID <> @UserID)
            BEGIN
                THROW 50409, N'[50409] Email đã được sử dụng bởi tài khoản khác.', 1;
            END
        END

        -- 10. Thu thập OldValues để ghi Audit Log
        DECLARE @AuditOldValues NVARCHAR(MAX) = (
            SELECT 
                @UserID AS userId,
                @TargetUsername AS username,
                @TargetFullName AS fullName,
                @TargetEmail AS email,
                @TargetRoleCode AS roleCode,
                @TargetIsActive AS isActive
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- 11. Cập nhật thông tin User
        UPDATE dbo.sys_User
        SET FullName = @FullName,
            Email = NULLIF(LTRIM(RTRIM(@Email)), ''),
            RoleCode = @RoleCode,
            IsActive = @IsActive,
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserID = @UserID;

        -- 12. Cập nhật gán nhà máy
        IF @Scope = 'ALL'
        BEGIN
            DELETE FROM dbo.sys_User_Factory WHERE UserID = @UserID;
        END
        ELSE IF @Scope = 'ASSIGNED'
        BEGIN
            DELETE FROM dbo.sys_User_Factory WHERE UserID = @UserID;

            IF @FactoryIdsJson IS NOT NULL AND ISJSON(@FactoryIdsJson) = 1
            BEGIN
                INSERT INTO dbo.sys_User_Factory (UserID, FactoryID, CreatedAt)
                SELECT @UserID, CAST(value AS INT), SYSUTCDATETIME()
                FROM OPENJSON(@FactoryIdsJson)
                WHERE TRY_CAST(value AS INT) IS NOT NULL
                  AND EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = CAST(value AS INT));
            END
        END

        -- 13. Thu thập NewValues và Ghi Audit Log (GV-09)
        DECLARE @AuditNewValues NVARCHAR(MAX) = (
            SELECT 
                @UserID AS userId,
                @FullName AS fullName,
                @Email AS email,
                @RoleCode AS roleCode,
                @IsActive AS isActive,
                @Scope AS factoryScope,
                @FactoryIdsJson AS factoryIds
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'USER_UPDATE', 'sys_User',
            CAST(@UserID AS NVARCHAR(100)), @IPAddress, @AuditOldValues, @AuditNewValues, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        SELECT @UserID AS UpdatedUserID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 5. dbo.usp_User_AssignFactories: Cập nhật riêng danh sách nhà máy & Audit
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_AssignFactories
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @UserID INT,
    @FactoryIdsJson NVARCHAR(MAX),
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra người thực hiện
        DECLARE @CallerRoleCode VARCHAR(30) = NULL;
        SELECT @CallerRoleCode = RoleCode
        FROM dbo.sys_User
        WHERE UserID = @CurrentUserID AND IsActive = 1;

        IF @CallerRoleCode IS NULL
        BEGIN
            THROW 50401, N'[50401] Người thực hiện không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        -- 2. Kiểm tra tồn tại user mục tiêu
        IF NOT EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE UserID = @UserID)
        BEGIN
            THROW 50404, N'[50404] Người dùng không tồn tại.', 1;
        END

        BEGIN TRANSACTION;

        -- 3. Xóa và gán mới
        DELETE FROM dbo.sys_User_Factory WHERE UserID = @UserID;

        IF @FactoryIdsJson IS NOT NULL AND ISJSON(@FactoryIdsJson) = 1
        BEGIN
            INSERT INTO dbo.sys_User_Factory (UserID, FactoryID, CreatedAt)
            SELECT @UserID, CAST(value AS INT), SYSUTCDATETIME()
            FROM OPENJSON(@FactoryIdsJson)
            WHERE TRY_CAST(value AS INT) IS NOT NULL
              AND EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = CAST(value AS INT));
        END

        UPDATE dbo.sys_User SET UpdatedAt = SYSUTCDATETIME() WHERE UserID = @UserID;

        -- 4. Ghi Audit Log (GV-09)
        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'USER_ASSIGN_FACTORIES', 'sys_User_Factory',
            CAST(@UserID AS NVARCHAR(100)), @IPAddress, NULL, @FactoryIdsJson, 'SUCCESS'
        );

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 6. dbo.usp_User_ResetPassword: Admin đặt lại mật khẩu cho người dùng & Audit
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_ResetPassword
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @UserID INT,
    @PasswordHash NVARCHAR(255),
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra người thực hiện
        DECLARE @CallerRoleCode VARCHAR(30) = NULL;
        SELECT @CallerRoleCode = RoleCode
        FROM dbo.sys_User
        WHERE UserID = @CurrentUserID AND IsActive = 1;

        IF @CallerRoleCode IS NULL
        BEGIN
            THROW 50401, N'[50401] Người thực hiện không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        -- 2. Kiểm tra tồn tại user mục tiêu
        IF NOT EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE UserID = @UserID)
        BEGIN
            THROW 50404, N'[50404] Người dùng không tồn tại.', 1;
        END

        BEGIN TRANSACTION;

        UPDATE dbo.sys_User
        SET PasswordHash = @PasswordHash,
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserID = @UserID;

        -- 3. Ghi Audit Log (GV-09)
        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'USER_RESET_PASSWORD', 'sys_User',
            CAST(@UserID AS NVARCHAR(100)), @IPAddress, NULL, N'{"action":"password_reset"}', 'SUCCESS'
        );

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 7. dbo.usp_User_Delete: Xóa người dùng với kiểm tra ràng buộc & Audit
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_Delete
    @CurrentUserID INT,
    @CurrentUsername NVARCHAR(50),
    @UserID INT,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra người thực hiện
        DECLARE @CallerRoleCode VARCHAR(30) = NULL;
        SELECT @CallerRoleCode = RoleCode
        FROM dbo.sys_User
        WHERE UserID = @CurrentUserID AND IsActive = 1;

        IF @CallerRoleCode IS NULL
        BEGIN
            THROW 50401, N'[50401] Người thực hiện không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        -- 2. Chặn tự xóa chính mình
        IF @CurrentUserID = @UserID
        BEGIN
            THROW 50403, N'[50403] Bạn không thể tự xóa tài khoản của chính mình.', 1;
        END

        -- 3. Kiểm tra tồn tại người dùng mục tiêu
        DECLARE @TargetUsername NVARCHAR(50);
        DECLARE @TargetRoleCode VARCHAR(30);
        DECLARE @TargetFullName NVARCHAR(100);

        SELECT 
            @TargetUsername = Username,
            @TargetRoleCode = RoleCode,
            @TargetFullName = FullName
        FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) 
        WHERE UserID = @UserID;

        IF @TargetUsername IS NULL
        BEGIN
            THROW 50404, N'[50404] Người dùng không tồn tại trong hệ thống.', 1;
        END

        -- 4. Bảo vệ Quản trị viên (ADMIN) cuối cùng của hệ thống
        IF @TargetRoleCode = 'ADMIN'
        BEGIN
            DECLARE @ActiveAdminCount INT = 0;
            SELECT @ActiveAdminCount = COUNT(1)
            FROM dbo.sys_User
            WHERE RoleCode = 'ADMIN' AND IsActive = 1 AND UserID <> @UserID;

            IF @ActiveAdminCount = 0
            BEGIN
                THROW 50403, N'[50403] Không thể xóa tài khoản Quản trị viên (ADMIN) hoạt động cuối cùng của hệ thống.', 1;
            END
        END

        -- 5. Kiểm tra xem tài khoản có phát sinh dữ liệu giao dịch hay không (D3, T9)
        IF EXISTS (SELECT 1 FROM dbo.fact_Inventory_Block WHERE CreatedBy = @TargetUsername)
           OR EXISTS (SELECT 1 FROM dbo.fact_Purchase_Request WHERE CreatedBy = @TargetUsername)
           OR EXISTS (SELECT 1 FROM dbo.fact_Demand_Override WHERE CreatedBy = @TargetUsername)
           OR EXISTS (SELECT 1 FROM dbo.sys_Import_Batch WHERE ImportedBy = @TargetUsername)
           OR EXISTS (SELECT 1 FROM dbo.fact_Delivery_Plan WHERE CreatedBy = @TargetUsername OR UpdatedBy = @TargetUsername)
           OR EXISTS (SELECT 1 FROM dbo.cfg_Stock_Threshold WHERE UpdatedBy = @TargetUsername)
           OR EXISTS (SELECT 1 FROM dbo.cfg_System WHERE UpdatedBy = @TargetUsername)
        BEGIN
            THROW 50409, N'[50409] Tài khoản đã phát sinh dữ liệu giao dịch, không thể xóa. Hãy thực hiện vô hiệu hóa (IsActive = 0).', 1;
        END

        BEGIN TRANSACTION;

        -- 6. Thu thập OldValues để ghi Audit
        DECLARE @AuditOldValues NVARCHAR(MAX) = (
            SELECT 
                @UserID AS userId,
                @TargetUsername AS username,
                @TargetFullName AS fullName,
                @TargetRoleCode AS roleCode
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- 7. Xóa nhà máy liên kết và xóa người dùng
        DELETE FROM dbo.sys_User_Factory WHERE UserID = @UserID;
        DELETE FROM dbo.sys_User WHERE UserID = @UserID;

        -- 8. Ghi Audit Log (GV-09)
        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @CurrentUserID, @CurrentUsername, 'USER_DELETE', 'sys_User',
            CAST(@UserID AS NVARCHAR(100)), @IPAddress, @AuditOldValues, NULL, 'SUCCESS'
        );

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
