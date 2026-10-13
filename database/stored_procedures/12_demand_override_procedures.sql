-- =====================================================================================
-- MODULE F04b: DEMAND OVERRIDE & DATA FLAGS PROCEDURES
-- File: database/stored_procedures/12_demand_override_procedures.sql
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- =====================================================================================
-- 1. dbo.usp_DemandOverride_Create
-- Tạo bản ghi nhu cầu tháng sửa tay mới (Append-only BR-14a, BR-05a)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_DemandOverride_Create
    @FactoryID INT,
    @MaterialID INT,
    @OverrideKg DECIMAL(18,0),
    @PeriodMonth DATE = NULL,        -- Ngày đầu tháng (YYYY-MM-01), nếu NULL tự suy từ EffectiveDate
    @EffectiveDate DATE = NULL,      -- Ngày áp dụng, nếu NULL mặc định ngày chốt mới nhất
    @Reason NVARCHAR(250),
    @CreatedBy NVARCHAR(50),
    @IPAddress NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        -- 1. Kiểm tra tham số bắt buộc
        IF @FactoryID IS NULL OR @MaterialID IS NULL
        BEGIN
            THROW 50400, N'[50400] factoryId và materialId là bắt buộc.', 1;
        END;

        IF @OverrideKg IS NULL OR @OverrideKg < 0
        BEGIN
            THROW 50400, N'[50400] Khối lượng nhu cầu sửa tay (overrideKg) phải là số >= 0.', 1;
        END;

        IF @Reason IS NULL OR LTRIM(RTRIM(@Reason)) = N''
        BEGIN
            THROW 50400, N'[50400] Vui lòng nhập lý do sửa tay nhu cầu tháng.', 1;
        END;

        -- 2. Kiểm tra Nhà máy & Nguyên liệu tồn tại và đang hoạt động
        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = @FactoryID AND IsActive = 1)
        BEGIN
            THROW 50400, N'[50400] Nhà máy không tồn tại hoặc đã ngừng hoạt động.', 1;
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = @MaterialID AND IsActive = 1)
        BEGIN
            THROW 50400, N'[50400] Nguyên liệu không tồn tại hoặc đã ngừng hoạt động.', 1;
        END;

        IF NOT EXISTS (
            SELECT 1 FROM dbo.dim_Factory_Material 
            WHERE FactoryID = @FactoryID AND MaterialID = @MaterialID AND IsActive = 1
        )
        BEGIN
            THROW 50400, N'[50400] Cặp Nhà máy - Nguyên liệu không tồn tại trong danh mục theo dõi.', 1;
        END;

        -- 3. Xác định ngày áp dụng & tháng áp dụng
        DECLARE @LatestSnapshotDate DATE = (SELECT MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH);
        IF @EffectiveDate IS NULL
            SET @EffectiveDate = ISNULL(@LatestSnapshotDate, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE));

        IF @PeriodMonth IS NULL
            SET @PeriodMonth = DATEFROMPARTS(YEAR(@EffectiveDate), MONTH(@EffectiveDate), 1);
        ELSE
            SET @PeriodMonth = DATEFROMPARTS(YEAR(@PeriodMonth), MONTH(@PeriodMonth), 1);

        -- Kiểm tra tháng: chỉ cho phép tháng hiện tại của ngày chốt hoặc tháng kế tiếp
        DECLARE @RefSnapDate DATE = ISNULL(@LatestSnapshotDate, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE));
        DECLARE @CurrMonthStart DATE = DATEFROMPARTS(YEAR(@RefSnapDate), MONTH(@RefSnapDate), 1);
        DECLARE @NextMonthStart DATE = DATEADD(MONTH, 1, @CurrMonthStart);

        IF @PeriodMonth <> @CurrMonthStart AND @PeriodMonth <> @NextMonthStart
        BEGIN
            THROW 50400, N'[50400] Chỉ được phép sửa nhu cầu cho tháng hiện tại của ngày chốt hoặc tháng kế tiếp.', 1;
        END;

        -- 4. Ghi nhận vào fact_Demand_Override (Append-only) trong Transaction
        DECLARE @NewOverrideID INT;
        DECLARE @ActionDesc NVARCHAR(500);

        BEGIN TRANSACTION;

        INSERT INTO dbo.fact_Demand_Override (
            FactoryID,
            MaterialID,
            PeriodMonth,
            EffectiveDate,
            OverrideKg,
            Reason,
            CreatedAt,
            CreatedBy
        )
        VALUES (
            @FactoryID,
            @MaterialID,
            @PeriodMonth,
            @EffectiveDate,
            @OverrideKg,
            LTRIM(RTRIM(@Reason)),
            SYSUTCDATETIME(),
            @CreatedBy
        );

        SET @NewOverrideID = SCOPE_IDENTITY();

        -- Ghi nhật ký kiểm toán sys_Audit_Log
        SET @ActionDesc = CONCAT(N'Thiết lập nhu cầu tháng sửa tay: ', @OverrideKg, N' kg (', 
                                 CAST(@OverrideKg / 1000.0 AS DECIMAL(18,3)), N' tấn) cho tháng ', 
                                 CONVERT(VARCHAR(7), @PeriodMonth, 126), N'. Lý do: ', @Reason);

        DECLARE @TargetIDStr NVARCHAR(100) = CAST(@NewOverrideID AS NVARCHAR(100));

        EXEC dbo.usp_Audit_Write
            @UserID = NULL,
            @Username = @CreatedBy,
            @ActionCode = 'DEMAND_OVERRIDE_CREATE',
            @TargetEntity = 'fact_Demand_Override',
            @TargetID = @TargetIDStr,
            @IPAddress = @IPAddress,
            @OldValues = NULL,
            @NewValues = @ActionDesc,
            @Status = 'SUCCESS',
            @ErrorMessage = NULL;

        COMMIT TRANSACTION;

        -- 5. Trả về kết quả bản ghi vừa tạo
        SELECT
            o.OverrideID AS overrideId,
            o.FactoryID AS factoryId,
            f.FactoryCode AS factoryCode,
            f.FactoryName AS factoryName,
            o.MaterialID AS materialId,
            m.MaterialCode AS materialCode,
            m.MaterialName AS materialName,
            CONVERT(VARCHAR(10), o.PeriodMonth, 23) AS periodMonth,
            CONVERT(VARCHAR(10), o.EffectiveDate, 23) AS effectiveDate,
            o.OverrideKg AS overrideKg,
            CAST(o.OverrideKg / 1000.0 AS DECIMAL(18,3)) AS overrideTons,
            CAST(0 AS BIT) AS isRemoval,
            o.Reason AS reason,
            o.CreatedBy AS createdBy,
            CONVERT(VARCHAR(19), o.CreatedAt, 126) AS createdAt
        FROM dbo.fact_Demand_Override o
        INNER JOIN dbo.dim_Factory f ON o.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON o.MaterialID = m.MaterialID
        WHERE o.OverrideID = @NewOverrideID;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrNum INT = ERROR_NUMBER();
        IF @ErrNum >= 50000
            THROW;
        RAISERROR(@ErrMsg, 16, 1);
    END CATCH
END;
GO

-- =====================================================================================
-- 2. dbo.usp_DemandOverride_Remove
-- Hủy bỏ số sửa tay để quay về dùng Forecast (Append-only ghi OverrideKg = NULL)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_DemandOverride_Remove
    @FactoryID INT,
    @MaterialID INT,
    @PeriodMonth DATE = NULL,
    @EffectiveDate DATE = NULL,
    @Reason NVARCHAR(250) = NULL,
    @CreatedBy NVARCHAR(50),
    @IPAddress NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        IF @FactoryID IS NULL OR @MaterialID IS NULL
        BEGIN
            THROW 50400, N'[50400] factoryId và materialId là bắt buộc.', 1;
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = @FactoryID AND IsActive = 1)
        BEGIN
            THROW 50400, N'[50400] Nhà máy không tồn tại hoặc đã ngừng hoạt động.', 1;
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = @MaterialID AND IsActive = 1)
        BEGIN
            THROW 50400, N'[50400] Nguyên liệu không tồn tại hoặc đã ngừng hoạt động.', 1;
        END;

        DECLARE @LatestSnapshotDate DATE = (SELECT MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH);
        IF @EffectiveDate IS NULL
            SET @EffectiveDate = ISNULL(@LatestSnapshotDate, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE));

        IF @PeriodMonth IS NULL
            SET @PeriodMonth = DATEFROMPARTS(YEAR(@EffectiveDate), MONTH(@EffectiveDate), 1);
        ELSE
            SET @PeriodMonth = DATEFROMPARTS(YEAR(@PeriodMonth), MONTH(@PeriodMonth), 1);

        DECLARE @CleanReason NVARCHAR(250) = ISNULL(LTRIM(RTRIM(@Reason)), N'Hủy bỏ số sửa tay, chuyển sang dùng Forecast');
        IF @CleanReason = N''
            SET @CleanReason = N'Hủy bỏ số sửa tay, chuyển sang dùng Forecast';

        DECLARE @NewOverrideID INT;
        DECLARE @ActionDesc NVARCHAR(500);

        BEGIN TRANSACTION;

        INSERT INTO dbo.fact_Demand_Override (
            FactoryID,
            MaterialID,
            PeriodMonth,
            EffectiveDate,
            OverrideKg,
            Reason,
            CreatedAt,
            CreatedBy
        )
        VALUES (
            @FactoryID,
            @MaterialID,
            @PeriodMonth,
            @EffectiveDate,
            NULL, -- NULL biểu thị việc HỦY BỎ số sửa tay theo BR-05b
            @CleanReason,
            SYSUTCDATETIME(),
            @CreatedBy
        );

        SET @NewOverrideID = SCOPE_IDENTITY();

        SET @ActionDesc = CONCAT(N'Hủy bỏ nhu cầu tháng sửa tay cho tháng ', 
                                 CONVERT(VARCHAR(7), @PeriodMonth, 126), N'. Lý do: ', @CleanReason);

        DECLARE @TargetIDStr NVARCHAR(100) = CAST(@NewOverrideID AS NVARCHAR(100));

        EXEC dbo.usp_Audit_Write
            @UserID = NULL,
            @Username = @CreatedBy,
            @ActionCode = 'DEMAND_OVERRIDE_REMOVE',
            @TargetEntity = 'fact_Demand_Override',
            @TargetID = @TargetIDStr,
            @IPAddress = @IPAddress,
            @OldValues = NULL,
            @NewValues = @ActionDesc,
            @Status = 'SUCCESS',
            @ErrorMessage = NULL;

        COMMIT TRANSACTION;

        SELECT
            o.OverrideID AS overrideId,
            o.FactoryID AS factoryId,
            f.FactoryCode AS factoryCode,
            f.FactoryName AS factoryName,
            o.MaterialID AS materialId,
            m.MaterialCode AS materialCode,
            m.MaterialName AS materialName,
            CONVERT(VARCHAR(10), o.PeriodMonth, 23) AS periodMonth,
            CONVERT(VARCHAR(10), o.EffectiveDate, 23) AS effectiveDate,
            o.OverrideKg AS overrideKg,
            NULL AS overrideTons,
            CAST(1 AS BIT) AS isRemoval,
            o.Reason AS reason,
            o.CreatedBy AS createdBy,
            CONVERT(VARCHAR(19), o.CreatedAt, 126) AS createdAt
        FROM dbo.fact_Demand_Override o
        INNER JOIN dbo.dim_Factory f ON o.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON o.MaterialID = m.MaterialID
        WHERE o.OverrideID = @NewOverrideID;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrNum INT = ERROR_NUMBER();
        IF @ErrNum >= 50000
            THROW;
        RAISERROR(@ErrMsg, 16, 1);
    END CATCH
END;
GO

-- =====================================================================================
-- 3. dbo.usp_DemandOverride_GetHistory
-- Lấy toàn bộ lịch sử các lần sửa tay nhu cầu tháng của 1 cặp NM - NL (BR-14a)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_DemandOverride_GetHistory
    @FactoryID INT,
    @MaterialID INT,
    @PeriodMonth DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        IF @PeriodMonth IS NOT NULL
            SET @PeriodMonth = DATEFROMPARTS(YEAR(@PeriodMonth), MONTH(@PeriodMonth), 1);

        SELECT
            o.OverrideID AS overrideId,
            o.FactoryID AS factoryId,
            f.FactoryCode AS factoryCode,
            f.FactoryName AS factoryName,
            o.MaterialID AS materialId,
            m.MaterialCode AS materialCode,
            m.MaterialName AS materialName,
            CONVERT(VARCHAR(10), o.PeriodMonth, 23) AS periodMonth,
            CONVERT(VARCHAR(10), o.EffectiveDate, 23) AS effectiveDate,
            o.OverrideKg AS overrideKg,
            CASE WHEN o.OverrideKg IS NOT NULL THEN CAST(o.OverrideKg / 1000.0 AS DECIMAL(18,3)) ELSE NULL END AS overrideTons,
            CASE WHEN o.OverrideKg IS NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isRemoval,
            o.Reason AS reason,
            o.CreatedBy AS createdBy,
            CONVERT(VARCHAR(19), o.CreatedAt, 126) AS createdAt
        FROM dbo.fact_Demand_Override o
        INNER JOIN dbo.dim_Factory f ON o.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON o.MaterialID = m.MaterialID
        WHERE o.FactoryID = @FactoryID
          AND o.MaterialID = @MaterialID
          AND (@PeriodMonth IS NULL OR o.PeriodMonth = @PeriodMonth)
        ORDER BY o.EffectiveDate DESC, o.CreatedAt DESC, o.OverrideID DESC;

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
