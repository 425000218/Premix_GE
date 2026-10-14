-- =====================================================================================
-- STORED PROCEDURES: PHÂN HỆ NẠP DỮ LIỆU GIAO DỊCH ERP & DỰ BÁO NHU CẦU (F03b)
-- Phân hệ: F03b - Nạp Bộ 5 File Ngày Chốt (Daily Set) & Forecast (RM Usage)
-- Giao dịch nguyên tử: Single Atomic Transaction (BR-17)
-- Kiểm soát chất lượng: BR-21 (Chặn mã lạ), BR-21a (Cặp ngoài Master), BR-15d (5 kiểm chéo)
-- Phiên bản: 1.0 (SQL Server 2019+ / Compatibility 150)
-- =====================================================================================

USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- =====================================================================================
-- 1. dbo.usp_Import_DailySet
-- Nạp đồng thời 5 file ERP (On Hand, Movement, PO Pending, PO Receipt, Transfer Order)
-- trong 1 Transaction duy nhất và chạy 5 bài kiểm tra chéo BR-15d
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Import_DailySet
    @SnapshotDate DATE,
    @CutoffDate DATE = NULL,
    @PorStartDate DATE = NULL,
    @PorEndDate DATE = NULL,
    @OnHandJson NVARCHAR(MAX),
    @MovementJson NVARCHAR(MAX),
    @PoPendingJson NVARCHAR(MAX),
    @PoReceiptJson NVARCHAR(MAX),
    @TransferJson NVARCHAR(MAX),
    @OriginalFileName NVARCHAR(255),
    @FileHash VARCHAR(64),
    @ImportedBy NVARCHAR(50),
    @DryRun BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @CutoffDate IS NULL
        SET @CutoffDate = DATEADD(DAY, 1, @SnapshotDate);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- ---------------------------------------------------------------------------------
        -- BƯỚC 1: ĐỌC DỮ LIỆU JSON VÀO CÁC BẢNG TẠM (#Staging*)
        -- Sử dụng COLLATE DATABASE_DEFAULT để tránh xung đột bảng mã với tempdb
        -- ---------------------------------------------------------------------------------

        -- 1.1. On Hand (Bao gồm cả RAW và TRANSIT)
        CREATE TABLE #StagingOnHand (
            OrgCode NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            SubInv VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            ItemCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            SohQtyKg DECIMAL(18,0) NOT NULL
        );

        INSERT INTO #StagingOnHand (OrgCode, SubInv, ItemCode, SohQtyKg)
        SELECT
            LTRIM(RTRIM(OrgCode)),
            UPPER(LTRIM(RTRIM(SubInv))),
            LTRIM(RTRIM(ItemCode)),
            ISNULL(TRY_CAST(SohQtyKg AS DECIMAL(18,0)), 0)
        FROM OPENJSON(@OnHandJson)
        WITH (
            OrgCode NVARCHAR(50) '$.orgCode',
            SubInv VARCHAR(20) '$.subInv',
            ItemCode VARCHAR(50) '$.itemCode',
            SohQtyKg NVARCHAR(50) '$.sohQtyKg'
        );

        -- 1.2. Inventory Movement (INV46)
        CREATE TABLE #StagingMovement (
            OrgCode NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            ItemCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            BeginOnhandKg DECIMAL(18,0) NOT NULL,
            QtyReceiveKg DECIMAL(18,0) NOT NULL,
            WipIssueKg DECIMAL(18,0) NOT NULL,
            TransferInKg DECIMAL(18,0) NOT NULL,
            TransferOutKg DECIMAL(18,0) NOT NULL,
            AdjustKg DECIMAL(18,0) NOT NULL,
            ClosedOnhandKg DECIMAL(18,0) NOT NULL
        );

        INSERT INTO #StagingMovement (
            OrgCode, ItemCode, BeginOnhandKg, QtyReceiveKg, WipIssueKg,
            TransferInKg, TransferOutKg, AdjustKg, ClosedOnhandKg
        )
        SELECT
            LTRIM(RTRIM(OrgCode)),
            LTRIM(RTRIM(ItemCode)),
            ISNULL(TRY_CAST(BeginOnhandKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(QtyReceiveKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(WipIssueKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(TransferInKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(TransferOutKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(AdjustKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(ClosedOnhandKg AS DECIMAL(18,0)), 0)
        FROM OPENJSON(@MovementJson)
        WITH (
            OrgCode NVARCHAR(50) '$.orgCode',
            ItemCode VARCHAR(50) '$.itemCode',
            BeginOnhandKg NVARCHAR(50) '$.beginOnhandKg',
            QtyReceiveKg NVARCHAR(50) '$.qtyReceiveKg',
            WipIssueKg NVARCHAR(50) '$.wipIssueKg',
            TransferInKg NVARCHAR(50) '$.transferInKg',
            TransferOutKg NVARCHAR(50) '$.transferOutKg',
            AdjustKg NVARCHAR(50) '$.adjustKg',
            ClosedOnhandKg NVARCHAR(50) '$.closedOnhandKg'
        );

        -- 1.3. PO Pending (FINISH PENDING)
        CREATE TABLE #StagingPoPending (
            OrgCode NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            VendorAccount VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            VendorName NVARCHAR(150) COLLATE DATABASE_DEFAULT NULL,
            VendorGroup VARCHAR(20) COLLATE DATABASE_DEFAULT NULL,
            PONumber NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            ItemCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            Unit NVARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            OrderQtyKg DECIMAL(18,0) NOT NULL,
            ReceivedQtyKg DECIMAL(18,0) NOT NULL,
            DeliverRemainderKg DECIMAL(18,0) NOT NULL,
            DeliveryDate DATE NOT NULL,
            DocType VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            LineStatus NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL
        );

        INSERT INTO #StagingPoPending (
            OrgCode, VendorAccount, VendorName, VendorGroup, PONumber,
            ItemCode, Unit, OrderQtyKg, ReceivedQtyKg, DeliverRemainderKg,
            DeliveryDate, DocType, LineStatus
        )
        SELECT
            LTRIM(RTRIM(OrgCode)),
            LTRIM(RTRIM(VendorAccount)),
            NULLIF(LTRIM(RTRIM(VendorName)), ''),
            NULLIF(LTRIM(RTRIM(VendorGroup)), ''),
            LTRIM(RTRIM(PONumber)),
            LTRIM(RTRIM(ItemCode)),
            ISNULL(NULLIF(LTRIM(RTRIM(Unit)), ''), 'kg'),
            ISNULL(TRY_CAST(OrderQtyKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(ReceivedQtyKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(DeliverRemainderKg AS DECIMAL(18,0)), 0),
            TRY_CAST(DeliveryDate AS DATE),
            CASE WHEN UPPER(LTRIM(RTRIM(PONumber))) LIKE 'PAG%' THEN 'PAG' ELSE ISNULL(NULLIF(LTRIM(RTRIM(DocType)), ''), 'PO') END,
            NULLIF(LTRIM(RTRIM(LineStatus)), '')
        FROM OPENJSON(@PoPendingJson)
        WITH (
            OrgCode NVARCHAR(50) '$.orgCode',
            VendorAccount VARCHAR(50) '$.vendorAccount',
            VendorName NVARCHAR(150) '$.vendorName',
            VendorGroup VARCHAR(20) '$.vendorGroup',
            PONumber NVARCHAR(50) '$.poNumber',
            ItemCode VARCHAR(50) '$.itemCode',
            Unit NVARCHAR(20) '$.unit',
            OrderQtyKg NVARCHAR(50) '$.orderQtyKg',
            ReceivedQtyKg NVARCHAR(50) '$.receivedQtyKg',
            DeliverRemainderKg NVARCHAR(50) '$.deliverRemainderKg',
            DeliveryDate NVARCHAR(50) '$.deliveryDate',
            DocType VARCHAR(20) '$.docType',
            LineStatus NVARCHAR(50) '$.lineStatus'
        );

        -- 1.4. PO Receipt (POR)
        CREATE TABLE #StagingPoReceipt (
            OrgCode NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            VendorAccount VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            PONumber NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL,
            ReceiptNumber NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            DeliveryDate DATE NOT NULL,
            ItemCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            Unit NVARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            ReceivedQtyKg DECIMAL(18,0) NOT NULL,
            PAGNumber NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL,
            TruckNumber NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL
        );

        INSERT INTO #StagingPoReceipt (
            OrgCode, VendorAccount, PONumber, ReceiptNumber, DeliveryDate,
            ItemCode, Unit, ReceivedQtyKg, PAGNumber, TruckNumber
        )
        SELECT
            LTRIM(RTRIM(OrgCode)),
            LTRIM(RTRIM(VendorAccount)),
            NULLIF(LTRIM(RTRIM(PONumber)), ''),
            LTRIM(RTRIM(ReceiptNumber)),
            TRY_CAST(DeliveryDate AS DATE),
            LTRIM(RTRIM(ItemCode)),
            ISNULL(NULLIF(LTRIM(RTRIM(Unit)), ''), 'kg'),
            ISNULL(TRY_CAST(ReceivedQtyKg AS DECIMAL(18,0)), 0),
            NULLIF(LTRIM(RTRIM(PAGNumber)), ''),
            NULLIF(LTRIM(RTRIM(TruckNumber)), '')
        FROM OPENJSON(@PoReceiptJson)
        WITH (
            OrgCode NVARCHAR(50) '$.orgCode',
            VendorAccount VARCHAR(50) '$.vendorAccount',
            PONumber NVARCHAR(50) '$.poNumber',
            ReceiptNumber NVARCHAR(50) '$.receiptNumber',
            DeliveryDate NVARCHAR(50) '$.deliveryDate',
            ItemCode VARCHAR(50) '$.itemCode',
            Unit NVARCHAR(20) '$.unit',
            ReceivedQtyKg NVARCHAR(50) '$.receivedQtyKg',
            PAGNumber NVARCHAR(50) '$.pagNumber',
            TruckNumber NVARCHAR(50) '$.truckNumber'
        );

        -- 1.5. Transfer Order (TO)
        CREATE TABLE #StagingTransfer (
            TransferNumber NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            ItemCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            FromWarehouse NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            ToWarehouse NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            TransferStatus VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            ShippedDate DATE NULL,
            ReceivedDate DATE NULL,
            ShippedQtyKg DECIMAL(18,0) NOT NULL,
            PostedQtyKg DECIMAL(18,0) NOT NULL
        );

        INSERT INTO #StagingTransfer (
            TransferNumber, ItemCode, FromWarehouse, ToWarehouse,
            TransferStatus, ShippedDate, ReceivedDate, ShippedQtyKg, PostedQtyKg
        )
        SELECT
            LTRIM(RTRIM(TransferNumber)),
            LTRIM(RTRIM(ItemCode)),
            LTRIM(RTRIM(FromWarehouse)),
            LTRIM(RTRIM(ToWarehouse)),
            LTRIM(RTRIM(TransferStatus)),
            TRY_CAST(NULLIF(LTRIM(RTRIM(ShippedDate)), '') AS DATE),
            TRY_CAST(NULLIF(LTRIM(RTRIM(ReceivedDate)), '') AS DATE),
            ISNULL(TRY_CAST(ShippedQtyKg AS DECIMAL(18,0)), 0),
            ISNULL(TRY_CAST(PostedQtyKg AS DECIMAL(18,0)), 0)
        FROM OPENJSON(@TransferJson)
        WITH (
            TransferNumber NVARCHAR(50) '$.transferNumber',
            ItemCode VARCHAR(50) '$.itemCode',
            FromWarehouse NVARCHAR(50) '$.fromWarehouse',
            ToWarehouse NVARCHAR(50) '$.toWarehouse',
            TransferStatus VARCHAR(20) '$.transferStatus',
            ShippedDate NVARCHAR(50) '$.shippedDate',
            ReceivedDate NVARCHAR(50) '$.receivedDate',
            ShippedQtyKg NVARCHAR(50) '$.shippedQtyKg',
            PostedQtyKg NVARCHAR(50) '$.postedQtyKg'
        );

        -- ---------------------------------------------------------------------------------
        -- BƯỚC 2: KIỂM TRA RÀNG BUỘC TOÀN VẸN CẤP DÒNG & MÃ LẠ (BR-21, BR-22a)
        -- ---------------------------------------------------------------------------------

        -- 2.1. Kiểm tra mã Nhà máy / Kho lạ trong 4 file chính
        DECLARE @UnknownOrg NVARCHAR(200);
        SELECT TOP 1 @UnknownOrg = u.OrgCode
        FROM (
            SELECT OrgCode FROM #StagingOnHand
            UNION
            SELECT OrgCode FROM #StagingMovement
            UNION
            SELECT OrgCode FROM #StagingPoPending
            UNION
            SELECT OrgCode FROM #StagingPoReceipt
        ) u
        LEFT JOIN dbo.dim_Factory f ON (f.WarehouseCode = u.OrgCode OR f.FactoryCode = u.OrgCode)
        WHERE f.FactoryID IS NULL;

        IF @UnknownOrg IS NOT NULL
        BEGIN
            RAISERROR(N'Vi phạm BR-21: Mã kho/nhà máy "%s" không tồn tại trong Master Data.', 16, 1, @UnknownOrg);
            RETURN;
        END;

        -- 2.2. Kiểm tra mã Nguyên liệu lạ trong cả 5 file
        DECLARE @UnknownItem NVARCHAR(200);
        SELECT TOP 1 @UnknownItem = u.ItemCode
        FROM (
            SELECT ItemCode FROM #StagingOnHand
            UNION
            SELECT ItemCode FROM #StagingMovement
            UNION
            SELECT ItemCode FROM #StagingPoPending
            UNION
            SELECT ItemCode FROM #StagingPoReceipt
            UNION
            SELECT ItemCode FROM #StagingTransfer
        ) u
        LEFT JOIN dbo.dim_Material m ON m.MaterialCode = u.ItemCode
        WHERE m.MaterialID IS NULL;

        IF @UnknownItem IS NOT NULL
        BEGIN
            RAISERROR(N'Vi phạm BR-21: Mã nguyên liệu "%s" không tồn tại trong Master Data.', 16, 1, @UnknownItem);
            RETURN;
        END;

        -- 2.3. Kiểm tra trùng lặp khóa trong Movement
        IF EXISTS (SELECT OrgCode, ItemCode FROM #StagingMovement GROUP BY OrgCode, ItemCode HAVING COUNT(*) > 1)
        BEGIN
            RAISERROR(N'Vi phạm BR-22a: File Inventory Movement có dòng trùng lặp cặp (Org Code, Item code).', 16, 1);
            RETURN;
        END;

        -- 2.4. Kiểm tra số lượng âm trong SOH, PO Pending, POR
        IF EXISTS (SELECT 1 FROM #StagingOnHand WHERE SohQtyKg < 0)
        BEGIN
            RAISERROR(N'Vi phạm BR-22a: File On Hand chứa dòng có số lượng tồn kho âm.', 16, 1);
            RETURN;
        END;

        IF EXISTS (SELECT 1 FROM #StagingPoPending WHERE DeliverRemainderKg < 0 OR OrderQtyKg < 0)
        BEGIN
            RAISERROR(N'Vi phạm BR-22a: File PO Pending chứa dòng có số lượng âm.', 16, 1);
            RETURN;
        END;

        IF EXISTS (SELECT 1 FROM #StagingPoReceipt WHERE ReceivedQtyKg < 0)
        BEGIN
            RAISERROR(N'Vi phạm BR-22a: File PO Receipt chứa dòng có số lượng nhận âm.', 16, 1);
            RETURN;
        END;

        -- 2.5. Tự động bổ sung Nhà cung cấp mới CHỈ TỪ PO Pending (BR-21)
        INSERT INTO dbo.dim_Supplier (SupplierCode, SupplierName, VendorGroup, Country, LeadTimeDays, IsActive, CreatedAt, UpdatedAt)
        SELECT DISTINCT
            po.VendorAccount,
            ISNULL(MAX(po.VendorName), N'NCC Tự động (' + po.VendorAccount + N')'),
            ISNULL(MAX(po.VendorGroup), 'LOC_AUTO'),
            N'Vietnam',
            7,
            1,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
        FROM #StagingPoPending po
        LEFT JOIN dbo.dim_Supplier s ON s.SupplierCode = po.VendorAccount
        WHERE s.SupplierID IS NULL AND po.VendorAccount IS NOT NULL AND LTRIM(RTRIM(po.VendorAccount)) <> ''
        GROUP BY po.VendorAccount;

        -- 2.6. Kiểm tra NCC lạ trong PO Receipt (BR-21: File POR không có cột Vendor Group nên bắt buộc phải tồn tại trong Master Data)
        DECLARE @UnknownPorVendor NVARCHAR(100);
        SELECT TOP 1 @UnknownPorVendor = por.VendorAccount
        FROM #StagingPoReceipt por
        LEFT JOIN dbo.dim_Supplier s ON s.SupplierCode = por.VendorAccount
        WHERE s.SupplierID IS NULL AND por.VendorAccount IS NOT NULL AND LTRIM(RTRIM(por.VendorAccount)) <> '';

        IF @UnknownPorVendor IS NOT NULL
        BEGIN
            RAISERROR(N'Vi phạm BR-21: Mã nhà cung cấp "%s" trong file PO Receipt chưa tồn tại trong Master Data (File POR không có cột Vendor Group nên không thể tự động tạo).', 16, 1, @UnknownPorVendor);
            RETURN;
        END;

        -- ---------------------------------------------------------------------------------
        -- BƯỚC 3: KIỂM TRA CHÉO CHẤT LƯỢNG DỮ LIỆU (BR-21a & BR-15d 5 BÀI KIỂM TRA)
        -- ---------------------------------------------------------------------------------
        CREATE TABLE #TempQualityIssues (
            FactoryID INT NULL,
            MaterialID INT NULL,
            IssueType VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            Severity VARCHAR(10) COLLATE DATABASE_DEFAULT NOT NULL,
            Description NVARCHAR(500) COLLATE DATABASE_DEFAULT NOT NULL
        );

        -- 3.0. BR-21a: Cảnh báo cặp Nhà máy - Nguyên liệu không nằm trong Plant Items
        INSERT INTO #TempQualityIssues (FactoryID, MaterialID, IssueType, Severity, Description)
        SELECT DISTINCT
            f.FactoryID,
            m.MaterialID,
            'PAIR_NOT_IN_MASTER',
            'WARNING',
            FORMATMESSAGE(
                N'Cặp Nhà máy %s (%s) - Nguyên liệu %s (%s) phát sinh giao dịch nhưng không nằm trong danh sách theo dõi Plant Items.',
                f.FactoryCode, f.WarehouseCode, m.MaterialCode, m.MaterialName
            )
        FROM (
            SELECT OrgCode, ItemCode FROM #StagingOnHand WHERE SubInv = 'RAW' AND SohQtyKg > 0
            UNION
            SELECT OrgCode, ItemCode FROM #StagingMovement
            UNION
            SELECT OrgCode, ItemCode FROM #StagingPoPending
            UNION
            SELECT OrgCode, ItemCode FROM #StagingPoReceipt
        ) tx
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = tx.OrgCode OR f.FactoryCode = tx.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = tx.ItemCode
        LEFT JOIN dbo.dim_Factory_Material fm ON fm.FactoryID = f.FactoryID AND fm.MaterialID = m.MaterialID AND fm.IsActive = 1
        WHERE fm.PairID IS NULL;

        -- 3.1. BR-15d Check 1: Phương trình cân đối Movement
        -- Begin + Receive + TransferIn - WipIssue - TransferOut + Adjust = Closed Onhand
        INSERT INTO #TempQualityIssues (FactoryID, MaterialID, IssueType, Severity, Description)
        SELECT
            f.FactoryID,
            m.MaterialID,
            'MOVEMENT_EQUATION_MISMATCH',
            'WARNING',
            FORMATMESSAGE(
                N'Lệch phương trình xuất nhập tồn (Movement) tại NM %s - NL %s: Tính toán = %s kg, Closed Onhand trên file = %s kg.',
                f.FactoryCode,
                m.MaterialCode,
                CAST(CAST((mv.BeginOnhandKg + mv.QtyReceiveKg + mv.TransferInKg - mv.WipIssueKg - mv.TransferOutKg + mv.AdjustKg) AS BIGINT) AS VARCHAR(30)),
                CAST(CAST(mv.ClosedOnhandKg AS BIGINT) AS VARCHAR(30))
            )
        FROM #StagingMovement mv
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = mv.OrgCode OR f.FactoryCode = mv.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = mv.ItemCode
        WHERE ABS((mv.BeginOnhandKg + mv.QtyReceiveKg + mv.TransferInKg - mv.WipIssueKg - mv.TransferOutKg + mv.AdjustKg) - mv.ClosedOnhandKg) > 1;

        -- 3.2. BR-15d Check 2: Closed Onhand (Movement) = SOH RAW (On Hand)
        INSERT INTO #TempQualityIssues (FactoryID, MaterialID, IssueType, Severity, Description)
        SELECT
            f.FactoryID,
            m.MaterialID,
            'CLOSED_SOH_MISMATCH',
            'WARNING',
            FORMATMESSAGE(
                N'Lệch tồn cuối giữa Movement và On Hand RAW tại NM %s - NL %s: Closed Onhand = %s kg, SOH RAW = %s kg.',
                f.FactoryCode,
                m.MaterialCode,
                CAST(CAST(mv.ClosedOnhandKg AS BIGINT) AS VARCHAR(30)),
                CAST(CAST(ISNULL(soh.TotalRawKg, 0) AS BIGINT) AS VARCHAR(30))
            )
        FROM #StagingMovement mv
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = mv.OrgCode OR f.FactoryCode = mv.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = mv.ItemCode
        LEFT JOIN (
            SELECT OrgCode, ItemCode, SUM(SohQtyKg) AS TotalRawKg
            FROM #StagingOnHand
            WHERE SubInv = 'RAW'
            GROUP BY OrgCode, ItemCode
        ) soh ON soh.OrgCode = mv.OrgCode AND soh.ItemCode = mv.ItemCode
        WHERE ABS(mv.ClosedOnhandKg - ISNULL(soh.TotalRawKg, 0)) > 1;

        -- 3.3. BR-15d Check 3: Đối chiếu tổng lượng nhận POR và Qty Receive trên Movement
        INSERT INTO #TempQualityIssues (FactoryID, MaterialID, IssueType, Severity, Description)
        SELECT
            f.FactoryID,
            m.MaterialID,
            'POR_RECEIVE_MISMATCH',
            'WARNING',
            FORMATMESSAGE(
                N'Lệch lượng hàng nhận giữa phiếu POR và báo cáo Movement tại NM %s - NL %s: Tổng POR = %s kg, Movement Qty Receive = %s kg.',
                f.FactoryCode,
                m.MaterialCode,
                CAST(CAST(por.TotalPorKg AS BIGINT) AS VARCHAR(30)),
                CAST(CAST(ISNULL(mv.QtyReceiveKg, 0) AS BIGINT) AS VARCHAR(30))
            )
        FROM (
            SELECT OrgCode, ItemCode, SUM(ReceivedQtyKg) AS TotalPorKg
            FROM #StagingPoReceipt
            WHERE DeliveryDate <= @SnapshotDate
            GROUP BY OrgCode, ItemCode
        ) por
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = por.OrgCode OR f.FactoryCode = por.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = por.ItemCode
        LEFT JOIN #StagingMovement mv ON mv.OrgCode = por.OrgCode AND mv.ItemCode = por.ItemCode
        WHERE ABS(por.TotalPorKg - ISNULL(mv.QtyReceiveKg, 0)) > 1;

        -- 3.4. BR-15d Check 4: SOH TRANSIT của kho = Tổng Shipped Qty của các TO đang ở trạng thái Shipped
        INSERT INTO #TempQualityIssues (FactoryID, MaterialID, IssueType, Severity, Description)
        SELECT
            f.FactoryID,
            m.MaterialID,
            'TRANSIT_TO_MISMATCH',
            'WARNING',
            FORMATMESSAGE(
                N'Lệch tồn đang đi đường (TRANSIT) tại kho %s - NL %s: SOH TRANSIT = %s kg, Tổng TO Shipped = %s kg.',
                f.FactoryCode,
                m.MaterialCode,
                CAST(CAST(ISNULL(tr.TransitKg, 0) AS BIGINT) AS VARCHAR(30)),
                CAST(CAST(ISNULL(to_ship.ShippedKg, 0) AS BIGINT) AS VARCHAR(30))
            )
        FROM (
            SELECT OrgCode, ItemCode, SUM(SohQtyKg) AS TransitKg
            FROM #StagingOnHand
            WHERE SubInv = 'TRANSIT'
            GROUP BY OrgCode, ItemCode
        ) tr
        FULL OUTER JOIN (
            SELECT FromWarehouse AS OrgCode, ItemCode, SUM(ShippedQtyKg) AS ShippedKg
            FROM #StagingTransfer
            WHERE UPPER(TransferStatus) = 'SHIPPED'
            GROUP BY FromWarehouse, ItemCode
        ) to_ship ON tr.OrgCode = to_ship.OrgCode AND tr.ItemCode = to_ship.ItemCode
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = COALESCE(tr.OrgCode, to_ship.OrgCode) OR f.FactoryCode = COALESCE(tr.OrgCode, to_ship.OrgCode))
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = COALESCE(tr.ItemCode, to_ship.ItemCode)
        WHERE ABS(ISNULL(tr.TransitKg, 0) - ISNULL(to_ship.ShippedKg, 0)) > 1;

        -- 3.5. BR-15d Check 5: Kiểm tra bội số quy cách bao (BagKg > 0) trên PO Pending và POR
        INSERT INTO #TempQualityIssues (FactoryID, MaterialID, IssueType, Severity, Description)
        SELECT
            f.FactoryID,
            m.MaterialID,
            'BAG_WEIGHT_MISMATCH',
            'WARNING',
            FORMATMESSAGE(
                N'Số lượng đặt/nhận không phải là bội số quy cách bao (%s kg/bao) tại NM %s - NL %s (Chứng từ: %s, Lượng: %s kg).',
                CAST(CAST(m.BagKg AS BIGINT) AS VARCHAR(20)),
                f.FactoryCode,
                m.MaterialCode,
                doc.DocNo,
                CAST(CAST(doc.QtyKg AS BIGINT) AS VARCHAR(30))
            )
        FROM (
            SELECT OrgCode, ItemCode, PONumber AS DocNo, DeliverRemainderKg AS QtyKg FROM #StagingPoPending WHERE DeliverRemainderKg > 0
            UNION ALL
            SELECT OrgCode, ItemCode, ReceiptNumber AS DocNo, ReceivedQtyKg AS QtyKg FROM #StagingPoReceipt WHERE ReceivedQtyKg > 0
        ) doc
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = doc.OrgCode OR f.FactoryCode = doc.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = doc.ItemCode
        WHERE m.BagKg IS NOT NULL AND m.BagKg > 0 AND (CAST(doc.QtyKg AS BIGINT) % CAST(m.BagKg AS BIGINT)) <> 0;

        -- 3.6. BR-18: Kiểm tra trùng số POR ngoài khoảng ngày của file (Không ghi đè, không tự xóa)
        DECLARE @EffPorStartVal DATE = COALESCE(@PorStartDate, (SELECT MIN(DeliveryDate) FROM #StagingPoReceipt), @SnapshotDate);
        DECLARE @EffPorEndVal DATE = COALESCE(@PorEndDate, (SELECT MAX(DeliveryDate) FROM #StagingPoReceipt), @SnapshotDate);

        INSERT INTO #TempQualityIssues (FactoryID, MaterialID, IssueType, Severity, Description)
        SELECT DISTINCT
            existing.FactoryID,
            existing.MaterialID,
            'POR_DUPLICATE_OUTSIDE_DATE_RANGE',
            'WARNING',
            FORMATMESSAGE(
                N'Phiếu nhận hàng %s trùng số phiếu với phiếu đã tồn tại ngày %s nằm ngoài khoảng ngày của file (%s đến %s). Không được ghi đè hay tự xóa (BR-18).',
                por.ReceiptNumber,
                CONVERT(VARCHAR(10), existing.DeliveryDate, 23),
                CONVERT(VARCHAR(10), @EffPorStartVal, 23),
                CONVERT(VARCHAR(10), @EffPorEndVal, 23)
            )
        FROM #StagingPoReceipt por
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = por.ItemCode
        INNER JOIN dbo.fact_PO_Receipt existing ON existing.ReceiptNumber = por.ReceiptNumber AND existing.MaterialID = m.MaterialID
        WHERE existing.DeliveryDate < @EffPorStartVal OR existing.DeliveryDate > @EffPorEndVal;

        -- Đếm số dòng hợp lệ của 5 bảng
        DECLARE @OnHandRawCount INT = (SELECT COUNT(*) FROM #StagingOnHand WHERE SubInv = 'RAW' AND SohQtyKg > 0);
        DECLARE @MovementCount INT = (SELECT COUNT(*) FROM #StagingMovement);
        DECLARE @PoPendingCount INT = (SELECT COUNT(*) FROM #StagingPoPending);
        DECLARE @PoReceiptCount INT = (SELECT COUNT(*) FROM #StagingPoReceipt);
        DECLARE @TransferCount INT = (SELECT COUNT(*) FROM #StagingTransfer);
        DECLARE @IssueCount INT = (SELECT COUNT(*) FROM #TempQualityIssues);
        DECLARE @TotalRows INT = @OnHandRawCount + @MovementCount + @PoPendingCount + @PoReceiptCount + @TransferCount;

        -- Nếu chỉ chạy chế độ Xem trước (DryRun = 1), trả kết quả thống kê + danh sách cảnh báo và ROLLBACK
        IF @DryRun = 1
        BEGIN
            SELECT
                0 AS BatchID,
                @SnapshotDate AS SnapshotDate,
                @CutoffDate AS CutoffDate,
                @TotalRows AS TotalRows,
                @OnHandRawCount AS OnHandRows,
                @MovementCount AS MovementRows,
                @PoPendingCount AS PoPendingRows,
                @PoReceiptCount AS PoReceiptRows,
                @TransferCount AS TransferRows,
                @IssueCount AS IssueCount,
                'PREVIEW' AS Status;

            SELECT
                qi.FactoryID,
                f.FactoryCode,
                qi.MaterialID,
                m.MaterialCode,
                m.MaterialName,
                qi.IssueType,
                qi.Severity,
                qi.Description
            FROM #TempQualityIssues qi
            LEFT JOIN dbo.dim_Factory f ON f.FactoryID = qi.FactoryID
            LEFT JOIN dbo.dim_Material m ON m.MaterialID = qi.MaterialID;

            ROLLBACK TRANSACTION;
            RETURN;
        END;

        -- ---------------------------------------------------------------------------------
        -- BƯỚC 4: GHI DỮ LIỆU CHÍNH THỨC VÀO 5 BẢNG FACT TRONG 1 TRANSACTION DUY NHẤT
        -- ---------------------------------------------------------------------------------

        -- 4.0. Tạo Batch trong sys_Import_Batch
        DECLARE @BatchID INT;
        INSERT INTO dbo.sys_Import_Batch (
            BatchType, SnapshotDate, CutoffDate, OriginalFileName, FileHash,
            TotalRows, ValidRows, ErrorRows, Status, ImportedAt, ImportedBy
        ) VALUES (
            'DAILY_SET', @SnapshotDate, @CutoffDate, @OriginalFileName, @FileHash,
            @TotalRows, @TotalRows, 0, 'COMPLETED', SYSUTCDATETIME(), @ImportedBy
        );
        SET @BatchID = SCOPE_IDENTITY();

        -- 4.1. Ghi fact_Inventory_SOH (BR-15c: chỉ lấy SUB INV = 'RAW' và tồn > 0)
        DELETE FROM dbo.fact_Inventory_SOH WHERE SnapshotDate = @SnapshotDate;

        INSERT INTO dbo.fact_Inventory_SOH (SnapshotDate, FactoryID, MaterialID, SohQtyKg, BatchID, CreatedAt)
        SELECT
            @SnapshotDate,
            f.FactoryID,
            m.MaterialID,
            SUM(s.SohQtyKg),
            @BatchID,
            SYSUTCDATETIME()
        FROM #StagingOnHand s
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = s.OrgCode OR f.FactoryCode = s.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = s.ItemCode
        WHERE s.SubInv = 'RAW' AND s.SohQtyKg > 0
        GROUP BY f.FactoryID, m.MaterialID;

        -- 4.2. Ghi fact_Inventory_Movement (BR-15a)
        DELETE FROM dbo.fact_Inventory_Movement WHERE SnapshotDate = @SnapshotDate;

        INSERT INTO dbo.fact_Inventory_Movement (
            SnapshotDate, FactoryID, MaterialID, BeginOnhandKg, QtyReceiveKg,
            WipIssueKg, TransferInKg, TransferOutKg, AdjustKg, ClosedOnhandKg, BatchID, CreatedAt
        )
        SELECT
            @SnapshotDate,
            f.FactoryID,
            m.MaterialID,
            mv.BeginOnhandKg,
            mv.QtyReceiveKg,
            mv.WipIssueKg,
            mv.TransferInKg,
            mv.TransferOutKg,
            mv.AdjustKg,
            mv.ClosedOnhandKg,
            @BatchID,
            SYSUTCDATETIME()
        FROM #StagingMovement mv
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = mv.OrgCode OR f.FactoryCode = mv.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = mv.ItemCode;

        -- 4.3. Ghi fact_PO_Pending (BR-19 & BR-19b)
        DELETE FROM dbo.fact_PO_Pending WHERE SnapshotDate = @SnapshotDate;

        INSERT INTO dbo.fact_PO_Pending (
            SnapshotDate, PONumber, MaterialID, DeliveryDate, FactoryID,
            VendorAccount, Unit, OrderQtyKg, ReceivedQtyKg, DeliverRemainderKg,
            DocType, LineStatus, BatchID, CreatedAt
        )
        SELECT
            @SnapshotDate,
            po.PONumber,
            m.MaterialID,
            po.DeliveryDate,
            f.FactoryID,
            MAX(po.VendorAccount),
            MAX(po.Unit),
            SUM(po.OrderQtyKg),
            SUM(po.ReceivedQtyKg),
            SUM(po.DeliverRemainderKg),
            MAX(po.DocType),
            MAX(po.LineStatus),
            @BatchID,
            SYSUTCDATETIME()
        FROM #StagingPoPending po
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = po.OrgCode OR f.FactoryCode = po.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = po.ItemCode
        GROUP BY po.PONumber, m.MaterialID, po.DeliveryDate, f.FactoryID;

        -- 4.4. Ghi fact_PO_Receipt (BR-18 & BR-18a: Xóa và ghi đè CHỈ trong khoảng ngày của file POR, không xóa ngoài khoảng ngày)
        DECLARE @EffPorStart DATE = COALESCE(@PorStartDate, (SELECT MIN(DeliveryDate) FROM #StagingPoReceipt), @SnapshotDate);
        DECLARE @EffPorEnd DATE = COALESCE(@PorEndDate, (SELECT MAX(DeliveryDate) FROM #StagingPoReceipt), @SnapshotDate);

        DELETE FROM dbo.fact_PO_Receipt
        WHERE DeliveryDate BETWEEN @EffPorStart AND @EffPorEnd;

        INSERT INTO dbo.fact_PO_Receipt (
            ReceiptNumber, MaterialID, FactoryID, SupplierID, PONumber,
            PAGNumber, DeliveryDate, ReceivedQtyKg, Unit, TruckNumber, BatchID, CreatedAt
        )
        SELECT
            por.ReceiptNumber,
            m.MaterialID,
            f.FactoryID,
            s.SupplierID,
            MAX(por.PONumber),
            MAX(por.PAGNumber),
            MAX(por.DeliveryDate),
            SUM(por.ReceivedQtyKg),
            MAX(por.Unit),
            MAX(por.TruckNumber),
            @BatchID,
            SYSUTCDATETIME()
        FROM #StagingPoReceipt por
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = por.OrgCode OR f.FactoryCode = por.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = por.ItemCode
        INNER JOIN dbo.dim_Supplier s ON s.SupplierCode = por.VendorAccount
        WHERE NOT EXISTS (
            -- Bỏ qua dòng trùng với phiếu đã tồn tại ngoài khoảng ngày (BR-18)
            SELECT 1 FROM dbo.fact_PO_Receipt ex
            WHERE ex.ReceiptNumber = por.ReceiptNumber 
              AND ex.MaterialID = m.MaterialID
              AND (ex.DeliveryDate < @EffPorStart OR ex.DeliveryDate > @EffPorEnd)
        )
        GROUP BY por.ReceiptNumber, m.MaterialID, f.FactoryID, s.SupplierID;

        -- 4.5. Ghi fact_Internal_Transfer (BR-19a: Upsert theo TransferNumber + MaterialID, CHỐNG LÙI TRẠNG THÁI)
        MERGE dbo.fact_Internal_Transfer AS target
        USING (
            SELECT
                tr.TransferNumber,
                m.MaterialID,
                MAX(tr.FromWarehouse) AS FromWarehouse,
                MAX(tr.ToWarehouse) AS ToWarehouse,
                MAX(fFrom.FactoryID) AS FromFactoryID,
                MAX(fTo.FactoryID) AS ToFactoryID,
                MAX(tr.TransferStatus) AS TransferStatus,
                MAX(tr.ShippedDate) AS ShippedDate,
                MAX(tr.ReceivedDate) AS ReceivedDate,
                SUM(tr.ShippedQtyKg) AS ShippedQtyKg,
                SUM(tr.PostedQtyKg) AS PostedQtyKg
            FROM #StagingTransfer tr
            INNER JOIN dbo.dim_Material m ON m.MaterialCode = tr.ItemCode
            LEFT JOIN dbo.dim_Factory fFrom ON (fFrom.WarehouseCode = tr.FromWarehouse OR fFrom.FactoryCode = tr.FromWarehouse)
            LEFT JOIN dbo.dim_Factory fTo ON (fTo.WarehouseCode = tr.ToWarehouse OR fTo.FactoryCode = tr.ToWarehouse)
            GROUP BY tr.TransferNumber, m.MaterialID
        ) AS source
        ON target.TransferNumber = source.TransferNumber AND target.MaterialID = source.MaterialID
        WHEN MATCHED THEN
            UPDATE SET
                target.FromWarehouse = source.FromWarehouse,
                target.ToWarehouse = source.ToWarehouse,
                target.FromFactoryID = source.FromFactoryID,
                target.ToFactoryID = source.ToFactoryID,
                -- BR-19a: Trạng thái TO không được phép lùi (CREATED < SHIPPED < RECEIVED < CANCELLED)
                target.TransferStatus = CASE 
                    WHEN (CASE UPPER(source.TransferStatus) WHEN 'CREATED' THEN 1 WHEN 'SHIPPED' THEN 2 WHEN 'RECEIVED' THEN 3 WHEN 'CANCELLED' THEN 4 ELSE 0 END) 
                         >= (CASE UPPER(target.TransferStatus) WHEN 'CREATED' THEN 1 WHEN 'SHIPPED' THEN 2 WHEN 'RECEIVED' THEN 3 WHEN 'CANCELLED' THEN 4 ELSE 0 END)
                    THEN source.TransferStatus
                    ELSE target.TransferStatus
                END,
                target.ShippedDate = COALESCE(source.ShippedDate, target.ShippedDate),
                target.ReceivedDate = CASE 
                    WHEN UPPER(target.TransferStatus) = 'RECEIVED' AND UPPER(source.TransferStatus) <> 'RECEIVED' 
                    THEN target.ReceivedDate 
                    ELSE COALESCE(source.ReceivedDate, target.ReceivedDate) 
                END,
                target.ShippedQtyKg = CASE 
                    WHEN UPPER(target.TransferStatus) = 'RECEIVED' AND UPPER(source.TransferStatus) <> 'RECEIVED' 
                    THEN target.ShippedQtyKg 
                    ELSE source.ShippedQtyKg 
                END,
                target.PostedQtyKg = CASE 
                    WHEN UPPER(target.TransferStatus) = 'RECEIVED' AND UPPER(source.TransferStatus) <> 'RECEIVED' 
                    THEN target.PostedQtyKg 
                    ELSE source.PostedQtyKg 
                END,
                target.BatchID = @BatchID,
                target.UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
            INSERT (
                TransferNumber, MaterialID, FromWarehouse, ToWarehouse,
                FromFactoryID, ToFactoryID, TransferStatus, ShippedDate,
                ReceivedDate, ShippedQtyKg, PostedQtyKg, BatchID, CreatedAt, UpdatedAt
            )
            VALUES (
                source.TransferNumber, source.MaterialID, source.FromWarehouse, source.ToWarehouse,
                source.FromFactoryID, source.ToFactoryID, source.TransferStatus, source.ShippedDate,
                source.ReceivedDate, source.ShippedQtyKg, source.PostedQtyKg, @BatchID, SYSUTCDATETIME(), SYSUTCDATETIME()
            );

        -- 4.6. Ghi cảnh báo chất lượng dữ liệu vào sys_Data_Quality_Issue
        INSERT INTO dbo.sys_Data_Quality_Issue (
            BatchID, SnapshotDate, FactoryID, MaterialID, IssueType, Severity, Description, CreatedAt
        )
        SELECT
            @BatchID,
            @SnapshotDate,
            FactoryID,
            MaterialID,
            IssueType,
            Severity,
            Description,
            SYSUTCDATETIME()
        FROM #TempQualityIssues;

        -- 4.7. Ghi Audit Log
        DECLARE @AuditDesc NVARCHAR(500) = FORMATMESSAGE(
            N'Nạp bộ 5 file ERP ngày chốt %s thành công (Batch #%d): %d dòng hợp lệ, %d cảnh báo kiểm chéo.',
            CONVERT(VARCHAR(10), @SnapshotDate, 23), @BatchID, @TotalRows, @IssueCount
        );
        DECLARE @BatchIdStr NVARCHAR(100) = CAST(@BatchID AS NVARCHAR(100));

        EXEC dbo.usp_Audit_Write
            @UserID = NULL,
            @Username = @ImportedBy,
            @ActionCode = 'IMPORT_DAILY_SET_SUCCESS',
            @TargetEntity = 'sys_Import_Batch',
            @TargetID = @BatchIdStr,
            @IPAddress = '127.0.0.1',
            @OldValues = NULL,
            @NewValues = @AuditDesc,
            @Status = 'SUCCESS';

        COMMIT TRANSACTION;

        -- Dataset 1: Thống kê kết quả nạp
        SELECT
            @BatchID AS BatchID,
            @SnapshotDate AS SnapshotDate,
            @CutoffDate AS CutoffDate,
            @TotalRows AS TotalRows,
            @OnHandRawCount AS OnHandRows,
            @MovementCount AS MovementRows,
            @PoPendingCount AS PoPendingRows,
            @PoReceiptCount AS PoReceiptRows,
            @TransferCount AS TransferRows,
            @IssueCount AS IssueCount,
            'COMPLETED' AS Status;

        -- Dataset 2: Danh sách cảnh báo chất lượng dữ liệu
        SELECT
            qi.IssueID,
            qi.BatchID,
            qi.SnapshotDate,
            qi.FactoryID,
            f.FactoryCode,
            qi.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            qi.IssueType,
            qi.Severity,
            qi.Description,
            qi.CreatedAt
        FROM dbo.sys_Data_Quality_Issue qi
        LEFT JOIN dbo.dim_Factory f ON f.FactoryID = qi.FactoryID
        LEFT JOIN dbo.dim_Material m ON m.MaterialID = qi.MaterialID
        WHERE qi.BatchID = @BatchID
        ORDER BY qi.IssueID ASC;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        -- Ghi nhận Audit Log thất bại bên ngoài transaction đã rollback
        EXEC dbo.usp_Audit_Write
            @UserID = NULL,
            @Username = @ImportedBy,
            @ActionCode = 'IMPORT_DAILY_SET_FAILED',
            @TargetEntity = 'sys_Import_Batch',
            @TargetID = NULL,
            @IPAddress = '127.0.0.1',
            @OldValues = NULL,
            @NewValues = @OriginalFileName,
            @Status = 'FAILED',
            @ErrorMessage = @ErrorMessage;

        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END;
GO

-- =====================================================================================
-- 2. dbo.usp_Import_Forecast
-- Nạp dữ liệu Dự báo nhu cầu (Forecast RM Usage) theo tháng và phiên bản (BR-15b)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Import_Forecast
    @PeriodMonth DATE,
    @VersionDate DATETIME2(0),
    @ForecastJson NVARCHAR(MAX),
    @OriginalFileName NVARCHAR(255),
    @FileHash VARCHAR(64),
    @ImportedBy NVARCHAR(50),
    @DryRun BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Đảm bảo PeriodMonth luôn là ngày đầu tháng (YYYY-MM-01)
    SET @PeriodMonth = DATEFROMPARTS(YEAR(@PeriodMonth), MONTH(@PeriodMonth), 1);

    BEGIN TRY
        BEGIN TRANSACTION;

        CREATE TABLE #StagingForecast (
            OrgCode NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            ItemCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            ForecastKg DECIMAL(18,0) NOT NULL
        );

        INSERT INTO #StagingForecast (OrgCode, ItemCode, ForecastKg)
        SELECT
            LTRIM(RTRIM(OrgCode)),
            LTRIM(RTRIM(ItemCode)),
            ISNULL(TRY_CAST(ForecastKg AS DECIMAL(18,0)), 0)
        FROM OPENJSON(@ForecastJson)
        WITH (
            OrgCode NVARCHAR(50) '$.orgCode',
            ItemCode VARCHAR(50) '$.itemCode',
            ForecastKg NVARCHAR(50) '$.forecastKg'
        );

        -- Kiểm tra mã Nhà máy lạ
        DECLARE @UnknownFactory NVARCHAR(100);
        SELECT TOP 1 @UnknownFactory = s.OrgCode
        FROM #StagingForecast s
        LEFT JOIN dbo.dim_Factory f ON (f.FactoryCode = s.OrgCode OR f.WarehouseCode = s.OrgCode)
        WHERE f.FactoryID IS NULL;

        IF @UnknownFactory IS NOT NULL
        BEGIN
            RAISERROR(N'Vi phạm BR-21: Mã nhà máy "%s" trên file Forecast không tồn tại trong Master Data.', 16, 1, @UnknownFactory);
            RETURN;
        END;

        -- Kiểm tra mã Nguyên liệu lạ
        DECLARE @UnknownMat NVARCHAR(100);
        SELECT TOP 1 @UnknownMat = s.ItemCode
        FROM #StagingForecast s
        LEFT JOIN dbo.dim_Material m ON m.MaterialCode = s.ItemCode
        WHERE m.MaterialID IS NULL;

        IF @UnknownMat IS NOT NULL
        BEGIN
            RAISERROR(N'Vi phạm BR-21: Mã nguyên liệu "%s" trên file Forecast không tồn tại trong Master Data.', 16, 1, @UnknownMat);
            RETURN;
        END;

        -- Kiểm tra số lượng âm
        IF EXISTS (SELECT 1 FROM #StagingForecast WHERE ForecastKg < 0)
        BEGIN
            RAISERROR(N'Vi phạm BR-22a: File Forecast chứa ô có nhu cầu dự báo âm.', 16, 1);
            RETURN;
        END;

        DECLARE @TotalCells INT = (SELECT COUNT(*) FROM #StagingForecast WHERE ForecastKg >= 0);
        DECLARE @TotalForecastKg DECIMAL(18,0) = ISNULL((SELECT SUM(ForecastKg) FROM #StagingForecast WHERE ForecastKg > 0), 0);

        IF @DryRun = 1
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT
                0 AS BatchID,
                @PeriodMonth AS PeriodMonth,
                @VersionDate AS VersionDate,
                @TotalCells AS TotalRows,
                @TotalForecastKg AS TotalForecastKg,
                'PREVIEW' AS Status;
            RETURN;
        END;

        -- Ghi nhận Batch
        DECLARE @BatchID INT;
        INSERT INTO dbo.sys_Import_Batch (
            BatchType, PeriodMonth, VersionDate, OriginalFileName, FileHash,
            TotalRows, ValidRows, ErrorRows, Status, ImportedAt, ImportedBy
        ) VALUES (
            'FORECAST', @PeriodMonth, @VersionDate, @OriginalFileName, @FileHash,
            @TotalCells, @TotalCells, 0, 'COMPLETED', SYSUTCDATETIME(), @ImportedBy
        );
        SET @BatchID = SCOPE_IDENTITY();

        -- Xóa phiên bản cũ nếu trùng PeriodMonth + VersionDate (Idempotency - BR-15b)
        DELETE FROM dbo.fact_Demand_Forecast
        WHERE PeriodMonth = @PeriodMonth AND VersionDate = @VersionDate;

        -- Chèn dữ liệu Forecast mới
        INSERT INTO dbo.fact_Demand_Forecast (
            PeriodMonth, VersionDate, FactoryID, MaterialID, ForecastKg, BatchID, CreatedAt
        )
        SELECT
            @PeriodMonth,
            @VersionDate,
            f.FactoryID,
            m.MaterialID,
            SUM(s.ForecastKg),
            @BatchID,
            SYSUTCDATETIME()
        FROM #StagingForecast s
        INNER JOIN dbo.dim_Factory f ON (f.FactoryCode = s.OrgCode OR f.WarehouseCode = s.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = s.ItemCode
        WHERE s.ForecastKg > 0
        GROUP BY f.FactoryID, m.MaterialID;

        -- Ghi Audit Log
        DECLARE @AuditDesc NVARCHAR(500) = FORMATMESSAGE(
            N'Nạp Forecast tháng %s (Version %s) thành công (Batch #%d): %d ô dữ liệu, tổng nhu cầu %s kg.',
            CONVERT(VARCHAR(7), @PeriodMonth, 23),
            CONVERT(VARCHAR(19), @VersionDate, 120),
            @BatchID,
            @TotalCells,
            CAST(CAST(@TotalForecastKg AS BIGINT) AS VARCHAR(30))
        );
        DECLARE @BatchIdStr NVARCHAR(100) = CAST(@BatchID AS NVARCHAR(100));

        EXEC dbo.usp_Audit_Write
            @UserID = NULL,
            @Username = @ImportedBy,
            @ActionCode = 'IMPORT_FORECAST',
            @TargetEntity = 'fact_Demand_Forecast',
            @TargetID = @BatchIdStr,
            @IPAddress = '127.0.0.1',
            @OldValues = NULL,
            @NewValues = @AuditDesc,
            @Status = 'SUCCESS';

        COMMIT TRANSACTION;

        SELECT
            @BatchID AS BatchID,
            @PeriodMonth AS PeriodMonth,
            @VersionDate AS VersionDate,
            @TotalCells AS TotalRows,
            @TotalForecastKg AS TotalForecastKg,
            'COMPLETED' AS Status;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();

        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END;
GO
