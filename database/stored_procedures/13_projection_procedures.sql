-- =====================================================================================
-- MODULE F04c: 28-DAY INVENTORY PROJECTION & DELIVERY SUGGESTION PROCEDURES (BR-34, BR-36)
-- File: database/stored_procedures/13_projection_procedures.sql
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- =====================================================================================
-- 1. dbo.usp_Position_GetProjectionData
-- Lấy toàn bộ dữ liệu thô phục vụ Engine Dự phóng tồn 28 ngày (2 tầng) & Gợi ý lịch giao
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Position_GetProjectionData
    @FactoryID INT,
    @MaterialID INT,
    @SnapshotDate VARCHAR(20) = NULL,
    @UserID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        -- 1. Xác định ngày chốt C
        DECLARE @LatestSnapshotDate DATE = (SELECT MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH);
        DECLARE @SnapDate DATE = TRY_CONVERT(DATE, @SnapshotDate);
        IF @SnapDate IS NULL
            SET @SnapDate = ISNULL(@LatestSnapshotDate, CAST(DATEADD(HOUR, 7, SYSUTCDATETIME()) AS DATE));

        -- 2. Kiểm tra phân quyền phạm vi nhà máy (Role FACTORY với scope ASSIGNED)
        IF @UserID IS NOT NULL
        BEGIN
            DECLARE @FactoryScope VARCHAR(10) = 'ALL';
            SELECT @FactoryScope = r.FactoryScope
            FROM dbo.sys_User u
            INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
            WHERE u.UserID = @UserID;

            IF @FactoryScope = 'ASSIGNED'
               AND NOT EXISTS (SELECT 1 FROM dbo.sys_User_Factory WHERE UserID = @UserID AND FactoryID = @FactoryID)
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền truy cập dữ liệu dự phóng của nhà máy này.', 1;
            END;
        END;

        -- 3. Kiểm tra Nhà máy & Nguyên liệu tồn tại
        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = @FactoryID)
           OR NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = @MaterialID)
        BEGIN
            THROW 50404, N'[50404] Không tìm thấy cặp Nhà máy - Nguyên liệu yêu cầu.', 1;
        END;

        DECLARE @DateFrom DATE = DATEADD(DAY, 1, @SnapDate);
        DECLARE @DateTo DATE = DATEADD(DAY, 28, @SnapDate);

        -- =============================================================================
        -- RESULT SET 1: Thông tin Cặp, Quy cách bao & Cấu hình Ngưỡng (Thresholds)
        -- =============================================================================
        SELECT
            CONVERT(VARCHAR(10), @SnapDate, 23) AS snapshotDate,
            CONVERT(VARCHAR(10), @DateFrom, 23) AS projectionStartDate,
            CONVERT(VARCHAR(10), @DateTo, 23) AS projectionEndDate,
            f.FactoryID AS factoryId,
            f.FactoryCode AS factoryCode,
            f.FactoryName AS factoryName,
            m.MaterialID AS materialId,
            m.MaterialCode AS materialCode,
            m.MaterialName AS materialName,
            m.Category AS category,
            m.ItemGroup AS itemGroup,
            ISNULL(m.BagKg, 25) AS bagKg,
            m.PackingSpec AS packingSpec,
            m.DisplayDecimals AS displayDecimals,
            -- Ngưỡng cấu hình riêng của cặp
            t.WarningDays AS overrideWarningDays,
            t.OverstockDays AS overrideOverstockDays,
            t.SafetyDays AS overrideSafetyDays,
            t.DeliveryDays AS overrideDeliveryDays,
            t.DeliveryQtyKg AS overrideDeliveryQtyKg,
            -- Ngưỡng mặc định toàn hệ thống
            cfg.CriticalDays AS defaultCriticalDays,
            cfg.WarningDays AS defaultWarningDays,
            cfg.OverstockDays AS defaultOverstockDays,
            ISNULL(t.SafetyDays, cfg.CriticalDays) AS effectiveSafetyDays,
            cfg.DeliveryDays AS defaultDeliveryDays,
            cfg.BulkDeliveryKg AS defaultBulkDeliveryKg
        FROM dbo.dim_Factory f
        CROSS JOIN dbo.dim_Material m
        CROSS JOIN (SELECT TOP 1 CriticalDays, WarningDays, OverstockDays, DeliveryDays, BulkDeliveryKg FROM dbo.cfg_System WHERE ConfigID = 1) cfg
        LEFT JOIN dbo.cfg_Stock_Threshold t ON t.FactoryID = f.FactoryID AND t.MaterialID = m.MaterialID
        WHERE f.FactoryID = @FactoryID AND m.MaterialID = @MaterialID;

        -- =============================================================================
        -- RESULT SET 2: Kế hoạch Giao hàng đã lưu trên lưới (Tầng 1) trong 28 ngày
        -- =============================================================================
        SELECT
            dp.PlanID AS planId,
            CONVERT(VARCHAR(10), dp.PlanDate, 23) AS planDate,
            dp.PONumber AS poNumber,
            dp.SupplierID AS supplierId,
            s.SupplierCode AS supplierCode,
            s.SupplierName AS supplierName,
            dp.PlanQtyKg AS planQtyKg,
            CAST(dp.PlanQtyKg / 1000.0 AS DECIMAL(18,3)) AS planQtyTons,
            dp.Note AS note
        FROM dbo.fact_Delivery_Plan dp
        LEFT JOIN dbo.dim_Supplier s ON dp.SupplierID = s.SupplierID
        WHERE dp.FactoryID = @FactoryID
          AND dp.MaterialID = @MaterialID
          AND dp.PlanDate >= @DateFrom
          AND dp.PlanDate <= @DateTo
        ORDER BY dp.PlanDate ASC, dp.PlanID ASC;

        -- =============================================================================
        -- RESULT SET 3: Lệnh Điều chuyển nội bộ (TO) đang đi đường đến nhà máy (BR-34)
        -- (Cộng toàn bộ vào ngày C+1)
        -- =============================================================================
        SELECT
            tr.TransferID AS transferId,
            tr.TransferNumber AS transferNumber,
            tr.FromWarehouse AS fromWarehouse,
            ff.FactoryCode AS fromFactoryCode,
            CONVERT(VARCHAR(10), tr.ShippedDate, 23) AS shippedDate,
            tr.ShippedQtyKg AS shippedQtyKg,
            CAST(tr.ShippedQtyKg / 1000.0 AS DECIMAL(18,3)) AS shippedQtyTons,
            tr.TransferStatus AS transferStatus
        FROM dbo.fact_Internal_Transfer tr
        LEFT JOIN dbo.dim_Factory ff ON tr.FromFactoryID = ff.FactoryID
        WHERE tr.ToFactoryID = @FactoryID
          AND tr.MaterialID = @MaterialID
          AND tr.TransferStatus <> 'Created'
          AND tr.ShippedDate <= @SnapDate
          AND (tr.ReceivedDate IS NULL OR tr.ReceivedDate > @SnapDate)
        ORDER BY tr.ShippedDate ASC, tr.TransferNumber ASC;

        -- =============================================================================
        -- RESULT SET 4: PO Pending còn lượng dư tại C (Nguồn đề xuất Tầng 2 & FIFO BR-36)
        -- =============================================================================
        SELECT
            p.PoPendingID AS poPendingId,
            p.PONumber AS poNumber,
            p.DocType AS docType,
            CONVERT(VARCHAR(10), p.DeliveryDate, 23) AS deliveryDate,
            p.VendorAccount AS vendorAccount,
            ISNULL(s.SupplierName, p.VendorAccount) AS supplierName,
            s.SupplierID AS supplierId,
            s.SupplierCode AS supplierCode,
            ISNULL(s.LeadTimeDays, 7) AS leadTimeDays,
            p.OrderQtyKg AS orderQtyKg,
            p.ReceivedQtyKg AS receivedQtyKg,
            p.DeliverRemainderKg AS deliverRemainderKg,
            CAST(p.DeliverRemainderKg / 1000.0 AS DECIMAL(18,3)) AS deliverRemainderTons,
            p.LineStatus AS lineStatus
        FROM dbo.fact_PO_Pending p
        LEFT JOIN dbo.dim_Supplier s ON p.VendorAccount = s.SupplierCode
        WHERE p.SnapshotDate = @SnapDate
          AND p.FactoryID = @FactoryID
          AND p.MaterialID = @MaterialID
          AND p.DeliverRemainderKg > 0
        ORDER BY p.DeliveryDate ASC, p.PoPendingID ASC;

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
