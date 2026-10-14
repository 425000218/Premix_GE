-- =====================================================================================
-- 03_cleanup_test_data.sql
-- Dọn dẹp 30 tài khoản và vai trò test rác, chuẩn hóa 4 tài khoản vận hành chuẩn
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

BEGIN TRANSACTION;

-- 1. Chuyển quyền sở hữu các dữ liệu giao dịch phát sinh từ test users về admin
UPDATE dbo.fact_Purchase_Request 
SET CreatedBy = 'admin' 
WHERE CreatedBy <> 'admin';

UPDATE dbo.fact_Delivery_Plan 
SET CreatedBy = 'admin', UpdatedBy = 'admin' 
WHERE CreatedBy <> 'admin';

UPDATE dbo.fact_Demand_Override 
SET CreatedBy = 'admin' 
WHERE CreatedBy <> 'admin';

UPDATE dbo.sys_Import_Batch 
SET ImportedBy = 'admin' 
WHERE ImportedBy <> 'admin';

UPDATE dbo.sys_Audit_Log 
SET UserID = 1, Username = 'admin' 
WHERE UserID > 1 OR (Username LIKE 'user_qa_%' OR Username LIKE 'planner_%' OR Username LIKE 'factory_%');

-- 2. Xóa liên kết nhà máy của các user test
DELETE FROM dbo.sys_User_Factory WHERE UserID > 1;

-- 3. Xóa các user test
DELETE FROM dbo.sys_User WHERE UserID > 1;

-- 4. Xóa 3 vai trò test rác
DELETE FROM dbo.sys_Role_Permission WHERE RoleCode IN ('QA_58916', 'QA_87303', 'TEST_QA_LEAD');
DELETE FROM dbo.sys_Role WHERE RoleCode IN ('QA_58916', 'QA_87303', 'TEST_QA_LEAD');

-- 5. Tạo 3 tài khoản nghiệp vụ chuẩn mực (Mật khẩu mặc định: Admin@1234)
DECLARE @AdminHash NVARCHAR(255) = '$2b$10$gbkzHdjc/TgRg.NNKMQWIOO48btZbezXyMPXywsuF2MyJoYrLsHMe';

-- Tài khoản PLANNER
IF NOT EXISTS (SELECT 1 FROM dbo.sys_User WHERE Username = 'planner')
BEGIN
    INSERT INTO dbo.sys_User (Username, PasswordHash, FullName, Email, RoleCode, IsActive, CreatedAt, UpdatedAt)
    VALUES ('planner', @AdminHash, N'Chuyên viên Kế hoạch & Mua hàng', 'planner@premixtrack.internal', 'PLANNER', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END;

-- Tài khoản FACTORY (Đồng Nai)
DECLARE @FactoryUserID INT;
IF NOT EXISTS (SELECT 1 FROM dbo.sys_User WHERE Username = 'factory_dn')
BEGIN
    INSERT INTO dbo.sys_User (Username, PasswordHash, FullName, Email, RoleCode, IsActive, CreatedAt, UpdatedAt)
    VALUES ('factory_dn', @AdminHash, N'Thủ kho Nhà máy Đồng Nai', 'factory.dn@premixtrack.internal', 'FACTORY', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
    
    SET @FactoryUserID = SCOPE_IDENTITY();
    
    -- Gán nhà máy DN (ID = 1)
    DECLARE @DnFactoryID INT;
    SELECT TOP 1 @DnFactoryID = FactoryID FROM dbo.dim_Factory WHERE FactoryCode = 'DN';
    IF @DnFactoryID IS NOT NULL
    BEGIN
        INSERT INTO dbo.sys_User_Factory (UserID, FactoryID, CreatedAt)
        VALUES (@FactoryUserID, @DnFactoryID, SYSUTCDATETIME());
    END;
END;

-- Tài khoản VIEWER (Ban Quản lý)
IF NOT EXISTS (SELECT 1 FROM dbo.sys_User WHERE Username = 'viewer')
BEGIN
    INSERT INTO dbo.sys_User (Username, PasswordHash, FullName, Email, RoleCode, IsActive, CreatedAt, UpdatedAt)
    VALUES ('viewer', @AdminHash, N'Ban Quản lý Sản xuất & Cung ứng', 'viewer@premixtrack.internal', 'VIEWER', 1, SYSUTCDATETIME(), SYSUTCDATETIME());
END;

COMMIT TRANSACTION;

PRINT N'Cleaned up test data and seeded standard accounts successfully!';
GO
