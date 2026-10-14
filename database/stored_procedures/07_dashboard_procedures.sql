-- =====================================================================================
-- MODULE F05: EXECUTIVE DASHBOARD & HEATMAP MATRIX STORED PROCEDURES
-- File: database/stored_procedures/07_dashboard_procedures.sql
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE dbo.usp_Dashboard_GetContextInfo
    @SnapshotDate VARCHAR(20) = NULL,
    @UserID INT = NULL,
    @FactoryID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        DECLARE @FactoryScope VARCHAR(10) = NULL;
        IF @UserID IS NOT NULL
        BEGIN
            SELECT @FactoryScope = r.FactoryScope
            FROM dbo.sys_User u
            INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
            WHERE u.UserID = @UserID AND u.IsActive = 1;
        END;

        IF @FactoryScope IS NULL
        BEGIN
            THROW 50401, N'[50401] Người dùng không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END;

        IF @FactoryScope = 'ASSIGNED' AND @FactoryID IS NOT NULL
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.sys_User_Factory WHERE UserID = @UserID AND FactoryID = @FactoryID)
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền truy cập dữ liệu của nhà máy này.', 1;
            END;
        END;

        -- Result Set 1: Thông tin lần nạp thành công mới nhất (Ưu tiên DAILY_SET)
        SELECT TOP 1
            BatchID AS batchId,
            BatchType AS batchType,
            CONVERT(VARCHAR(10), SnapshotDate, 23) AS snapshotDate,
            CONVERT(VARCHAR(10), CutoffDate, 23) AS cutoffDate,
            OriginalFileName AS originalFileName,
            TotalRows AS totalRows,
            ValidRows AS validRows,
            Status AS status,
            ImportedAt AS importedAt,
            ImportedBy AS importedBy
        FROM dbo.sys_Import_Batch
        WHERE Status = 'COMPLETED'
        ORDER BY
            CASE WHEN BatchType = 'DAILY_SET' THEN 0 ELSE 1 END ASC,
            ImportedAt DESC,
            BatchID DESC;

        -- Result Set 2: Danh sách các cột Nhà máy trên Ma trận nhiệt (theo phạm vi quyền của User)
        SELECT
            f.FactoryID AS factoryId,
            f.FactoryCode AS factoryCode,
            f.FactoryName AS factoryName,
            f.Region AS region,
            f.PlantType AS plantType
        FROM dbo.dim_Factory f
        WHERE f.IsActive = 1
          AND (@FactoryID IS NULL OR f.FactoryID = @FactoryID)
          AND (
              @FactoryScope = 'ALL'
              OR EXISTS (SELECT 1 FROM dbo.sys_User_Factory uf WHERE uf.UserID = @UserID AND uf.FactoryID = f.FactoryID)
          )
        ORDER BY
            CASE f.FactoryCode
                WHEN 'DN' THEN 1
                WHEN 'BD' THEN 2
                WHEN 'VL2' THEN 3
                WHEN 'HG' THEN 4
                WHEN 'BD1' THEN 5
                WHEN 'BD2' THEN 6
                ELSE 99
            END ASC,
            f.FactoryCode ASC;

        -- Result Set 3: Danh sách các dòng Nguyên liệu đang hoạt động trên Ma trận nhiệt
        SELECT
            m.MaterialID AS materialId,
            m.MaterialCode AS materialCode,
            m.MaterialName AS materialName,
            m.Category AS category,
            m.ItemGroup AS itemGroup,
            m.PackingSpec AS packingSpec,
            m.BagKg AS bagKg,
            m.UOM AS uom,
            m.PIC AS pic,
            m.DisplayDecimals AS displayDecimals
        FROM dbo.dim_Material m
        WHERE m.IsActive = 1
        ORDER BY m.MaterialCode ASC;

    END TRY
    BEGIN CATCH
        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrNum INT = ERROR_NUMBER();
        IF @ErrNum >= 50000
            THROW;
        RAISERROR(@ErrMsg, 16, 1);
    END CATCH
END;
GO
