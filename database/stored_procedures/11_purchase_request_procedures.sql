-- =====================================================================================
-- PHÂN HỆ F08: QUẢN LÝ ĐỀ NGHỊ MUA HÀNG (PURCHASE REQUEST & SUGGESTIONS)
-- File: database/stored_procedures/11_purchase_request_procedures.sql
-- Quy tắc áp dụng:
--   - BR-25, BR-25a: Thuật toán gợi ý mua hàng theo DOI và khấu trừ PO đang về + PR đang SENT
--   - BR-27, BR-27a: Vòng đời trạng thái PR (SENT -> MATCHED / EXPIRED / CANCELLED)
--   - Sinh mã PR có khóa bi quan UPDLOCK, HOLDLOCK: PR-YYYYMMDD-XXXX
--   - Đơn vị đo: Hiển thị Tấn / Kg, lưu trữ KG nguyên
-- =====================================================================================

USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Đảm bảo bảng fact_Purchase_Request đã có đầy đủ cấu trúc & ràng buộc
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'fact_Purchase_Request')
BEGIN
    CREATE TABLE dbo.fact_Purchase_Request (
        RequestID INT IDENTITY(1,1) NOT NULL,
        RequestCode VARCHAR(30) NOT NULL,    -- 'PR-YYYYMMDD-XXXX'
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        SupplierID INT NOT NULL,
        RequestedQtyKg DECIMAL(18,0) NOT NULL,
        NeedByDate DATE NOT NULL,            -- Ngày cần hàng về nhà máy
        Status VARCHAR(20) NOT NULL DEFAULT 'SENT', -- 'SENT', 'MATCHED', 'EXPIRED', 'CANCELLED'
        PONumber NVARCHAR(50) NULL,          -- Cập nhật khi status = MATCHED
        Note NVARCHAR(250) NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedBy NVARCHAR(50) NOT NULL,
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy NVARCHAR(50) NOT NULL,
        CONSTRAINT PK_fact_Purchase_Request PRIMARY KEY CLUSTERED (RequestID),
        CONSTRAINT UQ_PurchaseRequest_Code UNIQUE (RequestCode),
        CONSTRAINT FK_PurchaseRequest_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_PurchaseRequest_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_PurchaseRequest_Supplier FOREIGN KEY (SupplierID) REFERENCES dbo.dim_Supplier(SupplierID),
        CONSTRAINT CK_PurchaseRequest_Qty CHECK (RequestedQtyKg > 0),
        CONSTRAINT CK_PurchaseRequest_Status CHECK (Status IN ('SENT', 'MATCHED', 'EXPIRED', 'CANCELLED'))
    );
END;
GO

-- =====================================================================================
-- 2. dbo.usp_PurchaseRequest_Create
-- Tạo mới PR với mã PR-YYYYMMDD-XXXX chống xung đột đồng thời (UPDLOCK, HOLDLOCK)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_PurchaseRequest_Create
    @UserID INT,
    @Username NVARCHAR(50),
    @FactoryID INT,
    @MaterialID INT,
    @SupplierID INT,
    @RequestedQtyKg DECIMAL(18,0),
    @NeedByDate DATE,
    @Note NVARCHAR(250) = NULL,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    BEGIN TRY
        -- 1. Kiểm tra phạm vi nhà máy của user
        DECLARE @FactoryScope VARCHAR(20);
        SELECT @FactoryScope = r.FactoryScope
        FROM dbo.sys_User u
        INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
        WHERE u.UserID = @UserID;

        IF @FactoryScope = 'ASSIGNED'
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM dbo.sys_User_Factory
                WHERE UserID = @UserID AND FactoryID = @FactoryID
            )
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền tạo đề nghị mua hàng cho nhà máy này.', 1;
            END
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = @FactoryID)
        BEGIN
            THROW 50404, N'[50404] Nhà máy không tồn tại.', 1;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = @MaterialID)
        BEGIN
            THROW 50404, N'[50404] Nguyên liệu không tồn tại.', 1;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Supplier WHERE SupplierID = @SupplierID)
        BEGIN
            THROW 50404, N'[50404] Nhà cung cấp không tồn tại.', 1;
        END

        IF @RequestedQtyKg IS NULL OR @RequestedQtyKg <= 0
        BEGIN
            THROW 50400, N'[50400] Khối lượng đề nghị mua hàng phải lớn hơn 0.', 1;
        END

        IF @NeedByDate IS NULL
        BEGIN
            THROW 50400, N'[50400] Ngày cần hàng (NeedByDate) là bắt buộc.', 1;
        END

        BEGIN TRANSACTION;

        -- 2. Sinh mã PR với khóa độc quyền chống trùng lặp đồng thời
        DECLARE @TodayStr VARCHAR(8) = CONVERT(VARCHAR(8), SYSUTCDATETIME(), 112); -- 'YYYYMMDD'
        DECLARE @Prefix VARCHAR(12) = 'PR-' + @TodayStr + '-';

        DECLARE @MaxSeq INT = 0;
        SELECT @MaxSeq = ISNULL(MAX(TRY_CAST(RIGHT(RequestCode, 4) AS INT)), 0)
        FROM dbo.fact_Purchase_Request WITH (UPDLOCK, HOLDLOCK)
        WHERE RequestCode LIKE @Prefix + '%';

        DECLARE @NewRequestCode VARCHAR(30) = @Prefix + RIGHT('0000' + CAST(@MaxSeq + 1 AS VARCHAR(4)), 4);

        -- 3. Chèn bản ghi PR mới
        INSERT INTO dbo.fact_Purchase_Request (
            RequestCode, FactoryID, MaterialID, SupplierID, RequestedQtyKg, NeedByDate,
            Status, PONumber, Note, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
        )
        VALUES (
            @NewRequestCode, @FactoryID, @MaterialID, @SupplierID, @RequestedQtyKg, @NeedByDate,
            'SENT', NULL, @Note, SYSUTCDATETIME(), @Username, SYSUTCDATETIME(), @Username
        );

        DECLARE @NewRequestID INT = SCOPE_IDENTITY();

        -- 4. Ghi nhận nhật ký kiểm toán (PURCHASE_REQUEST_CREATE)
        DECLARE @AuditNewValues NVARCHAR(MAX) = (
            SELECT
                @NewRequestID AS requestId,
                @NewRequestCode AS requestCode,
                @FactoryID AS factoryId,
                @MaterialID AS materialId,
                @SupplierID AS supplierId,
                @RequestedQtyKg AS requestedQtyKg,
                CAST(ROUND(@RequestedQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS requestedQtyTons,
                CONVERT(VARCHAR(10), @NeedByDate, 23) AS needByDate,
                'SENT' AS status,
                @Note AS note
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @UserID, @Username, 'PURCHASE_REQUEST_CREATE', 'fact_Purchase_Request',
            @NewRequestCode, @IPAddress, NULL, @AuditNewValues, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        -- 5. Trả về thông tin chi tiết của PR vừa tạo
        SELECT
            pr.RequestID,
            pr.RequestCode,
            pr.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            pr.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            m.BagKg,
            m.DisplayDecimals,
            pr.SupplierID,
            s.SupplierCode,
            s.SupplierName,
            pr.RequestedQtyKg,
            CAST(ROUND(pr.RequestedQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS RequestedQtyTons,
            CONVERT(VARCHAR(10), pr.NeedByDate, 23) AS NeedByDate,
            pr.Status,
            pr.PONumber,
            pr.Note,
            pr.CreatedAt,
            pr.CreatedBy,
            pr.UpdatedAt,
            pr.UpdatedBy
        FROM dbo.fact_Purchase_Request pr
        INNER JOIN dbo.dim_Factory f ON pr.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON pr.MaterialID = m.MaterialID
        INNER JOIN dbo.dim_Supplier s ON pr.SupplierID = s.SupplierID
        WHERE pr.RequestID = @NewRequestID;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 3. dbo.usp_PurchaseRequest_ChangeStatus
-- Cập nhật trạng thái PR với kiểm soát chuyển dịch trạng thái nghiêm ngặt (BR-27, BR-27a)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_PurchaseRequest_ChangeStatus
    @UserID INT,
    @Username NVARCHAR(50),
    @RequestID INT,
    @NewStatus VARCHAR(20),
    @PONumber NVARCHAR(50) = NULL,
    @CancelReason NVARCHAR(250) = NULL,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    BEGIN TRY
        -- 1. Kiểm tra phạm vi nhà máy của user
        DECLARE @FactoryScope VARCHAR(20);
        SELECT @FactoryScope = r.FactoryScope
        FROM dbo.sys_User u
        INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
        WHERE u.UserID = @UserID;

        BEGIN TRANSACTION;

        DECLARE @CurrentStatus VARCHAR(20);
        DECLARE @CurrentFactoryID INT;
        DECLARE @RequestCode VARCHAR(30);
        DECLARE @OldNote NVARCHAR(250);
        DECLARE @OldPo NVARCHAR(50);

        SELECT
            @CurrentStatus = Status,
            @CurrentFactoryID = FactoryID,
            @RequestCode = RequestCode,
            @OldNote = Note,
            @OldPo = PONumber
        FROM dbo.fact_Purchase_Request WITH (UPDLOCK, HOLDLOCK)
        WHERE RequestID = @RequestID;

        IF @CurrentStatus IS NULL
        BEGIN
            THROW 50404, N'[50404] Phiếu đề nghị mua hàng không tồn tại.', 1;
        END

        IF @FactoryScope = 'ASSIGNED'
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM dbo.sys_User_Factory
                WHERE UserID = @UserID AND FactoryID = @CurrentFactoryID
            )
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền thao tác trên đề nghị mua hàng của nhà máy này.', 1;
            END
        END

        -- Kiểm tra hợp lệ NewStatus
        IF @NewStatus NOT IN ('MATCHED', 'EXPIRED', 'CANCELLED')
        BEGIN
            THROW 50400, N'[50400] Trạng thái mới không hợp lệ. Chỉ chấp nhận MATCHED, EXPIRED, CANCELLED.', 1;
        END

        -- Ràng buộc BR-27a: Chỉ trạng thái SENT mới được phép đổi sang trạng thái khác
        IF @CurrentStatus <> 'SENT'
        BEGIN
            DECLARE @ErrLockMsg NVARCHAR(200) = FORMATMESSAGE(
                N'[50409] Phiếu đề nghị đã ở trạng thái kết thúc (%s), không thể thay đổi trạng thái.',
                @CurrentStatus
            );
            THROW 50409, @ErrLockMsg, 1;
        END

        -- Ràng buộc BR-27: Chuyển sang MATCHED bắt buộc phải cung cấp số PO
        DECLARE @TrimmedPo NVARCHAR(50) = NULLIF(LTRIM(RTRIM(@PONumber)), '');
        IF @NewStatus = 'MATCHED' AND @TrimmedPo IS NULL
        BEGIN
            THROW 50400, N'[50400] Chuyển sang trạng thái MATCHED bắt buộc phải cung cấp số PO.', 1;
        END

        -- Cập nhật trạng thái
        DECLARE @NewNote NVARCHAR(250) = @OldNote;
        IF @NewStatus = 'CANCELLED' AND NULLIF(LTRIM(RTRIM(@CancelReason)), '') IS NOT NULL
        BEGIN
            SET @NewNote = SUBSTRING(
                ISNULL(@OldNote + ' | ', '') + N'Lý do hủy: ' + LTRIM(RTRIM(@CancelReason)),
                1, 250
            );
        END

        UPDATE dbo.fact_Purchase_Request
        SET Status = @NewStatus,
            PONumber = CASE WHEN @NewStatus = 'MATCHED' THEN @TrimmedPo ELSE PONumber END,
            Note = @NewNote,
            UpdatedAt = SYSUTCDATETIME(),
            UpdatedBy = @Username
        WHERE RequestID = @RequestID;

        -- Ghi nhận nhật ký kiểm toán (PURCHASE_REQUEST_STATUS_CHANGE)
        DECLARE @AuditOldValues NVARCHAR(MAX) = (
            SELECT @CurrentStatus AS status, @OldPo AS poNumber, @OldNote AS note
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        DECLARE @AuditNewValues NVARCHAR(MAX) = (
            SELECT @NewStatus AS status, @TrimmedPo AS poNumber, @NewNote AS note
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @UserID, @Username, 'PURCHASE_REQUEST_STATUS_CHANGE', 'fact_Purchase_Request',
            @RequestCode, @IPAddress, @AuditOldValues, @AuditNewValues, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        SELECT
            pr.RequestID,
            pr.RequestCode,
            pr.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            pr.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            pr.SupplierID,
            s.SupplierCode,
            s.SupplierName,
            pr.RequestedQtyKg,
            CAST(ROUND(pr.RequestedQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS RequestedQtyTons,
            CONVERT(VARCHAR(10), pr.NeedByDate, 23) AS NeedByDate,
            pr.Status,
            pr.PONumber,
            pr.Note,
            pr.CreatedAt,
            pr.CreatedBy,
            pr.UpdatedAt,
            pr.UpdatedBy
        FROM dbo.fact_Purchase_Request pr
        INNER JOIN dbo.dim_Factory f ON pr.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON pr.MaterialID = m.MaterialID
        INNER JOIN dbo.dim_Supplier s ON pr.SupplierID = s.SupplierID
        WHERE pr.RequestID = @RequestID;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 4. dbo.usp_PurchaseRequest_List
-- Danh sách PR hỗ trợ phân trang (10/20/50/all), lọc đa năng và tìm kiếm
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_PurchaseRequest_List
    @UserID INT,
    @Search NVARCHAR(100) = NULL,
    @FactoryID INT = NULL,
    @MaterialID INT = NULL,
    @SupplierID INT = NULL,
    @Status VARCHAR(20) = NULL,
    @FromDate DATE = NULL,
    @ToDate DATE = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'CreatedAt',
    @SortOrder NVARCHAR(4) = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    BEGIN TRY
        DECLARE @FactoryScope VARCHAR(20);
        SELECT @FactoryScope = r.FactoryScope
        FROM dbo.sys_User u
        INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
        WHERE u.UserID = @UserID;

        IF @FactoryScope = 'ASSIGNED' AND @FactoryID IS NOT NULL
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM dbo.sys_User_Factory
                WHERE UserID = @UserID AND FactoryID = @FactoryID
            )
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền truy cập đề nghị mua hàng của nhà máy này.', 1;
            END
        END

        DECLARE @CleanSearch NVARCHAR(100) = NULLIF(LTRIM(RTRIM(@Search)), '');
        DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
        DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

        WITH FilteredRequests AS (
            SELECT
                pr.RequestID,
                pr.RequestCode,
                pr.FactoryID,
                f.FactoryCode,
                f.FactoryName,
                pr.MaterialID,
                m.MaterialCode,
                m.MaterialName,
                m.Category,
                m.ItemGroup,
                m.BagKg,
                m.DisplayDecimals,
                pr.SupplierID,
                s.SupplierCode,
                s.SupplierName,
                pr.RequestedQtyKg,
                CAST(ROUND(pr.RequestedQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS RequestedQtyTons,
                CONVERT(VARCHAR(10), pr.NeedByDate, 23) AS NeedByDate,
                pr.Status,
                pr.PONumber,
                pr.Note,
                pr.CreatedAt,
                pr.CreatedBy,
                pr.UpdatedAt,
                pr.UpdatedBy,
                COUNT(*) OVER() AS TotalCount
            FROM dbo.fact_Purchase_Request pr
            INNER JOIN dbo.dim_Factory f ON pr.FactoryID = f.FactoryID
            INNER JOIN dbo.dim_Material m ON pr.MaterialID = m.MaterialID
            INNER JOIN dbo.dim_Supplier s ON pr.SupplierID = s.SupplierID
            WHERE (@FactoryScope <> 'ASSIGNED' OR pr.FactoryID IN (
                SELECT FactoryID FROM dbo.sys_User_Factory WHERE UserID = @UserID
            ))
              AND (@FactoryID IS NULL OR pr.FactoryID = @FactoryID)
              AND (@MaterialID IS NULL OR pr.MaterialID = @MaterialID)
              AND (@SupplierID IS NULL OR pr.SupplierID = @SupplierID)
              AND (@Status IS NULL OR pr.Status = @Status)
              AND (@FromDate IS NULL OR pr.NeedByDate >= @FromDate)
              AND (@ToDate IS NULL OR pr.NeedByDate <= @ToDate)
              AND (
                  @CleanSearch IS NULL
                  OR pr.RequestCode LIKE '%' + @CleanSearch + '%'
                  OR m.MaterialCode LIKE '%' + @CleanSearch + '%'
                  OR m.MaterialName LIKE '%' + @CleanSearch + '%'
                  OR s.SupplierName LIKE '%' + @CleanSearch + '%'
                  OR pr.PONumber LIKE '%' + @CleanSearch + '%'
              )
        )
        SELECT *
        FROM FilteredRequests
        ORDER BY
            CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'CreatedAt' THEN CreatedAt END ASC,
            CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'CreatedAt' THEN CreatedAt END DESC,
            CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'NeedByDate' THEN NeedByDate END ASC,
            CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'NeedByDate' THEN NeedByDate END DESC,
            CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'RequestedQtyKg' THEN RequestedQtyKg END ASC,
            CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'RequestedQtyKg' THEN RequestedQtyKg END DESC,
            RequestID DESC
        OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;

    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 5. dbo.usp_PurchaseRequest_GetExportData
-- Lấy dữ liệu danh sách PR phục vụ xuất file Excel theo danh sách ID hoặc bộ lọc
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_PurchaseRequest_GetExportData
    @UserID INT,
    @RequestIdsJson NVARCHAR(MAX) = NULL,
    @FactoryID INT = NULL,
    @Status VARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    BEGIN TRY
        DECLARE @FactoryScope VARCHAR(20);
        SELECT @FactoryScope = r.FactoryScope
        FROM dbo.sys_User u
        INNER JOIN dbo.sys_Role r ON u.RoleCode = r.RoleCode
        WHERE u.UserID = @UserID;

        IF @FactoryScope = 'ASSIGNED' AND @FactoryID IS NOT NULL
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM dbo.sys_User_Factory
                WHERE UserID = @UserID AND FactoryID = @FactoryID
            )
            BEGIN
                THROW 50403, N'[50403] Bạn không có quyền xuất dữ liệu của nhà máy này.', 1;
            END
        END

        SELECT
            pr.RequestID,
            pr.RequestCode,
            f.FactoryCode,
            f.FactoryName,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            s.SupplierCode,
            s.SupplierName,
            pr.RequestedQtyKg,
            CAST(ROUND(pr.RequestedQtyKg / 1000.0, 3) AS DECIMAL(18,3)) AS RequestedQtyTons,
            CONVERT(VARCHAR(10), pr.NeedByDate, 23) AS NeedByDate,
            pr.Status,
            pr.PONumber,
            pr.Note,
            CONVERT(VARCHAR(19), pr.CreatedAt, 120) AS CreatedAt,
            pr.CreatedBy,
            CONVERT(VARCHAR(19), pr.UpdatedAt, 120) AS UpdatedAt,
            pr.UpdatedBy
        FROM dbo.fact_Purchase_Request pr
        INNER JOIN dbo.dim_Factory f ON pr.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON pr.MaterialID = m.MaterialID
        INNER JOIN dbo.dim_Supplier s ON pr.SupplierID = s.SupplierID
        WHERE (@FactoryScope <> 'ASSIGNED' OR pr.FactoryID IN (
            SELECT FactoryID FROM dbo.sys_User_Factory WHERE UserID = @UserID
        ))
          AND (@FactoryID IS NULL OR pr.FactoryID = @FactoryID)
          AND (@Status IS NULL OR pr.Status = @Status)
          AND (
              @RequestIdsJson IS NULL
              OR pr.RequestID IN (SELECT TRY_CONVERT(INT, value) FROM OPENJSON(@RequestIdsJson))
          )
        ORDER BY pr.NeedByDate ASC, pr.RequestID DESC;

    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 6. dbo.usp_PurchaseRequest_GetSentPrTotals
-- Lấy tổng khối lượng các PR đang ở trạng thái SENT theo từng cặp để khấu trừ (BR-25a)
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_PurchaseRequest_GetSentPrTotals
    @FactoryID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    SELECT
        FactoryID,
        MaterialID,
        COUNT(*) AS SentPrCount,
        ISNULL(SUM(RequestedQtyKg), 0) AS SentPrKg
    FROM dbo.fact_Purchase_Request
    WHERE Status = 'SENT'
      AND (@FactoryID IS NULL OR FactoryID = @FactoryID)
    GROUP BY FactoryID, MaterialID;
END;
GO

-- =====================================================================================
-- 7. dbo.usp_PurchaseRequest_GetPairSuppliers
-- Lấy NCC mặc định và LeadTimeDays cho từng cặp NM-NL đang theo dõi
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_PurchaseRequest_GetPairSuppliers
    @FactoryID INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET ANSI_NULLS ON;
    SET QUOTED_IDENTIFIER ON;

    WITH RecentPoSuppliers AS (
        SELECT
            po.FactoryID,
            po.MaterialID,
            s.SupplierID,
            s.SupplierCode,
            s.SupplierName,
            s.LeadTimeDays,
            ROW_NUMBER() OVER(PARTITION BY po.FactoryID, po.MaterialID ORDER BY po.DeliveryDate DESC, po.PoPendingID DESC) AS rn
        FROM dbo.fact_PO_Pending po
        INNER JOIN dbo.dim_Supplier s ON po.VendorAccount = s.SupplierCode
        WHERE @FactoryID IS NULL OR po.FactoryID = @FactoryID
    ),
    RecentReceiptSuppliers AS (
        SELECT
            pr.FactoryID,
            pr.MaterialID,
            s.SupplierID,
            s.SupplierCode,
            s.SupplierName,
            s.LeadTimeDays,
            ROW_NUMBER() OVER(PARTITION BY pr.FactoryID, pr.MaterialID ORDER BY pr.DeliveryDate DESC, pr.ReceiptID DESC) AS rn
        FROM dbo.fact_PO_Receipt pr
        INNER JOIN dbo.dim_Supplier s ON pr.SupplierID = s.SupplierID
        WHERE @FactoryID IS NULL OR pr.FactoryID = @FactoryID
    ),
    FirstSupplier AS (
        SELECT TOP 1
            SupplierID,
            SupplierCode,
            SupplierName,
            LeadTimeDays
        FROM dbo.dim_Supplier
        WHERE IsActive = 1
        ORDER BY SupplierID ASC
    )
    SELECT
        fm.FactoryID,
        fm.MaterialID,
        COALESCE(pos.SupplierID, prs.SupplierID, fs.SupplierID) AS SupplierID,
        COALESCE(pos.SupplierCode, prs.SupplierCode, fs.SupplierCode) AS SupplierCode,
        COALESCE(pos.SupplierName, prs.SupplierName, fs.SupplierName) AS SupplierName,
        COALESCE(pos.LeadTimeDays, prs.LeadTimeDays, fs.LeadTimeDays, 7) AS LeadTimeDays
    FROM dbo.dim_Factory_Material fm
    LEFT JOIN RecentPoSuppliers pos ON fm.FactoryID = pos.FactoryID AND fm.MaterialID = pos.MaterialID AND pos.rn = 1
    LEFT JOIN RecentReceiptSuppliers prs ON fm.FactoryID = prs.FactoryID AND fm.MaterialID = prs.MaterialID AND prs.rn = 1
    CROSS JOIN FirstSupplier fs
    WHERE fm.IsTracked = 1
      AND (@FactoryID IS NULL OR fm.FactoryID = @FactoryID);
END;
GO
