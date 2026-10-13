-- =====================================================================================
-- STORED PROCEDURE: usp_Auth_GetUserForLogin
-- Mục đích: Lấy thông tin tài khoản và vai trò để đối chiếu đăng nhập
-- Phân hệ: F01 (Xác thực & Tài khoản)
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_GetUserForLogin
    @Username NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 
        u.UserID,
        u.Username,
        u.PasswordHash,
        u.FullName,
        u.Email,
        u.RoleCode,
        r.RoleName,
        r.FactoryScope,
        u.IsActive
    FROM dbo.sys_User u
    INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
    WHERE u.Username = @Username;
END;
GO
