-- =====================================================================================
-- MODULE F04a: STOCK POSITION CALCULATION ENGINE & SNAPSHOT QUERIES
-- File: database/stored_procedures/06_position_procedures.sql
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- =====================================================================================
-- 1. dbo.usp_Position_GetSnapshotDates
-- Lấy danh sách các ngày chốt (SnapshotDate) đã có dữ liệu tồn kho
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Position_GetSnapshotDates
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        DECLARE @StaleDataDays INT = 2;
        SELECT @StaleDataDays = StaleDataDays FROM dbo.cfg_System WHERE ConfigID = 1;

        DECLARE @TodayVN DATE = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE);
        DECLARE @LatestSnap DATE = (SELECT MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH);

        -- Result Set 1: Danh sách các ngày chốt đã có dữ liệu
        ;WITH SnapshotSummary AS (
            SELECT
                s.SnapshotDate,
                COUNT(DISTINCT CONCAT(s.FactoryID, '-', s.MaterialID)) AS PairCount,
                SUM(s.SohQtyKg) AS TotalSohKg,
                MAX(s.BatchID) AS LatestBatchID
            FROM dbo.fact_Inventory_SOH s
            GROUP BY s.SnapshotDate
        )
        SELECT
            CONVERT(VARCHAR(10), ss.SnapshotDate, 23) AS snapshotDate,
            CONVERT(VARCHAR(10), b.CutoffDate, 23) AS cutoffDate,
            ss.PairCount AS pairCount,
            ss.TotalSohKg AS totalSohKg,
            ss.LatestBatchID AS latestBatchId,
            b.ImportedAt AS importedAt,
            b.ImportedBy AS importedBy,
            DATEDIFF(DAY, ss.SnapshotDate, @TodayVN) AS ageDays,
            CASE WHEN DATEDIFF(DAY, ss.SnapshotDate, @TodayVN) > @StaleDataDays THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isStale
        FROM SnapshotSummary ss
        LEFT JOIN dbo.sys_Import_Batch b ON ss.LatestBatchID = b.BatchID
        ORDER BY ss.SnapshotDate DESC;

        -- Result Set 2: Metadata cấu hình StaleData
        SELECT
            CONVERT(VARCHAR(10), @TodayVN, 23) AS currentDateVn,
            @StaleDataDays AS staleDataDays,
            CONVERT(VARCHAR(10), @LatestSnap, 23) AS latestSnapshotDate;
    END TRY
    BEGIN CATCH
        DECLARE @ErrMsg NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrState INT = ERROR_STATE();
        RAISERROR(@ErrMsg, @ErrSeverity, @ErrState);
    END CATCH
END;
GO

-- =====================================================================================
-- 2. dbo.usp_Position_LoadSnapshot
-- Nạp đồng thời các tập dữ liệu thô tại ngày chốt @SnapshotDate để Domain Engine tính toán
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Position_LoadSnapshot
    @SnapshotDate VARCHAR(20) = NULL,
    @UserID INT = NULL,
    @FactoryID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        DECLARE @LatestSnapshotDate DATE = (SELECT MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH);
        DECLARE @SnapDate DATE = TRY_CONVERT(DATE, @SnapshotDate);
        IF @SnapDate IS NULL
            SET @SnapDate = ISNULL(@LatestSnapshotDate, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE));

        -- Kiểm tra phạm vi nhà máy của User (Default Deny)
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

        -- Nếu User có phạm vi ASSIGNED và truyền @FactoryID cụ thể không nằm trong danh sách được gán -> Chặn 403
        IF @FactoryScope = 'ASSIGNED' AND @FactoryID IS NOT NULL
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM dbo.sys_User_Factory WHERE UserID = @UserID AND FactoryID = @FactoryID)
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền truy cập dữ liệu của nhà máy này.', 1;
            END;
        END;

        DECLARE @CurrentMonthStart DATE = DATEFROMPARTS(YEAR(@SnapDate), MONTH(@SnapDate), 1);
        DECLARE @PrevMonthStart DATE = DATEADD(MONTH, -1, @CurrentMonthStart);
        DECLARE @PrevMonthEnd DATE = DATEADD(DAY, -1, @CurrentMonthStart);

        DECLARE @UnusedStockDays INT = 60;
        DECLARE @PoLateMonths INT = 3;
        DECLARE @PoAgeReference VARCHAR(10) = 'SNAPSHOT';

        SELECT
            @UnusedStockDays = UnusedStockDays,
            @PoLateMonths = PoLateMonths,
            @PoAgeReference = PoAgeReference
        FROM dbo.cfg_System
        WHERE ConfigID = 1;

        DECLARE @TodayVN DATE = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE);
        DECLARE @PoRefDate DATE = CASE WHEN @PoAgeReference = 'TODAY' THEN @TodayVN ELSE @SnapDate END;

        DECLARE @HasPoPendingInSnapshot BIT = 0;
        IF EXISTS (SELECT 1 FROM dbo.fact_PO_Pending WHERE SnapshotDate = @SnapDate)
            SET @HasPoPendingInSnapshot = 1;

        -- =========================================================================
        -- RESULT SET 1: Cấu hình hệ thống & Metadata Ngày chốt
        -- =========================================================================
        SELECT
            CONVERT(VARCHAR(10), @SnapDate, 23) AS resolvedSnapshotDate,
            CONVERT(VARCHAR(10), ISNULL(@LatestSnapshotDate, @SnapDate), 23) AS latestSnapshotDate,
            CONVERT(VARCHAR(10), @TodayVN, 23) AS todayVn,
            @HasPoPendingInSnapshot AS hasPoPendingInSnapshot,
            c.ConfigID,
            c.StandardMonthDays,
            c.CriticalDays,
            c.WarningDays,
            c.OverstockDays,
            c.OverstockDaysLowUsage,
            c.LowUsageKgPerMonth,
            c.MinActiveDays,
            c.ActualWindowDays,
            c.PoLateMonths,
            c.PoAgeReference,
            c.DeliveryDays,
            c.BulkDeliveryKg,
            c.UnusedStockDays,
            c.ReorderCoverDays,
            c.UsageDeviationPct,
            c.StaleDataDays
        FROM dbo.cfg_System c
        WHERE c.ConfigID = 1;

        -- =========================================================================
        -- RESULT SET 2: Ngưỡng tồn kho ghi đè riêng theo cặp (cfg_Stock_Threshold)
        -- =========================================================================
        SELECT
            ThresholdID,
            FactoryID,
            MaterialID,
            WarningDays,
            OverstockDays,
            SafetyDays,
            DeliveryDays,
            DeliveryQtyKg,
            Note
        FROM dbo.cfg_Stock_Threshold;

        -- =========================================================================
        -- RESULT SET 3: Danh sách Cặp Nhà máy - Nguyên liệu đang theo dõi
        -- =========================================================================
        SELECT
            fm.PairID,
            fm.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            f.WarehouseCode,
            f.Region,
            fm.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            m.PackingSpec,
            m.BagKg,
            m.UOM,
            m.PIC,
            m.DisplayDecimals,
            fm.IsTracked,
            fm.IsActive
        FROM dbo.dim_Factory_Material fm
        INNER JOIN dbo.dim_Factory f ON fm.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON fm.MaterialID = m.MaterialID
        WHERE fm.IsTracked = 1
          AND fm.IsActive = 1
          AND f.IsActive = 1
          AND m.IsActive = 1
          AND (@FactoryID IS NULL OR fm.FactoryID = @FactoryID)
          AND (
              @FactoryScope = 'ALL'
              OR EXISTS (SELECT 1 FROM dbo.sys_User_Factory uf WHERE uf.UserID = @UserID AND uf.FactoryID = fm.FactoryID)
          )
        ORDER BY f.FactoryCode ASC, m.MaterialCode ASC;

        -- =========================================================================
        -- RESULT SET 4: Tồn kho thực tế SOH RAW tại ngày chốt C
        -- =========================================================================
        SELECT
            FactoryID,
            MaterialID,
            SohQtyKg
        FROM dbo.fact_Inventory_SOH
        WHERE SnapshotDate = @SnapDate;

        -- =========================================================================
        -- RESULT SET 5: Lượng tồn bị khóa đang có hiệu lực tại ngày chốt C
        -- =========================================================================
        SELECT
            FactoryID,
            MaterialID,
            SUM(BlockedKg) AS BlockedKg,
            COUNT(1) AS ActiveBlockCount
        FROM dbo.fact_Inventory_Block
        WHERE StartDate <= @SnapDate
          AND (EndDate IS NULL OR EndDate > @SnapDate)
        GROUP BY FactoryID, MaterialID;

        -- =========================================================================
        -- RESULT SET 6: Tiêu hao sản xuất (Movement MTD, ActiveDays tháng này & tháng trước, 60 ngày)
        -- =========================================================================
        ;WITH CurMonthMov AS (
            SELECT
                FactoryID,
                MaterialID,
                SnapshotDate,
                WipIssueKg,
                WipIssueKg - LAG(WipIssueKg, 1, 0) OVER (PARTITION BY FactoryID, MaterialID ORDER BY SnapshotDate ASC) AS DailyWipDelta,
                ROW_NUMBER() OVER (PARTITION BY FactoryID, MaterialID ORDER BY SnapshotDate DESC) AS rnDesc
            FROM dbo.fact_Inventory_Movement
            WHERE SnapshotDate >= @CurrentMonthStart AND SnapshotDate <= @SnapDate
        ),
        CurMonthAgg AS (
            SELECT
                FactoryID,
                MaterialID,
                MAX(CASE WHEN rnDesc = 1 THEN WipIssueKg ELSE 0 END) AS WipIssueMtdKg,
                SUM(CASE WHEN DailyWipDelta > 0 THEN 1 ELSE 0 END) AS ActiveDays
            FROM CurMonthMov
            GROUP BY FactoryID, MaterialID
        ),
        PrevMonthMov AS (
            SELECT
                FactoryID,
                MaterialID,
                SnapshotDate,
                WipIssueKg,
                WipIssueKg - LAG(WipIssueKg, 1, 0) OVER (PARTITION BY FactoryID, MaterialID ORDER BY SnapshotDate ASC) AS DailyWipDelta,
                ROW_NUMBER() OVER (PARTITION BY FactoryID, MaterialID ORDER BY SnapshotDate DESC) AS rnDesc
            FROM dbo.fact_Inventory_Movement
            WHERE SnapshotDate >= @PrevMonthStart AND SnapshotDate <= @PrevMonthEnd
        ),
        PrevMonthAgg AS (
            SELECT
                FactoryID,
                MaterialID,
                MAX(CASE WHEN rnDesc = 1 THEN WipIssueKg ELSE 0 END) AS PrevMonthWipIssueKg,
                SUM(CASE WHEN DailyWipDelta > 0 THEN 1 ELSE 0 END) AS PrevMonthActiveDays
            FROM PrevMonthMov
            GROUP BY FactoryID, MaterialID
        ),
        Window60Agg AS (
            SELECT
                FactoryID,
                MaterialID,
                MAX(WipIssueKg) AS MaxWipInWindowKg
            FROM dbo.fact_Inventory_Movement
            WHERE SnapshotDate >= DATEADD(DAY, -@UnusedStockDays, @SnapDate)
              AND SnapshotDate <= @SnapDate
            GROUP BY FactoryID, MaterialID
        ),
        AllMovPairs AS (
            SELECT FactoryID, MaterialID FROM CurMonthAgg
            UNION
            SELECT FactoryID, MaterialID FROM PrevMonthAgg
            UNION
            SELECT FactoryID, MaterialID FROM Window60Agg
        )
        SELECT
            p.FactoryID,
            p.MaterialID,
            ISNULL(c.WipIssueMtdKg, 0) AS WipIssueMtdKg,
            ISNULL(c.ActiveDays, 0) AS ActiveDays,
            ISNULL(pr.PrevMonthWipIssueKg, 0) AS PrevMonthWipIssueKg,
            ISNULL(pr.PrevMonthActiveDays, 0) AS PrevMonthActiveDays,
            CASE WHEN ISNULL(w.MaxWipInWindowKg, 0) > 0 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasWipIssueInWindow
        FROM AllMovPairs p
        LEFT JOIN CurMonthAgg c ON p.FactoryID = c.FactoryID AND p.MaterialID = c.MaterialID
        LEFT JOIN PrevMonthAgg pr ON p.FactoryID = pr.FactoryID AND p.MaterialID = pr.MaterialID
        LEFT JOIN Window60Agg w ON p.FactoryID = w.FactoryID AND p.MaterialID = w.MaterialID;

        -- =========================================================================
        -- RESULT SET 7: Dự báo Forecast mới nhất có VersionDate <= C cho tháng hiện tại
        -- =========================================================================
        ;WITH RankedForecast AS (
            SELECT
                FactoryID,
                MaterialID,
                ForecastKg,
                VersionDate,
                ROW_NUMBER() OVER (
                    PARTITION BY FactoryID, MaterialID
                    ORDER BY VersionDate DESC, ForecastID DESC
                ) AS rn
            FROM dbo.fact_Demand_Forecast
            WHERE PeriodMonth = @CurrentMonthStart
              AND VersionDate <= DATEADD(SECOND, 86399, CAST(@SnapDate AS DATETIME2(0)))
        )
        SELECT
            FactoryID,
            MaterialID,
            ForecastKg,
            CONVERT(VARCHAR(19), VersionDate, 126) AS VersionDate
        FROM RankedForecast
        WHERE rn = 1;

        -- =========================================================================
        -- RESULT SET 8: Nhu cầu tháng sửa tay (Demand Override) hiệu lực tại C
        -- =========================================================================
        ;WITH RankedOverride AS (
            SELECT
                OverrideID,
                FactoryID,
                MaterialID,
                OverrideKg,
                EffectiveDate,
                Reason,
                CreatedAt,
                CreatedBy,
                ROW_NUMBER() OVER (
                    PARTITION BY FactoryID, MaterialID
                    ORDER BY EffectiveDate DESC, CreatedAt DESC, OverrideID DESC
                ) AS rn
            FROM dbo.fact_Demand_Override
            WHERE PeriodMonth = @CurrentMonthStart
              AND EffectiveDate <= @SnapDate
        )
        SELECT
            OverrideID,
            FactoryID,
            MaterialID,
            OverrideKg,
            CONVERT(VARCHAR(10), EffectiveDate, 23) AS EffectiveDate,
            Reason,
            CreatedAt,
            CreatedBy
        FROM RankedOverride
        WHERE rn = 1;

        -- =========================================================================
        -- RESULT SET 9: Tổng hợp PO Pending tại ngày chốt C
        -- =========================================================================
        SELECT
            FactoryID,
            MaterialID,
            SUM(DeliverRemainderKg) AS PoPendingKg,
            COUNT(1) AS PoPendingCount,
            SUM(CASE WHEN DeliveryDate <= DATEADD(MONTH, -@PoLateMonths, @PoRefDate) THEN 1 ELSE 0 END) AS LatePoCount,
            CONVERT(VARCHAR(10), MIN(DeliveryDate), 23) AS EarliestPoDate
        FROM dbo.fact_PO_Pending
        WHERE SnapshotDate = @SnapDate
          AND DeliverRemainderKg > 0
        GROUP BY FactoryID, MaterialID;

        -- =========================================================================
        -- RESULT SET 10: Tổng hợp Hàng đi đường điều chuyển nội bộ (TO In-Transit)
        -- =========================================================================
        SELECT
            ToFactoryID AS FactoryID,
            MaterialID,
            SUM(ShippedQtyKg) AS TransitInKg,
            COUNT(1) AS TransitCount
        FROM dbo.fact_Internal_Transfer
        WHERE TransferStatus <> 'Created'
          AND ToFactoryID IS NOT NULL
          AND ShippedDate <= @SnapDate
          AND (ReceivedDate IS NULL OR ReceivedDate > @SnapDate)
        GROUP BY ToFactoryID, MaterialID;

        -- =========================================================================
        -- RESULT SET 11: Cảnh báo chất lượng dữ liệu tại ngày chốt C
        -- =========================================================================
        SELECT
            FactoryID,
            MaterialID,
            IssueType,
            Severity,
            Description
        FROM dbo.sys_Data_Quality_Issue
        WHERE SnapshotDate = @SnapDate;

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

-- =====================================================================================
-- 3. dbo.usp_Position_GetPairDetail
-- Lấy chi tiết chuyên sâu của 1 cặp (FactoryID, MaterialID) tại ngày chốt @SnapshotDate
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Position_GetPairDetail
    @FactoryID INT,
    @MaterialID INT,
    @SnapshotDate VARCHAR(20) = NULL,
    @UserID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        DECLARE @LatestSnapshotDate DATE = (SELECT MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH);
        DECLARE @SnapDate DATE = TRY_CONVERT(DATE, @SnapshotDate);
        IF @SnapDate IS NULL
            SET @SnapDate = ISNULL(@LatestSnapshotDate, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE));

        -- Kiểm tra quyền phạm vi nhà máy (Default Deny)
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

        IF @FactoryScope = 'ASSIGNED'
           AND NOT EXISTS (SELECT 1 FROM dbo.sys_User_Factory WHERE UserID = @UserID AND FactoryID = @FactoryID)
        BEGIN
            THROW 50403, N'[50403] Bạn không có quyền xem vị thế của nhà máy này.', 1;
        END;

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = @FactoryID)
           OR NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = @MaterialID)
        BEGIN
            THROW 50404, N'[50404] Không tìm thấy cặp Nhà máy - Nguyên liệu yêu cầu.', 1;
        END;

        DECLARE @CurrentMonthStart DATE = DATEFROMPARTS(YEAR(@SnapDate), MONTH(@SnapDate), 1);
        DECLARE @PoLateMonths INT = 3;
        DECLARE @PoAgeReference VARCHAR(10) = 'SNAPSHOT';
        SELECT @PoLateMonths = PoLateMonths, @PoAgeReference = PoAgeReference FROM dbo.cfg_System WHERE ConfigID = 1;

        DECLARE @TodayVN DATE = CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE);
        DECLARE @PoRefDate DATE = CASE WHEN @PoAgeReference = 'TODAY' THEN @TodayVN ELSE @SnapDate END;

        -- Result Set 1: Thông tin cặp & Ngưỡng cấu hình
        SELECT
            CONVERT(VARCHAR(10), @SnapDate, 23) AS snapshotDate,
            f.FactoryID AS factoryId,
            f.FactoryCode AS factoryCode,
            f.FactoryName AS factoryName,
            f.Region AS region,
            m.MaterialID AS materialId,
            m.MaterialCode AS materialCode,
            m.MaterialName AS materialName,
            m.Category AS category,
            m.ItemGroup AS itemGroup,
            m.PackingSpec AS packingSpec,
            m.BagKg AS bagKg,
            m.UOM AS uom,
            m.PIC AS pic,
            m.DisplayDecimals AS displayDecimals,
            ISNULL(fm.IsTracked, 0) AS isTracked,
            t.WarningDays AS overrideWarningDays,
            t.OverstockDays AS overrideOverstockDays,
            t.SafetyDays AS overrideSafetyDays,
            t.DeliveryDays AS overrideDeliveryDays,
            t.DeliveryQtyKg AS overrideDeliveryQtyKg,
            t.Note AS thresholdNote
        FROM dbo.dim_Factory f
        CROSS JOIN dbo.dim_Material m
        LEFT JOIN dbo.dim_Factory_Material fm ON fm.FactoryID = f.FactoryID AND fm.MaterialID = m.MaterialID
        LEFT JOIN dbo.cfg_Stock_Threshold t ON t.FactoryID = f.FactoryID AND t.MaterialID = m.MaterialID
        WHERE f.FactoryID = @FactoryID AND m.MaterialID = @MaterialID;

        -- Result Set 2: Chi tiết các dòng PO Pending tại ngày chốt C
        SELECT
            p.PoPendingID AS poPendingId,
            p.PONumber AS poNumber,
            p.DocType AS docType,
            CONVERT(VARCHAR(10), p.DeliveryDate, 23) AS deliveryDate,
            p.VendorAccount AS vendorAccount,
            ISNULL(s.SupplierName, p.VendorAccount) AS supplierName,
            ISNULL(s.LeadTimeDays, 7) AS leadTimeDays,
            p.OrderQtyKg AS orderQtyKg,
            p.ReceivedQtyKg AS receivedQtyKg,
            p.DeliverRemainderKg AS deliverRemainderKg,
            p.LineStatus AS lineStatus,
            DATEDIFF(DAY, p.DeliveryDate, @PoRefDate) AS ageDays,
            CASE WHEN p.DeliveryDate <= DATEADD(MONTH, -@PoLateMonths, @PoRefDate) THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS isLate
        FROM dbo.fact_PO_Pending p
        LEFT JOIN dbo.dim_Supplier s ON p.VendorAccount = s.SupplierCode
        WHERE p.SnapshotDate = @SnapDate
          AND p.FactoryID = @FactoryID
          AND p.MaterialID = @MaterialID
          AND p.DeliverRemainderKg > 0
        ORDER BY p.DeliveryDate ASC, p.PONumber ASC;

        -- Result Set 3: Chi tiết các lệnh điều chuyển nội bộ (TO) đang đi đường đến nhà máy
        SELECT
            tr.TransferID AS transferId,
            tr.TransferNumber AS transferNumber,
            tr.FromWarehouse AS fromWarehouse,
            ff.FactoryCode AS fromFactoryCode,
            tr.ToWarehouse AS toWarehouse,
            tf.FactoryCode AS toFactoryCode,
            tr.TransferStatus AS transferStatus,
            CONVERT(VARCHAR(10), tr.ShippedDate, 23) AS shippedDate,
            CONVERT(VARCHAR(10), tr.ReceivedDate, 23) AS receivedDate,
            tr.ShippedQtyKg AS shippedQtyKg,
            tr.PostedQtyKg AS postedQtyKg
        FROM dbo.fact_Internal_Transfer tr
        LEFT JOIN dbo.dim_Factory ff ON tr.FromFactoryID = ff.FactoryID
        LEFT JOIN dbo.dim_Factory tf ON tr.ToFactoryID = tf.FactoryID
        WHERE tr.ToFactoryID = @FactoryID
          AND tr.MaterialID = @MaterialID
          AND tr.TransferStatus <> 'Created'
          AND tr.ShippedDate <= @SnapDate
          AND (tr.ReceivedDate IS NULL OR tr.ReceivedDate > @SnapDate)
        ORDER BY tr.ShippedDate ASC, tr.TransferNumber ASC;

        -- Result Set 4: Các phiếu nhận hàng thực tế (POR) trong tháng của ngày chốt
        SELECT
            r.ReceiptID AS receiptId,
            r.ReceiptNumber AS receiptNumber,
            r.PONumber AS poNumber,
            r.PAGNumber AS pagNumber,
            CONVERT(VARCHAR(10), r.DeliveryDate, 23) AS deliveryDate,
            r.ReceivedQtyKg AS receivedQtyKg,
            s.SupplierCode AS supplierCode,
            s.SupplierName AS supplierName,
            r.TruckNumber AS truckNumber
        FROM dbo.fact_PO_Receipt r
        LEFT JOIN dbo.dim_Supplier s ON r.SupplierID = s.SupplierID
        WHERE r.FactoryID = @FactoryID
          AND r.MaterialID = @MaterialID
          AND r.DeliveryDate >= @CurrentMonthStart
        ORDER BY r.DeliveryDate DESC, r.ReceiptNumber DESC;

        -- Result Set 5: Các lệnh khóa hàng đang có hiệu lực tại C
        SELECT
            b.BlockID AS blockId,
            b.BlockedKg AS blockedKg,
            CONVERT(VARCHAR(10), b.StartDate, 23) AS startDate,
            CONVERT(VARCHAR(10), b.EndDate, 23) AS endDate,
            b.Reason AS reason,
            b.CreatedBy AS createdBy,
            b.CreatedAt AS createdAt
        FROM dbo.fact_Inventory_Block b
        WHERE b.FactoryID = @FactoryID
          AND b.MaterialID = @MaterialID
          AND b.StartDate <= @SnapDate
          AND (b.EndDate IS NULL OR b.EndDate > @SnapDate)
        ORDER BY b.StartDate DESC, b.BlockID DESC;

        -- Result Set 6: Lịch sử Movement MTD trong tháng của ngày chốt
        SELECT
            CONVERT(VARCHAR(10), mv.SnapshotDate, 23) AS snapshotDate,
            mv.BeginOnhandKg AS beginOnhandKg,
            mv.QtyReceiveKg AS qtyReceiveKg,
            mv.WipIssueKg AS wipIssueKg,
            mv.TransferInKg AS transferInKg,
            mv.TransferOutKg AS transferOutKg,
            mv.AdjustKg AS adjustKg,
            mv.ClosedOnhandKg AS closedOnhandKg
        FROM dbo.fact_Inventory_Movement mv
        WHERE mv.FactoryID = @FactoryID
          AND mv.MaterialID = @MaterialID
          AND mv.SnapshotDate >= @CurrentMonthStart
          AND mv.SnapshotDate <= @SnapDate
        ORDER BY mv.SnapshotDate ASC;

        -- Result Set 7: Lịch sử Demand Override trong tháng của ngày chốt
        SELECT
            ov.OverrideID AS overrideId,
            CONVERT(VARCHAR(10), ov.PeriodMonth, 23) AS periodMonth,
            CONVERT(VARCHAR(10), ov.EffectiveDate, 23) AS effectiveDate,
            ov.OverrideKg AS overrideKg,
            ov.Reason AS reason,
            ov.CreatedBy AS createdBy,
            ov.CreatedAt AS createdAt
        FROM dbo.fact_Demand_Override ov
        WHERE ov.FactoryID = @FactoryID
          AND ov.MaterialID = @MaterialID
          AND ov.PeriodMonth = @CurrentMonthStart
        ORDER BY ov.EffectiveDate DESC, ov.CreatedAt DESC, ov.OverrideID DESC;

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
