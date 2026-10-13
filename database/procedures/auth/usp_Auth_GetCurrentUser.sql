-- =====================================================================================
-- STORED PROCEDURE: usp_Auth_GetCurrentUser
-- Mục đích: Đọc thông tin người dùng, danh sách quyền và danh sách nhà máy được gán
-- Phân hệ: F01 (Xác thực & Tài khoản)
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetCurrentUser
    @UserID INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Result 1: Thông tin người dùng
    SELECT 
        u.UserID,
        u.Username,
        u.FullName,
        u.Email,
        u.RoleCode,
        r.RoleName,
        r.FactoryScope,
        u.IsActive
    FROM dbo.sys_User u
    INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
    WHERE u.UserID = @UserID;

    -- Result 2: Danh sách quyền của vai trò
    SELECT rp.PermissionCode
    FROM dbo.sys_User u
    INNER JOIN dbo.sys_Role_Permission rp ON u.RoleCode = rp.RoleCode
    WHERE u.UserID = @UserID;

    -- Result 3: Danh sách nhà máy được gán (nếu scope = ASSIGNED)
    SELECT uf.FactoryID, f.FactoryCode, f.FactoryName
    FROM dbo.sys_User_Factory uf
    INNER JOIN dbo.dim_Factory f ON uf.FactoryID = f.FactoryID
    WHERE uf.UserID = @UserID;
END;
GO
