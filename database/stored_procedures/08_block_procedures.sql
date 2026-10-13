-- =====================================================================================
-- PHÂN HỆ F06: QUẢN LÝ TỒN BỊ KHÓA (CHẶN TỒN THỦ CÔNG & KIỂM TRA HẠN MỨC)
-- File: database/stored_procedures/08_block_procedures.sql
-- Quy tắc áp dụng:
--   - BR-04: Hiệu lực khóa tại ngày chốt C: StartDate <= C AND (EndDate IS NULL OR EndDate > C)
--   - BR-28: Không có cột Status vật lý; suy diễn động từ EndDate (ACTIVE / RELEASED)
--   - BR-28a: Kiểm tra hạn mức khóa an toàn với khóa dòng bi quan WITH (UPDLOCK, HOLDLOCK):
--             SUM(BlockedKg đang khóa) + BlockedKg mới <= SOH(C_mới_nhất)
-- =====================================================================================

USE PremixTrack_DB;
GO

-- =====================================================================================
-- 1. dbo.usp_Block_List
-- Danh sách lệnh khóa tồn kho có phân trang (10/20/50/all), lọc nhà máy, nguyên liệu,
-- trạng thái suy diễn động (ACTIVE / RELEASED) và tìm kiếm từ khóa.
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Block_List
    @UserID INT,
    @Search NVARCHAR(100) = NULL,
    @FactoryID INT = NULL,
    @MaterialID INT = NULL,
    @Status VARCHAR(10) = NULL,       -- 'ACTIVE', 'RELEASED', 'ALL' hoặc NULL
    @AsOfDate VARCHAR(20) = NULL,     -- Ngày mốc xét trạng thái (YYYY-MM-DD, mặc định hôm nay)
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'CreatedAt',
    @SortOrder NVARCHAR(4) = 'DESC'
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- 1. Kiểm tra phạm vi nhà máy của User
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
                THROW 50403, N'[50403] Bạn không có quyền truy cập dữ liệu tồn bị khóa của nhà máy này.', 1;
            END
        END

        -- 2. Xác định ngày mốc @RefDate và ngày chốt SOH mới nhất @LatestSnapshot
        DECLARE @RefDate DATE = TRY_CONVERT(DATE, @AsOfDate);
        IF @RefDate IS NULL
            SET @RefDate = CAST(SYSDATETIME() AS DATE);

        DECLARE @LatestSnapshot DATE;
        SELECT @LatestSnapshot = MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH;

        DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
        DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

        -- 3. Truy vấn danh sách lệnh khóa kèm SOH mới nhất và trạng thái suy diễn động (BR-28)
        ;WITH LatestSohCTE AS (
            SELECT FactoryID, MaterialID, SohQtyKg
            FROM dbo.fact_Inventory_SOH
            WHERE SnapshotDate = @LatestSnapshot
        ),
        FilteredBlocks AS (
            SELECT
                b.BlockID,
                b.FactoryID,
                f.FactoryCode,
                f.FactoryName,
                b.MaterialID,
                m.MaterialCode,
                m.MaterialName,
                m.Category,
                m.ItemGroup,
                m.BagKg,
                m.DisplayDecimals,
                b.BlockedKg,
                ISNULL(s.SohQtyKg, 0) AS CurrentSohKg,
                CONVERT(VARCHAR(10), b.StartDate, 23) AS StartDate,
                CONVERT(VARCHAR(10), b.EndDate, 23) AS EndDate,
                CASE
                    WHEN b.EndDate IS NULL OR b.EndDate > @RefDate THEN 'ACTIVE'
                    ELSE 'RELEASED'
                END AS BlockStatus,
                b.Reason,
                b.CreatedAt,
                b.CreatedBy,
                b.ReleasedAt,
                b.ReleasedBy,
                COUNT(*) OVER() AS TotalCount
            FROM dbo.fact_Inventory_Block b
            INNER JOIN dbo.dim_Factory f ON b.FactoryID = f.FactoryID
            INNER JOIN dbo.dim_Material m ON b.MaterialID = m.MaterialID
            LEFT JOIN LatestSohCTE s ON b.FactoryID = s.FactoryID AND b.MaterialID = s.MaterialID
            WHERE (@FactoryScope <> 'ASSIGNED' OR b.FactoryID IN (
                      SELECT FactoryID FROM dbo.sys_User_Factory WHERE UserID = @UserID
                  ))
              AND (@FactoryID IS NULL OR b.FactoryID = @FactoryID)
              AND (@MaterialID IS NULL OR b.MaterialID = @MaterialID)
              AND (@Search IS NULL OR LEN(LTRIM(RTRIM(@Search))) = 0
                   OR m.MaterialCode LIKE '%' + LTRIM(RTRIM(@Search)) + '%'
                   OR m.MaterialName LIKE N'%' + LTRIM(RTRIM(@Search)) + N'%'
                   OR f.FactoryCode LIKE '%' + LTRIM(RTRIM(@Search)) + '%'
                   OR b.Reason LIKE N'%' + LTRIM(RTRIM(@Search)) + N'%')
              AND (@Status IS NULL OR @Status = 'ALL' OR (
                   (@Status = 'ACTIVE' AND (b.EndDate IS NULL OR b.EndDate > @RefDate)) OR
                   (@Status = 'RELEASED' AND b.EndDate IS NOT NULL AND b.EndDate <= @RefDate)
              ))
        )
        SELECT
            BlockID,
            FactoryID,
            FactoryCode,
            FactoryName,
            MaterialID,
            MaterialCode,
            MaterialName,
            Category,
            ItemGroup,
            BagKg,
            DisplayDecimals,
            BlockedKg,
            CurrentSohKg,
            StartDate,
            EndDate,
            BlockStatus,
            Reason,
            CreatedAt,
            CreatedBy,
            ReleasedAt,
            ReleasedBy,
            TotalCount
        FROM FilteredBlocks
        ORDER BY
            CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'CreatedAt' THEN CreatedAt END ASC,
            CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'CreatedAt' THEN CreatedAt END DESC,
            CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'BlockedKg' THEN BlockedKg END ASC,
            CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'BlockedKg' THEN BlockedKg END DESC,
            CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'StartDate' THEN StartDate END ASC,
            CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'StartDate' THEN StartDate END DESC,
            BlockID DESC
        OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 2. dbo.usp_Block_Create
-- Tạo lệnh khóa hàng mới với kiểm soát đồng thời (UPDLOCK, HOLDLOCK) và kiểm tra
-- hạn mức an toàn BR-28a: BlockedKg mới <= SOH(C_mới_nhất) - SUM(BlockedKg đang khóa).
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Block_Create
    @UserID INT,
    @Username NVARCHAR(50),
    @FactoryID INT,
    @MaterialID INT,
    @BlockedKg DECIMAL(18,0),
    @StartDate VARCHAR(20) = NULL,
    @Reason NVARCHAR(250),
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        -- 1. Kiểm tra quyền phạm vi nhà máy (FactoryScope)
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
                THROW 50403, N'[50403] Bạn không có quyền tạo lệnh khóa hàng tại nhà máy ngoài phạm vi phân công.', 1;
            END
        END

        -- 2. Kiểm tra dữ liệu đầu vào cơ bản
        IF @BlockedKg IS NULL OR @BlockedKg <= 0
        BEGIN
            THROW 50400, N'[50400] Số lượng khóa phải lớn hơn 0 kg.', 1;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = @FactoryID AND IsActive = 1)
        BEGIN
            THROW 50404, N'[50404] Nhà máy không tồn tại hoặc đã ngừng hoạt động.', 1;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = @MaterialID AND IsActive = 1)
        BEGIN
            THROW 50404, N'[50404] Nguyên liệu không tồn tại hoặc đã ngừng hoạt động.', 1;
        END

        BEGIN TRANSACTION;

        -- 3. Tìm ngày chốt SOH mới nhất trên toàn hệ thống
        DECLARE @LatestSnapshot DATE;
        SELECT @LatestSnapshot = MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH;

        IF @LatestSnapshot IS NULL
        BEGIN
            THROW 50400, N'[50400] Hệ thống chưa có dữ liệu tồn kho (SOH). Không thể thực hiện khóa hàng.', 1;
        END

        -- 4. Xác định StartDate (mặc định là ngày chốt mới nhất nếu không truyền)
        DECLARE @StartDateParsed DATE;
        IF @StartDate IS NULL OR LEN(LTRIM(RTRIM(@StartDate))) = 0
            SET @StartDateParsed = @LatestSnapshot;
        ELSE
            SET @StartDateParsed = TRY_CONVERT(DATE, @StartDate);

        IF @StartDateParsed IS NULL
        BEGIN
            THROW 50400, N'[50400] Ngày bắt đầu khóa không đúng định dạng YYYY-MM-DD.', 1;
        END

        -- 5. Đọc SOH tại ngày chốt mới nhất với khóa dòng bi quan WITH (UPDLOCK, HOLDLOCK)
        DECLARE @CurrentSoh DECIMAL(18,0);
        SELECT @CurrentSoh = SohQtyKg
        FROM dbo.fact_Inventory_SOH WITH (UPDLOCK, HOLDLOCK)
        WHERE FactoryID = @FactoryID
          AND MaterialID = @MaterialID
          AND SnapshotDate = @LatestSnapshot;

        IF @CurrentSoh IS NULL OR @CurrentSoh <= 0
        BEGIN
            THROW 50400, N'[50400] Tồn kho thực tế (SOH) của nguyên liệu tại nhà máy này đang bằng 0 kg. Không thể thực hiện khóa hàng.', 1;
        END

        -- 6. Tính tổng lượng hàng đang bị khóa của cặp này với khóa bi quan WITH (UPDLOCK, HOLDLOCK)
        DECLARE @CurrentlyBlocked DECIMAL(18,0);
        SELECT @CurrentlyBlocked = ISNULL(SUM(BlockedKg), 0)
        FROM dbo.fact_Inventory_Block WITH (UPDLOCK, HOLDLOCK)
        WHERE FactoryID = @FactoryID
          AND MaterialID = @MaterialID
          AND (EndDate IS NULL OR EndDate > @LatestSnapshot);

        -- 7. Kiểm tra điều kiện hạn mức không vượt SOH (BR-28a)
        DECLARE @AvailableToBlock DECIMAL(18,0) = CASE
            WHEN @CurrentSoh > @CurrentlyBlocked THEN @CurrentSoh - @CurrentlyBlocked
            ELSE 0
        END;

        IF @BlockedKg > @AvailableToBlock
        BEGIN
            DECLARE @ErrMsg NVARCHAR(500) = FORMATMESSAGE(
                N'[50400] Số lượng khóa vượt quá tồn kho khả dụng. Khối lượng tối đa có thể khóa thêm là: %s kg (SOH: %s kg, Đang khóa: %s kg).',
                FORMAT(@AvailableToBlock, '#,0'),
                FORMAT(@CurrentSoh, '#,0'),
                FORMAT(@CurrentlyBlocked, '#,0')
            );
            THROW 50400, @ErrMsg, 1;
        END

        -- 8. Thêm lệnh khóa mới
        INSERT INTO dbo.fact_Inventory_Block (
            FactoryID, MaterialID, BlockedKg, StartDate, EndDate, Reason, CreatedAt, CreatedBy
        )
        VALUES (
            @FactoryID, @MaterialID, @BlockedKg, @StartDateParsed, NULL, LTRIM(RTRIM(@Reason)), SYSUTCDATETIME(), @Username
        );

        DECLARE @NewBlockID INT = SCOPE_IDENTITY();

        -- 9. Ghi nhận Audit Log (INVENTORY_BLOCK_CREATE)
        DECLARE @NewValuesJson NVARCHAR(MAX) = (
            SELECT
                @NewBlockID AS blockId,
                @FactoryID AS factoryId,
                @MaterialID AS materialId,
                @BlockedKg AS blockedKg,
                CONVERT(VARCHAR(10), @StartDateParsed, 23) AS startDate,
                LTRIM(RTRIM(@Reason)) AS reason,
                @CurrentSoh AS sohAtCreationKg,
                @CurrentlyBlocked AS previouslyBlockedKg
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @UserID, @Username, 'INVENTORY_BLOCK_CREATE', 'fact_Inventory_Block',
            CAST(@NewBlockID AS NVARCHAR(100)), @IPAddress, NULL, @NewValuesJson, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        -- 10. Trả về chi tiết lệnh khóa vừa tạo
        SELECT
            b.BlockID,
            b.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            b.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            b.BlockedKg,
            @CurrentSoh AS CurrentSohKg,
            (@CurrentlyBlocked + b.BlockedKg) AS TotalBlockedKgAfter,
            (@CurrentSoh - (@CurrentlyBlocked + b.BlockedKg)) AS RemainingAvailableKg,
            CONVERT(VARCHAR(10), b.StartDate, 23) AS StartDate,
            CONVERT(VARCHAR(10), b.EndDate, 23) AS EndDate,
            'ACTIVE' AS BlockStatus,
            b.Reason,
            b.CreatedAt,
            b.CreatedBy,
            b.ReleasedAt,
            b.ReleasedBy
        FROM dbo.fact_Inventory_Block b
        INNER JOIN dbo.dim_Factory f ON b.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON b.MaterialID = m.MaterialID
        WHERE b.BlockID = @NewBlockID;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- =====================================================================================
-- 3. dbo.usp_Block_Release
-- Giải phóng (mở khóa) một lệnh khóa đang có hiệu lực bằng cách cập nhật EndDate,
-- kiểm tra ràng buộc EndDate >= StartDate và ghi nhận Audit Log.
-- =====================================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Block_Release
    @UserID INT,
    @Username NVARCHAR(50),
    @BlockID INT,
    @EndDate VARCHAR(20) = NULL,
    @IPAddress VARCHAR(45) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @FactoryID INT,
                @MaterialID INT,
                @BlockedKg DECIMAL(18,0),
                @StartDate DATE,
                @CurrentEndDate DATE,
                @Reason NVARCHAR(250);

        SELECT
            @FactoryID = FactoryID,
            @MaterialID = MaterialID,
            @BlockedKg = BlockedKg,
            @StartDate = StartDate,
            @CurrentEndDate = EndDate,
            @Reason = Reason
        FROM dbo.fact_Inventory_Block WITH (UPDLOCK, HOLDLOCK)
        WHERE BlockID = @BlockID;

        IF @StartDate IS NULL
        BEGIN
            THROW 50404, N'[50404] Lệnh khóa hàng không tồn tại.', 1;
        END

        -- Kiểm tra quyền phạm vi nhà máy (FactoryScope)
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
                THROW 50403, N'[50403] Bạn không có quyền mở khóa tồn kho tại nhà máy ngoài phạm vi phân công.', 1;
            END
        END

        IF @CurrentEndDate IS NOT NULL
        BEGIN
            THROW 50400, N'[50400] Lệnh khóa hàng này đã được mở khóa trước đó.', 1;
        END

        -- Xác định EndDate (mặc định là ngày chốt mới nhất hoặc StartDate nếu không truyền)
        DECLARE @LatestSnapshot DATE;
        SELECT @LatestSnapshot = MAX(SnapshotDate) FROM dbo.fact_Inventory_SOH;

        DECLARE @EndDateParsed DATE;
        IF @EndDate IS NULL OR LEN(LTRIM(RTRIM(@EndDate))) = 0
        BEGIN
            SET @EndDateParsed = CASE
                WHEN @LatestSnapshot IS NOT NULL AND @LatestSnapshot >= @StartDate THEN @LatestSnapshot
                ELSE CAST(SYSDATETIME() AS DATE)
            END;
        END
        ELSE
        BEGIN
            SET @EndDateParsed = TRY_CONVERT(DATE, @EndDate);
        END

        IF @EndDateParsed IS NULL
        BEGIN
            THROW 50400, N'[50400] Ngày kết thúc mở khóa không đúng định dạng YYYY-MM-DD.', 1;
        END

        IF @EndDateParsed < @StartDate
        BEGIN
            THROW 50400, N'[50400] Ngày kết thúc mở khóa không được sớm hơn ngày bắt đầu khóa.', 1;
        END

        -- Cập nhật mở khóa
        UPDATE dbo.fact_Inventory_Block
        SET EndDate = @EndDateParsed,
            ReleasedAt = SYSUTCDATETIME(),
            ReleasedBy = @Username
        WHERE BlockID = @BlockID;

        -- Ghi nhận Audit Log (INVENTORY_BLOCK_RELEASE)
        DECLARE @OldValuesJson NVARCHAR(MAX) = (
            SELECT
                @BlockID AS blockId,
                @FactoryID AS factoryId,
                @MaterialID AS materialId,
                @BlockedKg AS blockedKg,
                CONVERT(VARCHAR(10), @StartDate, 23) AS startDate,
                NULL AS endDate,
                'ACTIVE' AS blockStatus
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        DECLARE @NewValuesJson NVARCHAR(MAX) = (
            SELECT
                @BlockID AS blockId,
                @FactoryID AS factoryId,
                @MaterialID AS materialId,
                @BlockedKg AS blockedKg,
                CONVERT(VARCHAR(10), @StartDate, 23) AS startDate,
                CONVERT(VARCHAR(10), @EndDateParsed, 23) AS endDate,
                'RELEASED' AS blockStatus,
                @Username AS releasedBy
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        );

        INSERT INTO dbo.sys_Audit_Log (
            Timestamp, UserID, Username, ActionCode, TargetEntity, TargetID, IPAddress, OldValues, NewValues, Status
        )
        VALUES (
            SYSUTCDATETIME(), @UserID, @Username, 'INVENTORY_BLOCK_RELEASE', 'fact_Inventory_Block',
            CAST(@BlockID AS NVARCHAR(100)), @IPAddress, @OldValuesJson, @NewValuesJson, 'SUCCESS'
        );

        COMMIT TRANSACTION;

        -- Trả về chi tiết lệnh vừa mở khóa
        SELECT
            b.BlockID,
            b.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            b.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            b.BlockedKg,
            CONVERT(VARCHAR(10), b.StartDate, 23) AS StartDate,
            CONVERT(VARCHAR(10), b.EndDate, 23) AS EndDate,
            'RELEASED' AS BlockStatus,
            b.Reason,
            b.CreatedAt,
            b.CreatedBy,
            b.ReleasedAt,
            b.ReleasedBy
        FROM dbo.fact_Inventory_Block b
        INNER JOIN dbo.dim_Factory f ON b.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON b.MaterialID = m.MaterialID
        WHERE b.BlockID = @BlockID;

    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO
