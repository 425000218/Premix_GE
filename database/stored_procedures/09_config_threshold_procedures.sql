-- =====================================================================================
-- PHÂN HỆ F02b: CẤU HÌNH CHUNG HỆ THỐNG & NGƯỠNG TỒN KHO THEO CẶP
-- File: database/stored_procedures/09_config_threshold_procedures.sql
-- Quy tắc áp dụng:
--   - BR-12: Ràng buộc thứ tự ngưỡng chung: CriticalDays < WarningDays < OverstockDays <= OverstockDaysLowUsage
--   - BR-12a: Ràng buộc ngưỡng ghi đè theo cặp: CriticalDays(chung) < WarningDays(hiệu lực) < OverstockDays(hiệu lực)
--   - BR-12b: Bảo vệ toàn vẹn khi sửa cấu hình chung: Chặn lưu nếu làm bất kỳ cặp ghi đè nào vi phạm BR-12a,
--             đồng thời trả về danh sách các cặp xung đột.
-- =====================================================================================

USE PremixTrack_DB;
GO

-- =====================================================================================
-- 1. dbo.usp_Config_Get
-- Lấy toàn bộ 16 tham số cấu hình chung hệ thống (ConfigID = 1)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Config_Get
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        ConfigID,
        StandardMonthDays,
        CriticalDays,
        WarningDays,
        OverstockDays,
        OverstockDaysLowUsage,
        LowUsageKgPerMonth,
        MinActiveDays,
        ActualWindowDays,
        PoLateMonths,
        PoAgeReference,
        DeliveryDays,
        BulkDeliveryKg,
        UnusedStockDays,
        ReorderCoverDays,
        UsageDeviationPct,
        StaleDataDays,
        UpdatedAt,
        UpdatedBy
    FROM dbo.cfg_System
    WHERE ConfigID = 1;
END;
GO

-- =====================================================================================
-- 2. dbo.usp_Config_Update
-- Cập nhật 16 tham số cấu hình chung, kiểm tra nghiêm ngặt BR-12 và BR-12b
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Config_Update
    @UserID INT,
    @Username NVARCHAR(50),
    @StandardMonthDays INT,
    @CriticalDays INT,
    @WarningDays INT,
    @OverstockDays INT,
    @OverstockDaysLowUsage INT,
    @LowUsageKgPerMonth DECIMAL(18,0),
    @MinActiveDays INT,
    @ActualWindowDays INT = 14,
    @PoLateMonths INT,
    @PoAgeReference VARCHAR(10),
    @DeliveryDays INT,
    @BulkDeliveryKg DECIMAL(18,0),
    @UnusedStockDays INT,
    @ReorderCoverDays INT,
    @UsageDeviationPct DECIMAL(5,2),
    @StaleDataDays INT,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra miền giá trị cơ bản và thứ tự ngưỡng BR-12
        IF @CriticalDays <= 0
        BEGIN
            THROW 50400, N'[50400] Ngưỡng CriticalDays phải lớn hơn 0 (BR-12).', 1;
        END

        IF @CriticalDays >= @WarningDays
        BEGIN
            THROW 50400, N'[50400] Ngưỡng CriticalDays phải nhỏ hơn WarningDays (BR-12).', 1;
        END

        IF @WarningDays >= @OverstockDays
        BEGIN
            THROW 50400, N'[50400] Ngưỡng WarningDays phải nhỏ hơn OverstockDays (BR-12).', 1;
        END

        IF @OverstockDays > @OverstockDaysLowUsage
        BEGIN
            THROW 50400, N'[50400] Ngưỡng OverstockDays không được lớn hơn OverstockDaysLowUsage (BR-12).', 1;
        END

        IF @StandardMonthDays < 20 OR @StandardMonthDays > 31
        BEGIN
            THROW 50400, N'[50400] Số ngày chuẩn của tháng (StandardMonthDays) phải nằm trong khoảng 20 - 31.', 1;
        END

        IF @PoAgeReference NOT IN ('SNAPSHOT', 'TODAY')
        BEGIN
            THROW 50400, N'[50400] Tham số PoAgeReference chỉ nhận giá trị SNAPSHOT hoặc TODAY.', 1;
        END

        BEGIN TRANSACTION;

        -- 2. Kiểm tra xung đột ngược với các cặp đã ghi đè ngưỡng (BR-12b)
        IF EXISTS (
            SELECT 1
            FROM dbo.cfg_Stock_Threshold t WITH (UPDLOCK, HOLDLOCK)
            WHERE (@CriticalDays >= ISNULL(t.WarningDays, @WarningDays))
               OR (ISNULL(t.WarningDays, @WarningDays) >= ISNULL(t.OverstockDays, @OverstockDays))
        )
        BEGIN
            DECLARE @ConflictsJson NVARCHAR(MAX) = (
                SELECT
                    t.ThresholdID AS thresholdId,
                    t.FactoryID AS factoryId,
                    f.FactoryCode AS factoryCode,
                    t.MaterialID AS materialId,
                    m.MaterialCode AS materialCode,
                    t.WarningDays AS overrideWarningDays,
                    t.OverstockDays AS overrideOverstockDays,
                    ISNULL(t.WarningDays, @WarningDays) AS effectiveWarningDays,
                    ISNULL(t.OverstockDays, @OverstockDays) AS effectiveOverstockDays
                FROM dbo.cfg_Stock_Threshold t
                INNER JOIN dbo.dim_Factory f ON t.FactoryID = f.FactoryID
                INNER JOIN dbo.dim_Material m ON t.MaterialID = m.MaterialID
                WHERE (@CriticalDays >= ISNULL(t.WarningDays, @WarningDays))
                   OR (ISNULL(t.WarningDays, @WarningDays) >= ISNULL(t.OverstockDays, @OverstockDays))
                FOR JSON PATH
            );

            DECLARE @ConflictErrMsg NVARCHAR(4000) = CONCAT(
                N'[50409] Không thể cập nhật cấu hình chung do gây xung đột thứ tự ngưỡng với các cặp đã ghi đè riêng (BR-12b).||CONFLICTS_JSON||',
                @ConflictsJson
            );
            THROW 50409, @ConflictErrMsg, 1;
        END

        -- 3. Chụp giá trị cũ trước khi cập nhật
        DECLARE @OldValuesJson NVARCHAR(MAX) = (
            SELECT
                StandardMonthDays, CriticalDays, WarningDays, OverstockDays, OverstockDaysLowUsage,
                LowUsageKgPerMonth, MinActiveDays, ActualWindowDays, PoLateMonths, PoAgeReference,
                DeliveryDays, BulkDeliveryKg, UnusedStockDays, ReorderCoverDays, UsageDeviationPct, StaleDataDays
            FROM dbo.cfg_System WITH (UPDLOCK, HOLDLOCK)
            WHERE ConfigID = 1
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- 4. Cập nhật cấu hình chung
        UPDATE dbo.cfg_System
        SET StandardMonthDays = @StandardMonthDays,
            CriticalDays = @CriticalDays,
            WarningDays = @WarningDays,
            OverstockDays = @OverstockDays,
            OverstockDaysLowUsage = @OverstockDaysLowUsage,
            LowUsageKgPerMonth = @LowUsageKgPerMonth,
            MinActiveDays = @MinActiveDays,
            ActualWindowDays = ISNULL(@ActualWindowDays, ActualWindowDays),
            PoLateMonths = @PoLateMonths,
            PoAgeReference = @PoAgeReference,
            DeliveryDays = @DeliveryDays,
            BulkDeliveryKg = @BulkDeliveryKg,
            UnusedStockDays = @UnusedStockDays,
            ReorderCoverDays = @ReorderCoverDays,
            UsageDeviationPct = @UsageDeviationPct,
            StaleDataDays = @StaleDataDays,
            UpdatedAt = SYSUTCDATETIME(),
            UpdatedBy = @Username
        WHERE ConfigID = 1;

        DECLARE @NewValuesJson NVARCHAR(MAX) = (
            SELECT
                StandardMonthDays, CriticalDays, WarningDays, OverstockDays, OverstockDaysLowUsage,
                LowUsageKgPerMonth, MinActiveDays, ActualWindowDays, PoLateMonths, PoAgeReference,
                DeliveryDays, BulkDeliveryKg, UnusedStockDays, ReorderCoverDays, UsageDeviationPct, StaleDataDays
            FROM dbo.cfg_System
            WHERE ConfigID = 1
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- 5. Ghi nhận Audit Log (SYSTEM_CONFIG_UPDATE)
        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @UserID, @Username, 'SYSTEM_CONFIG_UPDATE', 'cfg_System',
            '1', @IPAddress, @OldValuesJson, @NewValuesJson, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        -- 6. Trả về cấu hình sau khi cập nhật
        EXEC dbo.usp_Config_Get;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 3. dbo.usp_Threshold_List
-- Danh sách phân trang ngưỡng ghi đè theo cặp kèm ngưỡng hiệu lực từ cfg_System
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Threshold_List
    @Search NVARCHAR(100) = NULL,
    @FactoryID INT = NULL,
    @MaterialID INT = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'UpdatedAt',
    @SortOrder NVARCHAR(4) = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    ;WITH FilteredThresholds AS (
        SELECT
            t.ThresholdID,
            t.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            t.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            m.BagKg,
            t.WarningDays,
            t.OverstockDays,
            t.SafetyDays,
            t.DeliveryDays,
            t.DeliveryQtyKg,
            t.Note,
            sys.CriticalDays AS SystemCriticalDays,
            sys.WarningDays AS SystemWarningDays,
            sys.OverstockDays AS SystemOverstockDays,
            sys.CriticalDays AS EffectiveCriticalDays,
            ISNULL(t.WarningDays, sys.WarningDays) AS EffectiveWarningDays,
            ISNULL(t.OverstockDays, sys.OverstockDays) AS EffectiveOverstockDays,
            t.UpdatedAt,
            t.UpdatedBy,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.cfg_Stock_Threshold t
        INNER JOIN dbo.dim_Factory f ON t.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON t.MaterialID = m.MaterialID
        CROSS JOIN dbo.cfg_System sys
        WHERE sys.ConfigID = 1
          AND (@FactoryID IS NULL OR t.FactoryID = @FactoryID)
          AND (@MaterialID IS NULL OR t.MaterialID = @MaterialID)
          AND (@Search IS NULL OR LEN(LTRIM(RTRIM(@Search))) = 0
               OR m.MaterialCode LIKE '%' + LTRIM(RTRIM(@Search)) + '%'
               OR m.MaterialName LIKE N'%' + LTRIM(RTRIM(@Search)) + N'%'
               OR f.FactoryCode LIKE '%' + LTRIM(RTRIM(@Search)) + '%'
               OR t.Note LIKE N'%' + LTRIM(RTRIM(@Search)) + N'%')
    )
    SELECT *
    FROM FilteredThresholds
    ORDER BY
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'UpdatedAt' THEN UpdatedAt END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'UpdatedAt' THEN UpdatedAt END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'FactoryCode' THEN FactoryCode END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'FactoryCode' THEN FactoryCode END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'MaterialCode' THEN MaterialCode END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'MaterialCode' THEN MaterialCode END DESC,
        ThresholdID DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
GO

-- =====================================================================================
-- 4. dbo.usp_Threshold_Upsert
-- Tạo mới hoặc cập nhật ngưỡng ghi đè theo cặp (FactoryID, MaterialID) với kiểm tra BR-12a
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Threshold_Upsert
    @UserID INT,
    @Username NVARCHAR(50),
    @FactoryID INT,
    @MaterialID INT,
    @WarningDays INT = NULL,
    @OverstockDays INT = NULL,
    @SafetyDays DECIMAL(4,1) = NULL,
    @DeliveryDays DECIMAL(4,1) = NULL,
    @DeliveryQtyKg DECIMAL(18,0) = NULL,
    @Note NVARCHAR(250) = NULL,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = @FactoryID)
        BEGIN
            THROW 50404, N'[50404] Nhà máy không tồn tại.', 1;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = @MaterialID)
        BEGIN
            THROW 50404, N'[50404] Nguyên liệu không tồn tại.', 1;
        END

        IF @SafetyDays IS NOT NULL AND (@SafetyDays < 0 OR @SafetyDays > 365)
        BEGIN
            THROW 50400, N'[50400] Số ngày an toàn (SafetyDays) phải nằm trong khoảng 0 - 365 ngày.', 1;
        END

        IF @DeliveryDays IS NOT NULL AND (@DeliveryDays < 1 OR @DeliveryDays > 365)
        BEGIN
            THROW 50400, N'[50400] Số ngày giao hàng (DeliveryDays) phải nằm trong khoảng 1 - 365 ngày.', 1;
        END

        IF @DeliveryQtyKg IS NOT NULL AND @DeliveryQtyKg <= 0
        BEGIN
            THROW 50400, N'[50400] Định mức khối lượng chuyến giao (DeliveryQtyKg) phải lớn hơn 0 kg.', 1;
        END

        BEGIN TRANSACTION;

        -- 1. Lấy ngưỡng chung từ cfg_System
        DECLARE @GenCritical INT, @GenWarning INT, @GenOverstock INT;
        SELECT
            @GenCritical = CriticalDays,
            @GenWarning = WarningDays,
            @GenOverstock = OverstockDays
        FROM dbo.cfg_System WITH (HOLDLOCK)
        WHERE ConfigID = 1;

        -- 2. Tính ngưỡng hiệu lực của cặp
        DECLARE @EffWarning INT = ISNULL(@WarningDays, @GenWarning);
        DECLARE @EffOverstock INT = ISNULL(@OverstockDays, @GenOverstock);

        -- 3. Kiểm tra quy tắc BR-12a: Critical chung < Warning hiệu lực < Overstock hiệu lực
        IF NOT (@GenCritical < @EffWarning AND @EffWarning < @EffOverstock)
        BEGIN
            DECLARE @ErrMsg NVARCHAR(500) = FORMATMESSAGE(
                N'[50400] Ngưỡng ghi đè không hợp lệ (BR-12a): Yêu cầu Critical chung (%d ngày) < Warning hiệu lực (%d ngày) < Overstock hiệu lực (%d ngày).',
                @GenCritical,
                @EffWarning,
                @EffOverstock
            );
            THROW 50400, @ErrMsg, 1;
        END

        -- 4. Upsert vào cfg_Stock_Threshold với khóa dòng bi quan WITH (UPDLOCK, HOLDLOCK)
        DECLARE @TargetThresholdID INT;
        DECLARE @OldValuesJson NVARCHAR(MAX) = NULL;

        SELECT @TargetThresholdID = ThresholdID
        FROM dbo.cfg_Stock_Threshold WITH (UPDLOCK, HOLDLOCK)
        WHERE FactoryID = @FactoryID AND MaterialID = @MaterialID;

        IF @TargetThresholdID IS NOT NULL
        BEGIN
            SET @OldValuesJson = (
                SELECT WarningDays, OverstockDays, SafetyDays, DeliveryDays, DeliveryQtyKg, Note
                FROM dbo.cfg_Stock_Threshold
                WHERE ThresholdID = @TargetThresholdID
                FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
            );

            UPDATE dbo.cfg_Stock_Threshold
            SET WarningDays = @WarningDays,
                OverstockDays = @OverstockDays,
                SafetyDays = @SafetyDays,
                DeliveryDays = @DeliveryDays,
                DeliveryQtyKg = @DeliveryQtyKg,
                Note = @Note,
                UpdatedAt = SYSUTCDATETIME(),
                UpdatedBy = @Username
            WHERE ThresholdID = @TargetThresholdID;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.cfg_Stock_Threshold (
                FactoryID, MaterialID, WarningDays, OverstockDays, SafetyDays, DeliveryDays, DeliveryQtyKg, Note, UpdatedAt, UpdatedBy
            )
            VALUES (
                @FactoryID, @MaterialID, @WarningDays, @OverstockDays, @SafetyDays, @DeliveryDays, @DeliveryQtyKg, @Note, SYSUTCDATETIME(), @Username
            );

            SET @TargetThresholdID = SCOPE_IDENTITY();
        END

        DECLARE @NewValuesJson NVARCHAR(MAX) = (
            SELECT
                @TargetThresholdID AS thresholdId,
                @FactoryID AS factoryId,
                @MaterialID AS materialId,
                @WarningDays AS warningDays,
                @OverstockDays AS overstockDays,
                @SafetyDays AS safetyDays,
                @DeliveryDays AS deliveryDays,
                @DeliveryQtyKg AS deliveryQtyKg,
                @Note AS note
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        -- 5. Ghi nhận Audit Log (THRESHOLD_UPSERT)
        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @UserID, @Username, 'THRESHOLD_UPSERT', 'cfg_Stock_Threshold',
            CAST(@TargetThresholdID AS NVARCHAR(100)), @IPAddress, @OldValuesJson, @NewValuesJson, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        -- 6. Trả về bản ghi vừa Upsert kèm ngưỡng hiệu lực
        SELECT
            t.ThresholdID,
            t.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            t.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            m.BagKg,
            t.WarningDays,
            t.OverstockDays,
            t.SafetyDays,
            t.DeliveryDays,
            t.DeliveryQtyKg,
            t.Note,
            @GenCritical AS SystemCriticalDays,
            @GenWarning AS SystemWarningDays,
            @GenOverstock AS SystemOverstockDays,
            @GenCritical AS EffectiveCriticalDays,
            @EffWarning AS EffectiveWarningDays,
            @EffOverstock AS EffectiveOverstockDays,
            t.UpdatedAt,
            t.UpdatedBy
        FROM dbo.cfg_Stock_Threshold t
        INNER JOIN dbo.dim_Factory f ON t.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON t.MaterialID = m.MaterialID
        WHERE t.ThresholdID = @TargetThresholdID;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 5. dbo.usp_Threshold_Delete
-- Xóa ngưỡng ghi đè theo ThresholdID, đưa cặp quay về sử dụng ngưỡng mặc định hệ thống
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Threshold_Delete
    @UserID INT,
    @Username NVARCHAR(50),
    @ThresholdID INT,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @FactoryID INT, @MaterialID INT;
        SELECT @FactoryID = FactoryID, @MaterialID = MaterialID
        FROM dbo.cfg_Stock_Threshold WITH (UPDLOCK, HOLDLOCK)
        WHERE ThresholdID = @ThresholdID;

        IF @FactoryID IS NULL
        BEGIN
            THROW 50404, N'[50404] Bản ghi ngưỡng ghi đè không tồn tại.', 1;
        END

        DECLARE @OldValuesJson NVARCHAR(MAX) = (
            SELECT
                ThresholdID, FactoryID, MaterialID, WarningDays, OverstockDays,
                SafetyDays, DeliveryDays, DeliveryQtyKg, Note
            FROM dbo.cfg_Stock_Threshold
            WHERE ThresholdID = @ThresholdID
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        DELETE FROM dbo.cfg_Stock_Threshold
        WHERE ThresholdID = @ThresholdID;

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @UserID, @Username, 'THRESHOLD_DELETE', 'cfg_Stock_Threshold',
            CAST(@ThresholdID AS NVARCHAR(100)), @IPAddress, @OldValuesJson, NULL, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        SELECT
            @ThresholdID AS ThresholdID,
            @FactoryID AS FactoryID,
            @MaterialID AS MaterialID,
            CAST(1 AS BIT) AS Deleted;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
