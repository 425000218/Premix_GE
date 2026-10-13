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
    @SortOrder NVARCHAR(4) = 'DESC'
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
-- 3. dbo.usp_User_Create: Tạo tài khoản mới, kiểm tra trùng, gán nhà máy
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_Create
    @Username NVARCHAR(50),
    @PasswordHash NVARCHAR(255),
    @FullName NVARCHAR(100),
    @Email NVARCHAR(100) = NULL,
    @RoleCode VARCHAR(30),
    @FactoryIdsJson NVARCHAR(MAX) = NULL,
    @CreatedBy NVARCHAR(50) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Kiểm tra trùng Username
        IF EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE Username = @Username)
        BEGIN
            RAISERROR(N'Tên đăng nhập đã tồn tại trong hệ thống', 16, 1);
            RETURN;
        END

        -- 2. Kiểm tra trùng Email (nếu có cung cấp)
        IF @Email IS NOT NULL AND LTRIM(RTRIM(@Email)) <> ''
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE Email = @Email)
            BEGIN
                RAISERROR(N'Email đã được sử dụng bởi tài khoản khác', 16, 1);
                RETURN;
            END
        END

        -- 3. Kiểm tra vai trò
        DECLARE @Scope VARCHAR(10);
        SELECT @Scope = FactoryScope FROM dbo.sys_Role WHERE RoleCode = @RoleCode;
        IF @Scope IS NULL
        BEGIN
            RAISERROR(N'Mã vai trò không hợp lệ trong hệ thống', 16, 1);
            RETURN;
        END

        -- 4. Bắt buộc nhà máy nếu scope = ASSIGNED (BR-02b)
        DECLARE @FactoryCount INT = 0;
        IF @FactoryIdsJson IS NOT NULL AND ISJSON(@FactoryIdsJson) = 1
        BEGIN
            SELECT @FactoryCount = COUNT(*) FROM OPENJSON(@FactoryIdsJson);
        END

        IF @Scope = 'ASSIGNED' AND @FactoryCount = 0
        BEGIN
            RAISERROR(N'Vai trò phạm vi ASSIGNED bắt buộc phải gán ít nhất một nhà máy', 16, 1);
            RETURN;
        END

        -- 5. Chèn sys_User
        INSERT INTO dbo.sys_User (Username, PasswordHash, FullName, Email, RoleCode, IsActive, CreatedAt, UpdatedAt)
        VALUES (@Username, @PasswordHash, @FullName, NULLIF(LTRIM(RTRIM(@Email)), ''), @RoleCode, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

        DECLARE @NewUserID INT = SCOPE_IDENTITY();

        -- 6. Gán nhà máy nếu scope = ASSIGNED
        IF @Scope = 'ASSIGNED' AND @FactoryCount > 0
        BEGIN
            INSERT INTO dbo.sys_User_Factory (UserID, FactoryID, CreatedAt)
            SELECT @NewUserID, CAST(value AS INT), SYSUTCDATETIME()
            FROM OPENJSON(@FactoryIdsJson)
            WHERE TRY_CAST(value AS INT) IS NOT NULL
              AND EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = CAST(value AS INT));
        END

        COMMIT TRANSACTION;

        -- Trả về ID người dùng mới tạo
        SELECT @NewUserID AS NewUserID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 4. dbo.usp_User_Update: Sửa thông tin tài khoản, vai trò, nhà máy
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_Update
    @UserID INT,
    @FullName NVARCHAR(100),
    @Email NVARCHAR(100) = NULL,
    @RoleCode VARCHAR(30),
    @IsActive BIT,
    @FactoryIdsJson NVARCHAR(MAX) = NULL,
    @UpdatedBy NVARCHAR(50) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Kiểm tra tồn tại user
        DECLARE @CurrentUsername NVARCHAR(50);
        DECLARE @CurrentRoleCode VARCHAR(30);
        SELECT 
            @CurrentUsername = Username,
            @CurrentRoleCode = RoleCode
        FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK)
        WHERE UserID = @UserID;

        IF @CurrentUsername IS NULL
        BEGIN
            RAISERROR(N'Người dùng không tồn tại trong hệ thống', 16, 1);
            RETURN;
        END

        -- 2. Quy tắc an toàn Quản trị: Không được khóa hoặc hạ quyền Admin tối cao
        IF @CurrentUsername = 'admin' OR @UserID = 1
        BEGIN
            IF @IsActive = 0
            BEGIN
                RAISERROR(N'Không thể tự khóa tài khoản quản trị tối cao của hệ thống', 16, 1);
                RETURN;
            END
            IF @RoleCode <> 'ADMIN'
            BEGIN
                RAISERROR(N'Không thể hạ vai trò của tài khoản quản trị tối cao', 16, 1);
                RETURN;
            END
        END

        -- 3. Kiểm tra vai trò mới
        DECLARE @Scope VARCHAR(10);
        SELECT @Scope = FactoryScope FROM dbo.sys_Role WHERE RoleCode = @RoleCode;
        IF @Scope IS NULL
        BEGIN
            RAISERROR(N'Mã vai trò không hợp lệ trong hệ thống', 16, 1);
            RETURN;
        END

        -- 4. Kiểm tra trùng Email với tài khoản khác
        IF @Email IS NOT NULL AND LTRIM(RTRIM(@Email)) <> ''
        BEGIN
            IF EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE Email = @Email AND UserID <> @UserID)
            BEGIN
                RAISERROR(N'Email đã được sử dụng bởi tài khoản khác', 16, 1);
                RETURN;
            END
        END

        -- 5. Cập nhật thông tin User
        UPDATE dbo.sys_User
        SET FullName = @FullName,
            Email = NULLIF(LTRIM(RTRIM(@Email)), ''),
            RoleCode = @RoleCode,
            IsActive = @IsActive,
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserID = @UserID;

        -- 6. Cập nhật gán nhà máy
        IF @Scope = 'ALL'
        BEGIN
            -- Nếu scope là ALL, xóa các dòng gán cụ thể
            DELETE FROM dbo.sys_User_Factory WHERE UserID = @UserID;
        END
        ELSE IF @Scope = 'ASSIGNED'
        BEGIN
            -- Nếu scope là ASSIGNED, thay thế danh sách nhà máy
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
-- 5. dbo.usp_User_AssignFactories: Cập nhật riêng danh sách nhà máy
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_AssignFactories
    @UserID INT,
    @FactoryIdsJson NVARCHAR(MAX),
    @UpdatedBy NVARCHAR(50) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Kiểm tra tồn tại
        IF NOT EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE UserID = @UserID)
        BEGIN
            RAISERROR(N'Người dùng không tồn tại', 16, 1);
            RETURN;
        END

        -- Xóa và gán mới
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

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 6. dbo.usp_User_ResetPassword: Admin đặt lại mật khẩu cho người dùng
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_ResetPassword
    @UserID INT,
    @PasswordHash NVARCHAR(255),
    @UpdatedBy NVARCHAR(50) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE UserID = @UserID)
        BEGIN
            RAISERROR(N'Người dùng không tồn tại', 16, 1);
            RETURN;
        END

        UPDATE dbo.sys_User
        SET PasswordHash = @PasswordHash,
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserID = @UserID;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 7. dbo.usp_User_Delete: Xóa/Khóa người dùng với kiểm tra ràng buộc nghiệp vụ
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_User_Delete
    @UserID INT,
    @DeletedBy NVARCHAR(50) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Kiểm tra tồn tại
        DECLARE @Username NVARCHAR(50);
        SELECT @Username = Username FROM dbo.sys_User WITH (UPDLOCK, HOLDLOCK) WHERE UserID = @UserID;
        IF @Username IS NULL
        BEGIN
            RAISERROR(N'Người dùng không tồn tại trong hệ thống', 16, 1);
            RETURN;
        END

        -- 2. Chặn xóa admin tối cao
        IF @Username = 'admin' OR @UserID = 1
        BEGIN
            RAISERROR(N'Không thể xóa tài khoản quản trị tối cao của hệ thống', 16, 1);
            RETURN;
        END

        -- 3. Kiểm tra xem tài khoản có phát sinh dữ liệu giao dịch hay không
        IF EXISTS (SELECT 1 FROM dbo.fact_Inventory_Block WHERE CreatedBy = @Username)
           OR EXISTS (SELECT 1 FROM dbo.fact_Purchase_Request WHERE CreatedBy = @Username)
           OR EXISTS (SELECT 1 FROM dbo.fact_Demand_Override WHERE CreatedBy = @Username)
           OR EXISTS (SELECT 1 FROM dbo.sys_Import_Batch WHERE ImportedBy = @Username)
        BEGIN
            RAISERROR(N'Tài khoản đã phát sinh dữ liệu giao dịch, không thể xóa. Hãy thực hiện vô hiệu hóa (IsActive = 0).', 16, 2);
            RETURN;
        END

        -- 4. Nếu chưa phát sinh dữ liệu, cho phép xóa cứng
        DELETE FROM dbo.sys_User_Factory WHERE UserID = @UserID;
        DELETE FROM dbo.sys_User WHERE UserID = @UserID;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
