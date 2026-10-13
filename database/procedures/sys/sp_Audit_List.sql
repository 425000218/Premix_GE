-- =====================================================================================
-- STORED PROCEDURE: sp_Audit_List
-- Mục đích: Truy vấn danh sách nhật ký kiểm toán với phân trang, lọc và tìm kiếm
-- Phân hệ: SYS (Kiểm toán & Hệ thống)
-- Quy chuẩn: Hỗ trợ phân trang chuẩn (@Page, @PageSize), sắp xếp và tìm kiếm
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Audit_List
    @Search NVARCHAR(100) = NULL,
    @ActionCode VARCHAR(50) = NULL,
    @Username NVARCHAR(50) = NULL,
    @FromDate DATETIME2(0) = NULL,
    @ToDate DATETIME2(0) = NULL,
    @Page INT = 1,
    @PageSize INT = 20, -- @PageSize = 0 hoặc NULL: lấy tất cả
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
GO
