-- =====================================================================================
-- PHÂN HỆ F07: KẾ HOẠCH GIAO HÀNG TUẦN (DELIVERY PLANNING & RECONCILIATION)
-- File: database/stored_procedures/10_delivery_plan_procedures.sql
-- Quy tắc áp dụng:
--   - BR-26, BR-26c, BR-33: Nhập và xem TẤN, lưu trữ KG NGUYÊN (round(tons * 1000, 0))
--   - BR-26a: Khóa duy nhất (PlanDate, FactoryID, MaterialID, SupplierID, PONumber) khi PONumber IS NOT NULL
--   - BR-26b: Đọc kế hoạch và toàn bộ phiếu POR trong tuần để đối chiếu (Reconciliation)
--   - BR-26d: Cảnh báo mềm khi tổng kế hoạch vượt lượng còn lại của PO
-- =====================================================================================

USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Đảm bảo Index duy nhất cho dòng có PO trên fact_Delivery_Plan (BR-26a)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'UQ_fact_Delivery_Plan_Po' AND object_id = OBJECT_ID('dbo.fact_Delivery_Plan')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UQ_fact_Delivery_Plan_Po
    ON dbo.fact_Delivery_Plan (PlanDate, FactoryID, MaterialID, SupplierID, PONumber)
    WHERE PONumber IS NOT NULL;
END;
GO

-- =====================================================================================
-- 2. dbo.usp_DeliveryPlan_GetWeek
-- Truy vấn đa tập kết quả (Multi-dataset):
--   Set 1: Kế hoạch giao hàng tuần (fact_Delivery_Plan)
--   Set 2: Phiếu nhận hàng thực tế trong tuần (fact_PO_Receipt)
--   Set 3: Danh sách PO Pending còn mở tại ngày chốt mới nhất để kiểm tra hạn mức & chọn PO
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_DeliveryPlan_GetWeek
    @UserID INT,
    @WeekStartDate VARCHAR(20),       -- Thứ 2 của tuần (YYYY-MM-DD)
    @FactoryID INT = NULL,
    @MaterialID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    BEGIN TRY
        -- 1. Kiểm tra phạm vi nhà máy của User (Default Deny)
        DECLARE @FactoryScope VARCHAR(20) = NULL;
        SELECT @FactoryScope = r.FactoryScope
        FROM dbo.sys_User u
        INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
        WHERE u.UserID = @UserID AND u.IsActive = 1;

        IF @FactoryScope IS NULL
        BEGIN
            THROW 50401, N'[50401] Người dùng không tồn tại hoặc tài khoản đã bị vô hiệu hóa.', 1;
        END

        IF @FactoryScope = 'ASSIGNED' AND @FactoryID IS NOT NULL
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM dbo.sys_User_Factory
                WHERE UserID = @UserID AND FactoryID = @FactoryID
            )
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền truy cập dữ liệu kế hoạch giao hàng của nhà máy này.', 1;
            END
        END

        DECLARE @WeekStart DATE = TRY_CONVERT(DATE, @WeekStartDate);
        IF @WeekStart IS NULL
        BEGIN
            THROW 50400, N'[50400] Ngày bắt đầu tuần (WeekStartDate) không đúng định dạng YYYY-MM-DD.', 1;
        END

        DECLARE @WeekEnd DATE = DATEADD(DAY, 6, @WeekStart);

        DECLARE @LatestSnapshot DATE;
        SELECT @LatestSnapshot = MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH;

        -- Result Set 1: Toàn bộ dòng kế hoạch giao hàng trong tuần
        SELECT
            dp.PlanID,
            CONVERT(VARCHAR(10), dp.PlanDate, 23) AS PlanDate,
            dp.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            dp.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            m.BagKg,
            m.DisplayDecimals,
            dp.SupplierID,
            s.SupplierCode,
            s.SupplierName,
            dp.PONumber,
            dp.PlanQtyKg,
            CAST(ROUND(dp.PlanQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS PlanQtyTons,
            dp.Note,
            dp.CreatedAt,
            dp.CreatedBy,
            dp.UpdatedAt,
            dp.UpdatedBy
        FROM dbo.fact_Delivery_Plan dp
        INNER JOIN dbo.dim_Factory f ON dp.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON dp.MaterialID = m.MaterialID
        INNER JOIN dbo.dim_Supplier s ON dp.SupplierID = s.SupplierID
        WHERE dp.PlanDate BETWEEN @WeekStart AND @WeekEnd
          AND (@FactoryScope <> 'ASSIGNED' OR dp.FactoryID IN (
              SELECT FactoryID FROM dbo.sys_User_Factory WHERE UserID = @UserID
          ))
          AND (@FactoryID IS NULL OR dp.FactoryID = @FactoryID)
          AND (@MaterialID IS NULL OR dp.MaterialID = @MaterialID)
        ORDER BY dp.FactoryID, dp.MaterialID, dp.SupplierID, dp.PONumber, dp.PlanDate;

        -- Result Set 2: Toàn bộ phiếu nhận POR thực tế phát sinh trong tuần
        SELECT
            pr.ReceiptID,
            pr.ReceiptNumber,
            CONVERT(VARCHAR(10), pr.DeliveryDate, 23) AS ReceiptDate,
            pr.FactoryID,
            f.FactoryCode,
            pr.MaterialID,
            m.MaterialCode,
            pr.SupplierID,
            s.SupplierCode,
            pr.PONumber,
            pr.PAGNumber,
            pr.ReceivedQtyKg,
            CAST(ROUND(pr.ReceivedQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS ReceivedQtyTons
        FROM dbo.fact_PO_Receipt pr
        INNER JOIN dbo.dim_Factory f ON pr.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON pr.MaterialID = m.MaterialID
        LEFT JOIN dbo.dim_Supplier s ON pr.SupplierID = s.SupplierID
        WHERE pr.DeliveryDate BETWEEN @WeekStart AND @WeekEnd
          AND (@FactoryScope <> 'ASSIGNED' OR pr.FactoryID IN (
              SELECT FactoryID FROM dbo.sys_User_Factory WHERE UserID = @UserID
          ))
          AND (@FactoryID IS NULL OR pr.FactoryID = @FactoryID)
          AND (@MaterialID IS NULL OR pr.MaterialID = @MaterialID)
        ORDER BY pr.DeliveryDate, pr.ReceiptNumber;

        -- Result Set 3: Danh sách PO Pending còn mở tại ngày chốt mới nhất
        SELECT
            po.PoPendingID,
            po.FactoryID,
            po.MaterialID,
            s.SupplierID,
            po.VendorAccount AS SupplierCode,
            s.SupplierName,
            po.PONumber,
            po.DocType,
            po.OrderQtyKg,
            CAST(ROUND(po.OrderQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS OrderQtyTons,
            po.DeliverRemainderKg,
            CAST(ROUND(po.DeliverRemainderKg / 1000.0, 3) AS DECIMAL(18,3)) AS DeliverRemainderTons,
            CONVERT(VARCHAR(10), po.DeliveryDate, 23) AS DeliveryDate
        FROM dbo.fact_PO_Pending po
        LEFT JOIN dbo.dim_Supplier s ON po.VendorAccount = s.SupplierCode
        WHERE po.SnapshotDate = @LatestSnapshot
          AND po.DeliverRemainderKg > 0
          AND (@FactoryScope <> 'ASSIGNED' OR po.FactoryID IN (
              SELECT FactoryID FROM dbo.sys_User_Factory WHERE UserID = @UserID
          ))
          AND (@FactoryID IS NULL OR po.FactoryID = @FactoryID)
          AND (@MaterialID IS NULL OR po.MaterialID = @MaterialID)
        ORDER BY po.FactoryID, po.MaterialID, po.DeliveryDate ASC, po.PoPendingID ASC;

    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 3. dbo.usp_DeliveryPlan_SaveWeek
-- Lưu kế hoạch tuần có chọn lọc theo MaterialID (tránh xóa nhầm các nguyên liệu khác trong tuần)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_DeliveryPlan_SaveWeek
    @UserID INT,
    @Username NVARCHAR(50),
    @WeekStartDate VARCHAR(20),
    @FactoryID INT,
    @PlansJson NVARCHAR(MAX),
    @MaterialID INT = NULL,
    @MaterialIdsJson NVARCHAR(MAX) = NULL,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    BEGIN TRY
        -- 1. Kiểm tra phạm vi nhà máy của User (Default Deny)
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
                THROW 50403, N'[50403] Bạn không có quyền lưu kế hoạch giao hàng tại nhà máy này.', 1;
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

        -- 2. Phân tích PlansJson vào bảng tạm
        IF OBJECT_ID('tempdb..#ParsedPlans') IS NOT NULL DROP TABLE #ParsedPlans;

        SELECT
            TRY_CONVERT(DATE, JSON_VALUE(p.value, '$.planDate')) AS PlanDate,
            TRY_CONVERT(INT, JSON_VALUE(p.value, '$.materialId')) AS MaterialID,
            TRY_CONVERT(INT, JSON_VALUE(p.value, '$.supplierId')) AS SupplierID,
            NULLIF(LTRIM(RTRIM(JSON_VALUE(p.value, '$.poNumber'))), '') AS PONumber,
            CASE
                WHEN JSON_VALUE(p.value, '$.planQtyKg') IS NOT NULL
                    THEN TRY_CONVERT(DECIMAL(18,0), JSON_VALUE(p.value, '$.planQtyKg'))
                WHEN JSON_VALUE(p.value, '$.planQtyTons') IS NOT NULL
                    THEN CAST(ROUND(TRY_CONVERT(DECIMAL(18,3), JSON_VALUE(p.value, '$.planQtyTons')) * 1000.0, 0) AS DECIMAL(18,0))
                ELSE NULL
            END AS PlanQtyKg,
            SUBSTRING(LTRIM(RTRIM(JSON_VALUE(p.value, '$.note'))), 1, 250) AS Note
        INTO #ParsedPlans
        FROM OPENJSON(ISNULL(@PlansJson, '[]')) p;

        -- Kiểm tra tính hợp lệ của từng dòng
        IF EXISTS (SELECT 1 FROM #ParsedPlans WHERE PlanDate IS NULL OR PlanDate < @WeekStart OR PlanDate > @WeekEnd)
        BEGIN
            THROW 50400, N'[50400] Có dòng kế hoạch chứa PlanDate không nằm trong tuần tương ứng.', 1;
        END

        IF EXISTS (SELECT 1 FROM #ParsedPlans WHERE PlanQtyKg IS NULL OR PlanQtyKg <= 0)
        BEGIN
            THROW 50400, N'[50400] Khối lượng kế hoạch phải lớn hơn 0 kg (hoặc 0 tấn).', 1;
        END

        IF EXISTS (
            SELECT 1 FROM #ParsedPlans pp
            WHERE NOT EXISTS (SELECT 1 FROM dbo.dim_Material m WHERE m.MaterialID = pp.MaterialID)
        )
        BEGIN
            THROW 50404, N'[50404] Có nguyên liệu không tồn tại trong hệ thống.', 1;
        END

        IF EXISTS (
            SELECT 1 FROM #ParsedPlans pp
            WHERE NOT EXISTS (SELECT 1 FROM dbo.dim_Supplier s WHERE s.SupplierID = pp.SupplierID)
        )
        BEGIN
            THROW 50404, N'[50404] Có nhà cung cấp không tồn tại trong hệ thống.', 1;
        END

        -- Kiểm tra trùng lặp dòng có PO trong cùng ngày (BR-26a)
        IF EXISTS (
            SELECT PlanDate, MaterialID, SupplierID, PONumber
            FROM #ParsedPlans
            WHERE PONumber IS NOT NULL
            GROUP BY PlanDate, MaterialID, SupplierID, PONumber
            HAVING COUNT(*) > 1
        )
        BEGIN
            THROW 50400, N'[50400] Vi phạm ràng buộc trùng lặp dòng kế hoạch có cùng số PO trong một ngày (BR-26a).', 1;
        END

        BEGIN TRANSACTION;

        -- 3. Lưu giá trị cũ phục vụ kiểm toán
        DECLARE @OldPlansCount INT;
        SELECT @OldPlansCount = COUNT(*)
        FROM dbo.fact_Delivery_Plan WITH (UPDLOCK, HOLDLOCK)
        WHERE FactoryID = @FactoryID 
          AND PlanDate BETWEEN @WeekStart AND @WeekEnd
          AND (
              (@MaterialID IS NOT NULL AND MaterialID = @MaterialID)
              OR (@MaterialIdsJson IS NOT NULL AND MaterialID IN (SELECT TRY_CONVERT(INT, value) FROM OPENJSON(@MaterialIdsJson)))
              OR (@MaterialID IS NULL AND @MaterialIdsJson IS NULL AND MaterialID IN (SELECT DISTINCT MaterialID FROM #ParsedPlans))
          );

        -- 4. Xóa kế hoạch cũ có chọn lọc (tránh xóa nhầm các nguyên liệu khác trong tuần)
        -- Sửa triệt để N2: Nếu có @MaterialIdsJson (danh sách nguyên liệu hiển thị trên lưới),
        -- xóa sạch các dòng cũ của các nguyên liệu đó kể cả khi trên lưới người dùng xóa hết các ngày (plans = 0)
        IF @MaterialID IS NOT NULL
        BEGIN
            DELETE FROM dbo.fact_Delivery_Plan
            WHERE FactoryID = @FactoryID 
              AND PlanDate BETWEEN @WeekStart AND @WeekEnd
              AND MaterialID = @MaterialID;
        END
        ELSE IF @MaterialIdsJson IS NOT NULL AND ISJSON(@MaterialIdsJson) = 1
        BEGIN
            DELETE FROM dbo.fact_Delivery_Plan
            WHERE FactoryID = @FactoryID 
              AND PlanDate BETWEEN @WeekStart AND @WeekEnd
              AND MaterialID IN (SELECT TRY_CONVERT(INT, value) FROM OPENJSON(@MaterialIdsJson));
        END
        ELSE
        BEGIN
            DELETE FROM dbo.fact_Delivery_Plan
            WHERE FactoryID = @FactoryID 
              AND PlanDate BETWEEN @WeekStart AND @WeekEnd
              AND MaterialID IN (SELECT DISTINCT MaterialID FROM #ParsedPlans);
        END

        -- 5. Chèn toàn bộ các dòng mới
        INSERT INTO dbo.fact_Delivery_Plan (
            PlanDate, FactoryID, MaterialID, SupplierID, PONumber, PlanQtyKg, Note,
            CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
        )
        SELECT
            PlanDate, @FactoryID, MaterialID, SupplierID, PONumber, PlanQtyKg, Note,
            SYSUTCDATETIME(), @Username, SYSUTCDATETIME(), @Username
        FROM #ParsedPlans;

        DECLARE @InsertedCount INT = @@ROWCOUNT;
        DECLARE @TotalInsertedKg DECIMAL(18,0) = (SELECT ISNULL(SUM(PlanQtyKg), 0) FROM #ParsedPlans);

        -- 6. Ghi nhận Audit Log (DELIVERY_PLAN_SAVE_WEEK)
        DECLARE @AuditNewValues NVARCHAR(MAX) = (
            SELECT
                @FactoryID AS factoryId,
                CONVERT(VARCHAR(10), @WeekStart, 23) AS weekStartDate,
                CONVERT(VARCHAR(10), @WeekEnd, 23) AS weekEndDate,
                @InsertedCount AS savedItemsCount,
                @TotalInsertedKg AS totalPlanKg,
                CAST(ROUND(@TotalInsertedKg / 1000.0, 3) AS DECIMAL(18,3)) AS totalPlanTons
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @UserID, @Username, 'DELIVERY_PLAN_SAVE_WEEK', 'fact_Delivery_Plan',
            CONVERT(VARCHAR(10), @WeekStart, 23), @IPAddress,
            CONCAT(N'{"previousPlansCount":', @OldPlansCount, '}'), @AuditNewValues, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        SELECT
            @FactoryID AS FactoryID,
            CONVERT(VARCHAR(10), @WeekStart, 23) AS WeekStartDate,
            CONVERT(VARCHAR(10), @WeekEnd, 23) AS WeekEndDate,
            @InsertedCount AS SavedCount,
            @TotalInsertedKg AS TotalPlanKg,
            CAST(ROUND(@TotalInsertedKg / 1000.0, 3) AS DECIMAL(18,3)) AS TotalPlanTons;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 4. dbo.usp_DeliveryPlan_GetPoOptions
-- Lấy danh sách PO Pending còn mở của cặp (FactoryID, MaterialID) sắp xếp FIFO ngày giao
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_DeliveryPlan_GetPoOptions
    @FactoryID INT,
    @MaterialID INT,
    @SupplierID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    DECLARE @LatestSnapshot DATE;
    SELECT @LatestSnapshot = MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH;

    SELECT
        po.PoPendingID,
        po.PONumber,
        po.DocType,
        s.SupplierID,
        po.VendorAccount AS SupplierCode,
        s.SupplierName,
        po.OrderQtyKg,
        CAST(ROUND(po.OrderQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS OrderQtyTons,
        po.DeliverRemainderKg,
        CAST(ROUND(po.DeliverRemainderKg / 1000.0, 3) AS DECIMAL(18,3)) AS DeliverRemainderTons,
        CONVERT(VARCHAR(10), po.DeliveryDate, 23) AS DeliveryDate
    FROM dbo.fact_PO_Pending po
    LEFT JOIN dbo.dim_Supplier s ON po.VendorAccount = s.SupplierCode
    WHERE po.SnapshotDate = @LatestSnapshot
      AND po.FactoryID = @FactoryID
      AND po.MaterialID = @MaterialID
      AND (@SupplierID IS NULL OR s.SupplierID = @SupplierID)
      AND po.DeliverRemainderKg > 0
    ORDER BY po.DeliveryDate ASC, po.PoPendingID ASC;
END;
GO
