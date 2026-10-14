-- =====================================================================================
-- PHÂN HỆ F07b: THUẬT TOÁN GHÉP CHUYẾN XE TẢI THEO NHÀ CUNG CẤP (JRP CONSOLIDATION - BR-36b)
-- File: database/stored_procedures/15_consolidation_procedures.sql
-- =====================================================================================

USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- =====================================================================================
-- dbo.usp_DeliveryPlan_GetConsolidationData
-- Lấy toàn bộ dữ liệu cần thiết cho Engine ghép chuyến FTL theo NCC:
--   Set 1: Thông tin Nhà máy & Tuần
--   Set 2: Danh sách cặp NM-NL kèm NCC mặc định, SOH, Tiêu hao ngày (d), Ngưỡng Min/Max/Safety
--   Set 3: Danh sách PO Pending còn mở (DeliverRemainderKg > 0)
--   Set 4: Kế hoạch tuần đã lưu trước đó (nếu có)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_DeliveryPlan_GetConsolidationData
    @UserID INT,
    @FactoryID INT,
    @WeekStartDate VARCHAR(20),
    @MaterialID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    BEGIN TRY
        -- 1. Kiểm tra quyền hạn phạm vi Nhà máy của User (Default Deny)
        DECLARE @FactoryScope VARCHAR(20) = NULL;
        SELECT @FactoryScope = r.FactoryScope
        FROM dbo.sys_User u
        INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
        WHERE u.UserID = @UserID AND u.IsActive = 1;

        IF @FactoryScope IS NULL
        BEGIN
            THROW 50401, N'[50401] Người dùng không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        IF @FactoryScope = 'ASSIGNED'
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM dbo.sys_User_Factory
                WHERE UserID = @UserID AND FactoryID = @FactoryID
            )
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền truy cập dữ liệu kế hoạch của nhà máy này.', 1;
            END
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = @FactoryID)
        BEGIN
            THROW 50404, N'[50404] Nhà máy không tồn tại.', 1;
        END

        DECLARE @WeekStart DATE = TRY_CONVERT(DATE, @WeekStartDate);
        IF @WeekStart IS NULL
        BEGIN
            THROW 50400, N'[50400] Ngày bắt đầu tuần (WeekStartDate) không đúng định dạng YYYY-MM-DD.', 1;
        END

        DECLARE @WeekEnd DATE = DATEADD(DAY, 6, @WeekStart);

        DECLARE @LatestSnapshot DATE;
        SELECT @LatestSnapshot = MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH;

        -- Result Set 1: Metadata Nhà máy & Tuần
        SELECT
            f.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            CONVERT(VARCHAR(10), @WeekStart, 23) AS WeekStartDate,
            CONVERT(VARCHAR(10), @WeekEnd, 23) AS WeekEndDate,
            ISNULL(CONVERT(VARCHAR(10), @LatestSnapshot, 23), CONVERT(VARCHAR(10), @WeekStart, 23)) AS LatestSnapshotDate
        FROM dbo.dim_Factory f
        WHERE f.FactoryID = @FactoryID;

        -- Xác định nhà cung cấp gần nhất cho từng cặp (FactoryID, MaterialID)
        WITH RecentPoSuppliers AS (
            SELECT
                po.FactoryID,
                po.MaterialID,
                s.SupplierID,
                s.SupplierCode,
                s.SupplierName,
                ISNULL(s.LeadTimeDays, 7) AS LeadTimeDays,
                ROW_NUMBER() OVER(PARTITION BY po.FactoryID, po.MaterialID ORDER BY po.DeliveryDate DESC, po.PoPendingID DESC) AS rn
            FROM dbo.fact_PO_Pending po
            INNER JOIN dbo.dim_Supplier s ON po.VendorAccount = s.SupplierCode
            WHERE po.FactoryID = @FactoryID
        ),
        RecentReceiptSuppliers AS (
            SELECT
                pr.FactoryID,
                pr.MaterialID,
                s.SupplierID,
                s.SupplierCode,
                s.SupplierName,
                ISNULL(s.LeadTimeDays, 7) AS LeadTimeDays,
                ROW_NUMBER() OVER(PARTITION BY pr.FactoryID, pr.MaterialID ORDER BY pr.DeliveryDate DESC, pr.ReceiptID DESC) AS rn
            FROM dbo.fact_PO_Receipt pr
            INNER JOIN dbo.dim_Supplier s ON pr.SupplierID = s.SupplierID
            WHERE pr.FactoryID = @FactoryID
        ),
        FirstActiveSupplier AS (
            SELECT TOP 1
                SupplierID,
                SupplierCode,
                SupplierName,
                ISNULL(LeadTimeDays, 7) AS LeadTimeDays
            FROM dbo.dim_Supplier
            WHERE IsActive = 1
            ORDER BY SupplierID ASC
        ),
        SystemCfg AS (
            SELECT TOP 1
                CriticalDays,
                WarningDays,
                OverstockDays,
                ISNULL(StandardMonthDays, 28) AS StandardMonthDays,
                ISNULL(DeliveryDays, 7) AS DeliveryDays,
                ISNULL(BulkDeliveryKg, 30000) AS BulkDeliveryKg
            FROM dbo.cfg_System
            WHERE ConfigID = 1
        ),
        -- Tiêu hao ngày từ Dự báo nhu cầu hoặc Điều chỉnh nhu cầu (BR-05, BR-08, BR-14)
        LatestForecastVersion AS (
            SELECT
                df.MaterialID,
                df.ForecastKg,
                ROW_NUMBER() OVER(PARTITION BY df.MaterialID ORDER BY df.VersionDate DESC, df.ForecastID DESC) AS rn
            FROM dbo.fact_Demand_Forecast df
            WHERE df.FactoryID = @FactoryID
              AND df.PeriodMonth = DATEFROMPARTS(YEAR(@WeekStart), MONTH(@WeekStart), 1)
              AND df.VersionDate <= ISNULL(@LatestSnapshot, '2099-12-31')
        ),
        ActiveDemandOverride AS (
            SELECT
                ov.MaterialID,
                ov.OverrideKg,
                ROW_NUMBER() OVER(PARTITION BY ov.MaterialID ORDER BY ov.EffectiveDate DESC, ov.OverrideID DESC) AS rn
            FROM dbo.fact_Demand_Override ov
            WHERE ov.FactoryID = @FactoryID
              AND ov.PeriodMonth = DATEFROMPARTS(YEAR(@WeekStart), MONTH(@WeekStart), 1)
              AND ov.EffectiveDate <= ISNULL(@LatestSnapshot, '2099-12-31')
        ),
        ForecastDemand AS (
            SELECT
                m.MaterialID,
                CAST(ROUND(
                    COALESCE(
                        ov.OverrideKg,
                        lf.ForecastKg,
                        0.0
                    ) / CAST(sys.StandardMonthDays AS DECIMAL(18,2)),
                    2
                ) AS DECIMAL(18,2)) AS DailyDemandKg
            FROM dbo.dim_Material m
            CROSS JOIN SystemCfg sys
            LEFT JOIN LatestForecastVersion lf ON m.MaterialID = lf.MaterialID AND lf.rn = 1
            LEFT JOIN ActiveDemandOverride ov ON m.MaterialID = ov.MaterialID AND ov.rn = 1
        ),
        -- Tồn kho bị khóa (nếu có)
        BlockedStock AS (
            SELECT
                ib.MaterialID,
                ISNULL(SUM(ib.BlockedKg), 0) AS BlockedQtyKg
            FROM dbo.fact_Inventory_Block ib
            WHERE ib.FactoryID = @FactoryID
              AND ib.ReleasedAt IS NULL
              AND (ib.EndDate IS NULL OR ib.EndDate >= @WeekStart)
            GROUP BY ib.MaterialID
        )
        -- Result Set 2: Cặp NM-NL, thông số SOH, tiêu hao, ngưỡng và NCC mặc định
        SELECT
            fm.FactoryID,
            fm.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            ISNULL(m.BagKg, 25) AS BagKg,
            ISNULL(m.DisplayDecimals, 2) AS DisplayDecimals,
            COALESCE(pos.SupplierID, prs.SupplierID, fs.SupplierID, 1) AS SupplierID,
            COALESCE(pos.SupplierCode, prs.SupplierCode, fs.SupplierCode, 'SUP-DEFAULT') AS SupplierCode,
            COALESCE(pos.SupplierName, prs.SupplierName, fs.SupplierName, N'Nhà cung cấp chính') AS SupplierName,
            COALESCE(pos.LeadTimeDays, prs.LeadTimeDays, fs.LeadTimeDays, 7) AS LeadTimeDays,
            -- Tồn kho khả dụng = SOH - Blocked
            ISNULL(soh.SohQtyKg, 0) - ISNULL(blk.BlockedQtyKg, 0) AS CurrentSohKg,
            -- Tiêu hao ngày trung bình (d) theo BR-05, BR-08
            ISNULL(fc.DailyDemandKg, 0.0) AS DailyDemandKg,
            -- Ngưỡng tồn kho từ bảng cấu hình hoặc hệ thống
            ISNULL(th.SafetyDays, sys.CriticalDays) AS SafetyDays,
            ISNULL(th.WarningDays, sys.WarningDays) AS WarningDays,
            ISNULL(th.OverstockDays, sys.OverstockDays) AS OverstockDays,
            ISNULL(th.DeliveryDays, sys.DeliveryDays) AS DeliveryDays,
            ISNULL(th.DeliveryQtyKg, 0) AS DeliveryQtyKg
        FROM dbo.dim_Factory_Material fm
        INNER JOIN dbo.dim_Material m ON fm.MaterialID = m.MaterialID
        CROSS JOIN SystemCfg sys
        LEFT JOIN RecentPoSuppliers pos ON fm.FactoryID = pos.FactoryID AND fm.MaterialID = pos.MaterialID AND pos.rn = 1
        LEFT JOIN RecentReceiptSuppliers prs ON fm.FactoryID = prs.FactoryID AND fm.MaterialID = prs.MaterialID AND prs.rn = 1
        CROSS JOIN FirstActiveSupplier fs
        LEFT JOIN dbo.fact_Inventory_SOH soh ON fm.FactoryID = soh.FactoryID AND fm.MaterialID = soh.MaterialID AND soh.SnapshotDate = @LatestSnapshot
        LEFT JOIN BlockedStock blk ON fm.MaterialID = blk.MaterialID
        LEFT JOIN ForecastDemand fc ON fm.MaterialID = fc.MaterialID
        LEFT JOIN dbo.cfg_Stock_Threshold th ON fm.FactoryID = th.FactoryID AND fm.MaterialID = th.MaterialID
        WHERE fm.FactoryID = @FactoryID
          AND fm.IsTracked = 1
          AND fm.IsActive = 1
          AND (@MaterialID IS NULL OR fm.MaterialID = @MaterialID)
        ORDER BY fm.MaterialID;

        -- Result Set 3: Danh sách PO Pending còn mở (DeliverRemainderKg > 0)
        SELECT
            po.PoPendingID,
            po.FactoryID,
            po.MaterialID,
            s.SupplierID,
            po.VendorAccount AS SupplierCode,
            ISNULL(s.SupplierName, po.VendorAccount) AS SupplierName,
            po.PONumber,
            po.DocType,
            po.OrderQtyKg,
            po.DeliverRemainderKg,
            CONVERT(VARCHAR(10), po.DeliveryDate, 23) AS DeliveryDate
        FROM dbo.fact_PO_Pending po
        LEFT JOIN dbo.dim_Supplier s ON po.VendorAccount = s.SupplierCode
        WHERE po.FactoryID = @FactoryID
          AND po.SnapshotDate = @LatestSnapshot
          AND po.DeliverRemainderKg > 0
          AND (@MaterialID IS NULL OR po.MaterialID = @MaterialID)
        ORDER BY po.MaterialID, po.DeliveryDate ASC, po.PoPendingID ASC;

        -- Result Set 4: Kế hoạch tuần hiện hữu đã lưu trong fact_Delivery_Plan (để giữ hoặc đối chiếu)
        SELECT
            dp.PlanID,
            CONVERT(VARCHAR(10), dp.PlanDate, 23) AS PlanDate,
            dp.FactoryID,
            dp.MaterialID,
            dp.SupplierID,
            dp.PONumber,
            dp.PlanQtyKg,
            dp.Note
        FROM dbo.fact_Delivery_Plan dp
        WHERE dp.FactoryID = @FactoryID
          AND dp.PlanDate BETWEEN @WeekStart AND @WeekEnd
          AND (@MaterialID IS NULL OR dp.MaterialID = @MaterialID)
        ORDER BY dp.PlanDate, dp.MaterialID;

    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
