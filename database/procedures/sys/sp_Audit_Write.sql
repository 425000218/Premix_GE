-- =====================================================================================
-- STORED PROCEDURE: sp_Audit_Write
-- Mục đích: Ghi nhận vết kiểm toán hệ thống vào sys_Audit_Log
-- Phân hệ: SYS (Kiểm toán & Hệ thống)
-- Quy chuẩn: TRY/CATCH, An toàn tham số
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Audit_Write
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
    SET XACT_ABORT ON;

    BEGIN TRY
        INSERT INTO dbo.sys_Audit_Log (
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
            ErrorMessage
        )
        VALUES (
            SYSUTCDATETIME(),
            @UserID,
            @Username,
            @ActionCode,
            @TargetEntity,
            @TargetID,
            @IPAddress,
            @OldValues,
            @NewValues,
            @Status,
            @ErrorMessage
        );
    END TRY
    BEGIN CATCH
        -- Không ném lỗi làm gián đoạn transaction chính, nhưng ghi nhận lỗi
        DECLARE @Err NVARCHAR(4000) = ERROR_MESSAGE();
        PRINT N'Warning: sp_Audit_Write failed: ' + @Err;
    END CATCH
END;
GO
