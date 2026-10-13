-- =====================================================================================
-- STORED PROCEDURES: PHÂN HỆ NẠP DỮ LIỆU & KIỂM SOÁT CHẤT LƯỢNG (F03)
-- Phân hệ: F03a - Nạp File Master Data (5 sheets)
-- Giao dịch nguyên tử: Single Atomic Transaction (BEGIN TRANSACTION / COMMIT)
-- Quy tắc nghiệp vụ: BR-31a (Ngừng dùng mã vắng mặt), BR-22 (Kiểm tra cột)
-- Phiên bản: 1.0 (SQL Server 2019+ / Compatibility 150)
-- =====================================================================================

USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- 1. dbo.usp_Import_MasterData
-- Nạp file Master Data (5 sheets) nguyên tử với OPENJSON, Upsert và quy tắc BR-31a
CREATE OR ALTER PROCEDURE dbo.usp_Import_MasterData
    @PlantsJson NVARCHAR(MAX),
    @MaterialsJson NVARCHAR(MAX),
    @SuppliersJson NVARCHAR(MAX),
    @PlantItemsJson NVARCHAR(MAX),
    @SubstitutionsJson NVARCHAR(MAX) = NULL,
    @OriginalFileName NVARCHAR(255),
    @FileHash VARCHAR(64),
    @ImportedBy NVARCHAR(50),
    @DryRun BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Bảng tạm chứa Plants (Sử dụng COLLATE DATABASE_DEFAULT để tương thích collation)
        CREATE TABLE #StagingPlants (
            FactoryCode VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            WarehouseCode NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            FactoryName NVARCHAR(100) COLLATE DATABASE_DEFAULT NOT NULL,
            Region VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            PlantType VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL
        );

        INSERT INTO #StagingPlants (FactoryCode, WarehouseCode, FactoryName, Region, PlantType)
        SELECT 
            LTRIM(RTRIM(FactoryCode)),
            LTRIM(RTRIM(WarehouseCode)),
            LTRIM(RTRIM(FactoryName)),
            UPPER(LTRIM(RTRIM(Region))),
            LTRIM(RTRIM(PlantType))
        FROM OPENJSON(@PlantsJson)
        WITH (
            FactoryCode VARCHAR(20) '$.factoryCode',
            WarehouseCode NVARCHAR(50) '$.warehouseCode',
            FactoryName NVARCHAR(100) '$.factoryName',
            Region VARCHAR(20) '$.region',
            PlantType VARCHAR(20) '$.plantType'
        );

        -- 2. Bảng tạm chứa Materials
        CREATE TABLE #StagingMaterials (
            MaterialCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            MaterialName NVARCHAR(150) COLLATE DATABASE_DEFAULT NOT NULL,
            Category NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            ItemGroup NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            PackingSpec NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL,
            BagKg DECIMAL(18,0) NULL,
            UOM NVARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            ItemType NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL
        );

        INSERT INTO #StagingMaterials (MaterialCode, MaterialName, Category, ItemGroup, PackingSpec, BagKg, UOM, ItemType)
        SELECT 
            LTRIM(RTRIM(MaterialCode)),
            LTRIM(RTRIM(MaterialName)),
            LTRIM(RTRIM(Category)),
            LTRIM(RTRIM(ItemGroup)),
            NULLIF(LTRIM(RTRIM(PackingSpec)), ''),
            TRY_CAST(BagKg AS DECIMAL(18,0)),
            ISNULL(NULLIF(LTRIM(RTRIM(UOM)), ''), 'kg'),
            NULLIF(LTRIM(RTRIM(ItemType)), '')
        FROM OPENJSON(@MaterialsJson)
        WITH (
            MaterialCode VARCHAR(50) '$.materialCode',
            MaterialName NVARCHAR(150) '$.materialName',
            Category NVARCHAR(50) '$.category',
            ItemGroup NVARCHAR(50) '$.itemGroup',
            PackingSpec NVARCHAR(50) '$.packingSpec',
            BagKg NVARCHAR(50) '$.bagKg',
            UOM NVARCHAR(20) '$.uom',
            ItemType NVARCHAR(50) '$.itemType'
        );

        -- 3. Bảng tạm chứa Suppliers
        CREATE TABLE #StagingSuppliers (
            SupplierCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            SupplierName NVARCHAR(150) COLLATE DATABASE_DEFAULT NOT NULL,
            VendorGroup VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL,
            Country NVARCHAR(50) COLLATE DATABASE_DEFAULT NULL
        );

        INSERT INTO #StagingSuppliers (SupplierCode, SupplierName, VendorGroup, Country)
        SELECT 
            LTRIM(RTRIM(SupplierCode)),
            LTRIM(RTRIM(SupplierName)),
            LTRIM(RTRIM(VendorGroup)),
            NULLIF(LTRIM(RTRIM(Country)), '')
        FROM OPENJSON(@SuppliersJson)
        WITH (
            SupplierCode VARCHAR(50) '$.supplierCode',
            SupplierName NVARCHAR(150) '$.supplierName',
            VendorGroup VARCHAR(20) '$.vendorGroup',
            Country NVARCHAR(50) '$.country'
        );

        -- 4. Bảng tạm chứa Plant Items
        CREATE TABLE #StagingPlantItems (
            OrgCode NVARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            ItemCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL
        );

        INSERT INTO #StagingPlantItems (OrgCode, ItemCode)
        SELECT 
            LTRIM(RTRIM(OrgCode)),
            LTRIM(RTRIM(ItemCode))
        FROM OPENJSON(@PlantItemsJson)
        WITH (
            OrgCode NVARCHAR(50) '$.orgCode',
            ItemCode VARCHAR(50) '$.itemCode'
        );

        -- 5. Bảng tạm chứa Substitutions
        CREATE TABLE #StagingSubstitutions (
            MaterialCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            SubMaterialCode VARCHAR(50) COLLATE DATABASE_DEFAULT NOT NULL,
            Ratio DECIMAL(5,2) NULL,
            Note NVARCHAR(250) COLLATE DATABASE_DEFAULT NULL
        );

        IF @SubstitutionsJson IS NOT NULL AND LEN(@SubstitutionsJson) > 2
        BEGIN
            INSERT INTO #StagingSubstitutions (MaterialCode, SubMaterialCode, Ratio, Note)
            SELECT 
                LTRIM(RTRIM(MaterialCode)),
                LTRIM(RTRIM(SubMaterialCode)),
                ISNULL(TRY_CAST(Ratio AS DECIMAL(5,2)), 1.0),
                NULLIF(LTRIM(RTRIM(Note)), '')
            FROM OPENJSON(@SubstitutionsJson)
            WITH (
                MaterialCode VARCHAR(50) '$.materialCode',
                SubMaterialCode VARCHAR(50) '$.subMaterialCode',
                Ratio NVARCHAR(20) '$.ratio',
                Note NVARCHAR(250) '$.note'
            );
        END;

        -- Kiểm tra trùng lặp khóa trong file
        IF EXISTS (SELECT FactoryCode FROM #StagingPlants GROUP BY FactoryCode HAVING COUNT(*) > 1)
        BEGIN
            RAISERROR(N'Dữ liệu Plants bị trùng lặp Mã nhà máy', 16, 1);
            RETURN;
        END;

        IF EXISTS (SELECT MaterialCode FROM #StagingMaterials GROUP BY MaterialCode HAVING COUNT(*) > 1)
        BEGIN
            RAISERROR(N'Dữ liệu Items bị trùng lặp Mã nguyên liệu', 16, 1);
            RETURN;
        END;

        IF EXISTS (SELECT SupplierCode FROM #StagingSuppliers GROUP BY SupplierCode HAVING COUNT(*) > 1)
        BEGIN
            RAISERROR(N'Dữ liệu Vendors bị trùng lặp Mã nhà cung cấp', 16, 1);
            RETURN;
        END;

        IF EXISTS (SELECT OrgCode, ItemCode FROM #StagingPlantItems GROUP BY OrgCode, ItemCode HAVING COUNT(*) > 1)
        BEGIN
            RAISERROR(N'Dữ liệu Plant Items bị trùng lặp cặp (Org code, Item code)', 16, 1);
            RETURN;
        END;

        -- Đếm số dòng của từng sheet
        DECLARE @PlantsCount INT = (SELECT COUNT(*) FROM #StagingPlants);
        DECLARE @MaterialsCount INT = (SELECT COUNT(*) FROM #StagingMaterials);
        DECLARE @SuppliersCount INT = (SELECT COUNT(*) FROM #StagingSuppliers);
        DECLARE @PlantItemsCount INT = (SELECT COUNT(*) FROM #StagingPlantItems);
        DECLARE @SubstitutionsCount INT = (SELECT COUNT(*) FROM #StagingSubstitutions);
        DECLARE @TotalRows INT = @PlantsCount + @MaterialsCount + @SuppliersCount + @PlantItemsCount + @SubstitutionsCount;

        -- Nếu chỉ xem trước (DryRun = 1), rollback và trả kết quả xem trước
        IF @DryRun = 1
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT 
                0 AS BatchID,
                @TotalRows AS TotalRows,
                @PlantsCount AS PlantsCount,
                @MaterialsCount AS MaterialsCount,
                @SuppliersCount AS SuppliersCount,
                @PlantItemsCount AS PlantItemsCount,
                @SubstitutionsCount AS SubstitutionsCount,
                'PREVIEW' AS Status;
            RETURN;
        END;

        -- 6. Ghi CSDL chính thức
        -- 6.1. Upsert dim_Factory
        MERGE dbo.dim_Factory AS target
        USING #StagingPlants AS source
        ON target.FactoryCode = source.FactoryCode
        WHEN MATCHED THEN
            UPDATE SET 
                target.WarehouseCode = source.WarehouseCode,
                target.FactoryName = source.FactoryName,
                target.Region = source.Region,
                target.PlantType = source.PlantType,
                target.IsActive = 1,
                target.UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
            INSERT (FactoryCode, WarehouseCode, FactoryName, Region, PlantType, IsActive, CreatedAt, UpdatedAt)
            VALUES (source.FactoryCode, source.WarehouseCode, source.FactoryName, source.Region, source.PlantType, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

        -- BR-31a cho dim_Factory: Đánh dấu ngừng dùng mã vắng mặt
        UPDATE dbo.dim_Factory
        SET IsActive = 0, UpdatedAt = SYSUTCDATETIME()
        WHERE FactoryCode NOT IN (SELECT FactoryCode FROM #StagingPlants)
          AND IsActive = 1;

        -- 6.2. Upsert dim_Material
        MERGE dbo.dim_Material AS target
        USING #StagingMaterials AS source
        ON target.MaterialCode = source.MaterialCode
        WHEN MATCHED THEN
            UPDATE SET 
                target.MaterialName = source.MaterialName,
                target.Category = source.Category,
                target.ItemGroup = source.ItemGroup,
                target.PackingSpec = source.PackingSpec,
                target.BagKg = source.BagKg,
                target.UOM = source.UOM,
                target.ItemType = source.ItemType,
                target.IsActive = 1,
                target.UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
            INSERT (MaterialCode, MaterialName, Category, ItemGroup, PackingSpec, BagKg, UOM, ItemType, DisplayDecimals, IsActive, CreatedAt, UpdatedAt)
            VALUES (source.MaterialCode, source.MaterialName, source.Category, source.ItemGroup, source.PackingSpec, source.BagKg, source.UOM, source.ItemType, 1, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

        -- BR-31a cho dim_Material: Đánh dấu ngừng dùng mã vắng mặt
        UPDATE dbo.dim_Material
        SET IsActive = 0, UpdatedAt = SYSUTCDATETIME()
        WHERE MaterialCode NOT IN (SELECT MaterialCode FROM #StagingMaterials)
          AND IsActive = 1;

        -- 6.3. Upsert dim_Supplier
        MERGE dbo.dim_Supplier AS target
        USING #StagingSuppliers AS source
        ON target.SupplierCode = source.SupplierCode
        WHEN MATCHED THEN
            UPDATE SET 
                target.SupplierName = source.SupplierName,
                target.VendorGroup = source.VendorGroup,
                target.Country = source.Country,
                target.IsActive = 1,
                target.UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
            INSERT (SupplierCode, SupplierName, VendorGroup, Country, LeadTimeDays, IsActive, CreatedAt, UpdatedAt)
            VALUES (source.SupplierCode, source.SupplierName, source.VendorGroup, source.Country, 7, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

        -- BR-31a cho dim_Supplier: Đánh dấu ngừng dùng mã vắng mặt
        UPDATE dbo.dim_Supplier
        SET IsActive = 0, UpdatedAt = SYSUTCDATETIME()
        WHERE SupplierCode NOT IN (SELECT SupplierCode FROM #StagingSuppliers)
          AND IsActive = 1;

        -- 6.4. Upsert dim_Factory_Material (Plant Items)
        CREATE TABLE #StagingPlantItemsResolved (
            FactoryID INT NOT NULL,
            MaterialID INT NOT NULL
        );

        INSERT INTO #StagingPlantItemsResolved (FactoryID, MaterialID)
        SELECT DISTINCT f.FactoryID, m.MaterialID
        FROM #StagingPlantItems pi
        INNER JOIN dbo.dim_Factory f ON (f.WarehouseCode = pi.OrgCode OR f.FactoryCode = pi.OrgCode)
        INNER JOIN dbo.dim_Material m ON m.MaterialCode = pi.ItemCode;

        MERGE dbo.dim_Factory_Material AS target
        USING #StagingPlantItemsResolved AS source
        ON target.FactoryID = source.FactoryID AND target.MaterialID = source.MaterialID
        WHEN MATCHED THEN
            UPDATE SET 
                target.IsActive = 1,
                target.UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
            INSERT (FactoryID, MaterialID, IsTracked, IsActive, CreatedAt, UpdatedAt)
            VALUES (source.FactoryID, source.MaterialID, 1, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

        -- BR-31a cho dim_Factory_Material: Đánh dấu ngừng dùng cặp vắng mặt
        UPDATE fm
        SET fm.IsActive = 0, fm.UpdatedAt = SYSUTCDATETIME()
        FROM dbo.dim_Factory_Material fm
        WHERE NOT EXISTS (
            SELECT 1 FROM #StagingPlantItemsResolved r
            WHERE r.FactoryID = fm.FactoryID AND r.MaterialID = fm.MaterialID
        ) AND fm.IsActive = 1;

        -- 6.5. Substitutions (nếu có)
        IF @SubstitutionsCount > 0
        BEGIN
            CREATE TABLE #StagingSubsResolved (
                MaterialID INT NOT NULL,
                SubMaterialID INT NOT NULL,
                Ratio DECIMAL(5,2) NOT NULL,
                Note NVARCHAR(250) COLLATE DATABASE_DEFAULT NULL
            );

            INSERT INTO #StagingSubsResolved (MaterialID, SubMaterialID, Ratio, Note)
            SELECT m1.MaterialID, m2.MaterialID, s.Ratio, s.Note
            FROM #StagingSubstitutions s
            INNER JOIN dbo.dim_Material m1 ON m1.MaterialCode = s.MaterialCode
            INNER JOIN dbo.dim_Material m2 ON m2.MaterialCode = s.SubMaterialCode;

            MERGE dbo.dim_Material_Substitution AS target
            USING #StagingSubsResolved AS source
            ON target.MaterialID = source.MaterialID AND target.SubMaterialID = source.SubMaterialID
            WHEN MATCHED THEN
                UPDATE SET target.Ratio = source.Ratio, target.Note = source.Note, target.IsActive = 1
            WHEN NOT MATCHED THEN
                INSERT (MaterialID, SubMaterialID, Ratio, Note, IsActive, CreatedAt)
                VALUES (source.MaterialID, source.SubMaterialID, source.Ratio, source.Note, 1, SYSUTCDATETIME());
        END;

        -- 6.6. Ghi log batch vào sys_Import_Batch
        DECLARE @BatchID INT;
        INSERT INTO dbo.sys_Import_Batch (
            BatchType, OriginalFileName, FileHash,
            TotalRows, ValidRows, ErrorRows, Status,
            ImportedAt, ImportedBy
        ) VALUES (
            'MASTER', @OriginalFileName, @FileHash,
            @TotalRows, @TotalRows, 0, 'COMPLETED',
            SYSUTCDATETIME(), @ImportedBy
        );
        SET @BatchID = SCOPE_IDENTITY();

        -- Ghi Audit Log
        DECLARE @AuditDesc NVARCHAR(500) = FORMATMESSAGE(
            N'Nạp Master Data thành công batch #%d: %d dòng (%d Nhà máy, %d Nguyên liệu, %d NCC, %d Cặp theo dõi)',
            @BatchID, @TotalRows, @PlantsCount, @MaterialsCount, @SuppliersCount, @PlantItemsCount
        );
        DECLARE @BatchIdStr NVARCHAR(100) = CAST(@BatchID AS NVARCHAR(100));
        EXEC dbo.usp_Audit_Write
            @UserID = NULL,
            @Username = @ImportedBy,
            @ActionCode = 'IMPORT_MASTER_DATA',
            @TargetEntity = 'dim_Material',
            @TargetID = @BatchIdStr,
            @IPAddress = '127.0.0.1',
            @OldValues = NULL,
            @NewValues = @AuditDesc,
            @Status = 'SUCCESS';

        COMMIT TRANSACTION;

        -- Trả kết quả thành công
        SELECT 
            @BatchID AS BatchID,
            @TotalRows AS TotalRows,
            @PlantsCount AS PlantsCount,
            @MaterialsCount AS MaterialsCount,
            @SuppliersCount AS SuppliersCount,
            @PlantItemsCount AS PlantItemsCount,
            @SubstitutionsCount AS SubstitutionsCount,
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

-- 2. dbo.usp_Import_History
-- Lấy danh sách lịch sử các lần nạp phân trang và lọc theo BatchType / tìm kiếm tên file
CREATE OR ALTER PROCEDURE dbo.usp_Import_History
    @BatchType VARCHAR(20) = NULL,
    @Search NVARCHAR(100) = NULL,
    @PageNumber INT = 1,
    @PageSize INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    IF @PageNumber < 1 SET @PageNumber = 1;
    IF @PageSize < 1 SET @PageSize = 20;
    IF @PageSize > 100 SET @PageSize = 100;

    DECLARE @Offset INT = (@PageNumber - 1) * @PageSize;

    -- Dataset 1: Danh sách batch
    SELECT 
        b.BatchID,
        b.BatchType,
        b.SnapshotDate,
        b.CutoffDate,
        b.PeriodMonth,
        b.VersionDate,
        b.OriginalFileName,
        b.FileHash,
        b.TotalRows,
        b.ValidRows,
        b.ErrorRows,
        b.Status,
        b.ImportedAt,
        b.ImportedBy,
        (SELECT COUNT(*) FROM dbo.sys_Data_Quality_Issue qi WHERE qi.BatchID = b.BatchID) AS IssueCount
    FROM dbo.sys_Import_Batch b
    WHERE (@BatchType IS NULL OR b.BatchType = @BatchType)
      AND (@Search IS NULL OR b.OriginalFileName LIKE '%' + @Search + '%' OR b.ImportedBy LIKE '%' + @Search + '%')
    ORDER BY b.BatchID DESC
    OFFSET @Offset ROWS
    FETCH NEXT @PageSize ROWS ONLY;

    -- Dataset 2: Metadata phân trang
    SELECT 
        COUNT(*) AS TotalRecords,
        CEILING(CAST(COUNT(*) AS FLOAT) / @PageSize) AS TotalPages,
        @PageNumber AS PageNumber,
        @PageSize AS PageSize
    FROM dbo.sys_Import_Batch b
    WHERE (@BatchType IS NULL OR b.BatchType = @BatchType)
      AND (@Search IS NULL OR b.OriginalFileName LIKE '%' + @Search + '%' OR b.ImportedBy LIKE '%' + @Search + '%');
END;
GO

-- 3. dbo.usp_Import_GetBatchById
-- Lấy chi tiết batch và các cảnh báo chất lượng dữ liệu liên quan
CREATE OR ALTER PROCEDURE dbo.usp_Import_GetBatchById
    @BatchID INT
AS
BEGIN
    SET NOCOUNT ON;

    -- Dataset 1: Thông tin batch
    SELECT 
        b.BatchID,
        b.BatchType,
        b.SnapshotDate,
        b.CutoffDate,
        b.PeriodMonth,
        b.VersionDate,
        b.OriginalFileName,
        b.FileHash,
        b.TotalRows,
        b.ValidRows,
        b.ErrorRows,
        b.Status,
        b.ImportedAt,
        b.ImportedBy
    FROM dbo.sys_Import_Batch b
    WHERE b.BatchID = @BatchID;

    -- Dataset 2: Danh sách issues
    SELECT 
        qi.IssueID,
        qi.BatchID,
        qi.SnapshotDate,
        qi.FactoryID,
        qi.MaterialID,
        qi.IssueType,
        qi.Severity,
        qi.Description,
        qi.CreatedAt
    FROM dbo.sys_Data_Quality_Issue qi
    WHERE qi.BatchID = @BatchID
    ORDER BY qi.IssueID ASC;
END;
GO
