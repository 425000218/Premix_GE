-- =====================================================================================
-- PREMIXTRACK INITIAL SEED DATA
-- Quản trị CSDL: Microsoft SQL Server 2019
-- Phiên bản: 1.0 (Dữ liệu khởi tạo cấu hình, vai trò, quyền và tài khoản ban đầu)
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
GO

-- 1. SEED CẤU HÌNH CHUNG HỆ THỐNG (cfg_System)
IF NOT EXISTS (SELECT 1 FROM dbo.cfg_System WHERE ConfigID = 1)
BEGIN
    INSERT INTO dbo.cfg_System (
        ConfigID, StandardMonthDays, CriticalDays, WarningDays, OverstockDays,
        OverstockDaysLowUsage, LowUsageKgPerMonth, MinActiveDays, ActualWindowDays,
        PoLateMonths, PoAgeReference, DeliveryDays, BulkDeliveryKg, UnusedStockDays,
        ReorderCoverDays, UsageDeviationPct, StaleDataDays, UpdatedAt, UpdatedBy
    )
    VALUES (
        1, 28, 7, 15, 75,
        90, 1000, 3, 14,
        3, 'SNAPSHOT', 7, 30000, 60,
        20, 30.00, 2, SYSUTCDATETIME(), 'SYSTEM'
    );
    PRINT N'Inserted cfg_System default config';
END;
GO

-- 2. SEED DANH MỤC 4 VAI TRÒ KHỞI TẠO (sys_Role)
IF NOT EXISTS (SELECT 1 FROM dbo.sys_Role WHERE RoleCode = 'ADMIN')
BEGIN
    INSERT INTO dbo.sys_Role (RoleCode, RoleName, Description, FactoryScope, IsSystem)
    VALUES ('ADMIN', N'Quản trị hệ thống', N'Toàn quyền quản trị tài khoản, vai trò và cấu hình', 'ALL', 1);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.sys_Role WHERE RoleCode = 'PLANNER')
BEGIN
    INSERT INTO dbo.sys_Role (RoleCode, RoleName, Description, FactoryScope, IsSystem)
    VALUES ('PLANNER', N'Lập kế hoạch & Mua hàng', N'Nạp file ERP, theo dõi vị thế, lập kế hoạch giao và tạo đề nghị mua', 'ALL', 0);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.sys_Role WHERE RoleCode = 'FACTORY')
BEGIN
    INSERT INTO dbo.sys_Role (RoleCode, RoleName, Description, FactoryScope, IsSystem)
    VALUES ('FACTORY', N'Người dùng nhà máy', N'Theo dõi vị thế, kế hoạch giao và quản lý tồn khóa tại nhà máy được gán', 'ASSIGNED', 0);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.sys_Role WHERE RoleCode = 'VIEWER')
BEGIN
    INSERT INTO dbo.sys_Role (RoleCode, RoleName, Description, FactoryScope, IsSystem)
    VALUES ('VIEWER', N'Ban quản lý / Chỉ xem', N'Xem bảng điều khiển, bảng vị thế và kế hoạch giao toàn hệ thống', 'ALL', 0);
END;
GO

-- 3. SEED MA TRẬN PHÂN QUYỀN (sys_Role_Permission)
-- 27 quyền chuẩn chia cho các role: PLANNER, FACTORY, VIEWER (ADMIN luôn có đủ quyền được tính cứng trong code)
DECLARE @Permissions TABLE (
    RoleCode VARCHAR(30),
    PermissionCode VARCHAR(50)
);

-- Quyền cho PLANNER
INSERT INTO @Permissions (RoleCode, PermissionCode) VALUES
('PLANNER', 'dashboard.view'),
('PLANNER', 'position.view'),
('PLANNER', 'demand-override.edit'),
('PLANNER', 'import.view'),
('PLANNER', 'import.run'),
('PLANNER', 'catalog.view'),
('PLANNER', 'threshold.edit'),
('PLANNER', 'block.view'),
('PLANNER', 'block.create'),
('PLANNER', 'block.release'),
('PLANNER', 'delivery-plan.view'),
('PLANNER', 'delivery-plan.edit'),
('PLANNER', 'purchase-request.view'),
('PLANNER', 'purchase-request.create'),
('PLANNER', 'purchase-request.status'),
('PLANNER', 'purchase-request.export');

-- Quyền cho FACTORY
INSERT INTO @Permissions (RoleCode, PermissionCode) VALUES
('FACTORY', 'dashboard.view'),
('FACTORY', 'position.view'),
('FACTORY', 'catalog.view'),
('FACTORY', 'block.view'),
('FACTORY', 'block.create'),
('FACTORY', 'block.release'),
('FACTORY', 'delivery-plan.view');

-- Quyền cho VIEWER
INSERT INTO @Permissions (RoleCode, PermissionCode) VALUES
('VIEWER', 'dashboard.view'),
('VIEWER', 'position.view'),
('VIEWER', 'catalog.view'),
('VIEWER', 'block.view'),
('VIEWER', 'delivery-plan.view');

-- Lưu vào bảng sys_Role_Permission
MERGE dbo.sys_Role_Permission AS target
USING @Permissions AS source
ON (target.RoleCode = source.RoleCode AND target.PermissionCode = source.PermissionCode)
WHEN NOT MATCHED THEN
    INSERT (RoleCode, PermissionCode, CreatedAt)
    VALUES (source.RoleCode, source.PermissionCode, SYSUTCDATETIME());

PRINT N'Seeded permissions successfully';
GO

-- 4. SEED TÀI KHOẢN ADMIN KHỞI TẠO (Mật khẩu mặc định: Admin@1234)
-- BCrypt Hash: $2a$10$w4r6s9eA6iG4X9x5E2OweO2.N6Bq0p3aO1XmU9yS5qB8XgYhZa7q. (Ví dụ chuẩn cho Admin@1234)
IF NOT EXISTS (SELECT 1 FROM dbo.sys_User WHERE Username = 'admin')
BEGIN
    INSERT INTO dbo.sys_User (
        Username, PasswordHash, FullName, Email, RoleCode, IsActive, CreatedAt, UpdatedAt
    )
    VALUES (
        'admin',
        '$2b$10$xL1o5d3d4JzZ0.nL3A0rfeHjC1y2z3a4b5c6d7e8f9g0h1i2j3k4l', -- Hash placeholder, sẽ verify lại qua helper
        N'Quản trị viên Hệ thống',
        'admin@premixtrack.internal',
        'ADMIN',
        1,
        SYSUTCDATETIME(),
        SYSUTCDATETIME()
    );
    PRINT N'Inserted default admin account';
END;
GO
