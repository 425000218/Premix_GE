-- =====================================================================================
-- STORED PROCEDURE: usp_Auth_UpdatePassword
-- Mục đích: Cập nhật mật khẩu băm cho tài khoản
-- Phân hệ: F01 (Xác thực & Tài khoản)
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Auth_UpdatePassword
    @UserID INT,
    @PasswordHash NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.sys_User
    SET PasswordHash = @PasswordHash,
        UpdatedAt = SYSUTCDATETIME()
    WHERE UserID = @UserID;
END;
GO
