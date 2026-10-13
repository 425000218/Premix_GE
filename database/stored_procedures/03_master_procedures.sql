USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- ============================================================================
-- 1. dbo.usp_Master_FactoryList: Danh sách Nhà máy
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Master_FactoryList
    @Search NVARCHAR(100) = NULL,
    @Region VARCHAR(20) = NULL,
    @IsActive BIT = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'FactoryCode',
    @SortOrder NVARCHAR(4) = 'ASC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    WITH FilteredFactories AS (
        SELECT 
            FactoryID,
            FactoryCode,
            WarehouseCode,
            FactoryName,
            Region,
            PlantType,
            IsActive,
            CreatedAt,
            UpdatedAt,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.dim_Factory
        WHERE (@Search IS NULL OR FactoryCode LIKE '%' + @Search + '%' OR FactoryName LIKE '%' + @Search + '%' OR WarehouseCode LIKE '%' + @Search + '%')
          AND (@Region IS NULL OR Region = @Region)
          AND (@IsActive IS NULL OR IsActive = @IsActive)
    )
    SELECT *
    FROM FilteredFactories
    ORDER BY 
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'FactoryCode' THEN FactoryCode END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'FactoryCode' THEN FactoryCode END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'FactoryName' THEN FactoryName END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'FactoryName' THEN FactoryName END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'FactoryID' THEN FactoryID END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'FactoryID' THEN FactoryID END DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
GO

-- ============================================================================
-- 2. dbo.usp_Master_MaterialList: Danh sách Nguyên liệu
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Master_MaterialList
    @Search NVARCHAR(100) = NULL,
    @Category NVARCHAR(50) = NULL,
    @ItemGroup NVARCHAR(50) = NULL,
    @IsActive BIT = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'MaterialCode',
    @SortOrder NVARCHAR(4) = 'ASC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    WITH FilteredMaterials AS (
        SELECT 
            MaterialID,
            MaterialCode,
            MaterialName,
            Category,
            ItemGroup,
            PackingSpec,
            BagKg,
            UOM,
            ItemType,
            PIC,
            DisplayDecimals,
            IsActive,
            CreatedAt,
            UpdatedAt,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.dim_Material
        WHERE (@Search IS NULL OR MaterialCode LIKE '%' + @Search + '%' OR MaterialName LIKE '%' + @Search + '%' OR PIC LIKE '%' + @Search + '%')
          AND (@Category IS NULL OR Category = @Category)
          AND (@ItemGroup IS NULL OR ItemGroup = @ItemGroup)
          AND (@IsActive IS NULL OR IsActive = @IsActive)
    )
    SELECT *
    FROM FilteredMaterials
    ORDER BY 
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'MaterialCode' THEN MaterialCode END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'MaterialCode' THEN MaterialCode END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'MaterialName' THEN MaterialName END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'MaterialName' THEN MaterialName END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'Category' THEN Category END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'Category' THEN Category END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'MaterialID' THEN MaterialID END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'MaterialID' THEN MaterialID END DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
GO

-- ============================================================================
-- 3. dbo.usp_Master_SupplierList: Danh sách Nhà cung cấp
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Master_SupplierList
    @Search NVARCHAR(100) = NULL,
    @VendorGroup VARCHAR(20) = NULL,
    @IsActive BIT = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'SupplierCode',
    @SortOrder NVARCHAR(4) = 'ASC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    WITH FilteredSuppliers AS (
        SELECT 
            SupplierID,
            SupplierCode,
            SupplierName,
            VendorGroup,
            Country,
            LeadTimeDays,
            IsActive,
            CreatedAt,
            UpdatedAt,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.dim_Supplier
        WHERE (@Search IS NULL OR SupplierCode LIKE '%' + @Search + '%' OR SupplierName LIKE '%' + @Search + '%' OR Country LIKE '%' + @Search + '%')
          AND (@VendorGroup IS NULL OR VendorGroup = @VendorGroup)
          AND (@IsActive IS NULL OR IsActive = @IsActive)
    )
    SELECT *
    FROM FilteredSuppliers
    ORDER BY 
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'SupplierCode' THEN SupplierCode END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'SupplierCode' THEN SupplierCode END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'SupplierName' THEN SupplierName END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'SupplierName' THEN SupplierName END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'SupplierID' THEN SupplierID END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'SupplierID' THEN SupplierID END DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
GO

-- ============================================================================
-- 4. dbo.usp_Master_PlantItemList: Danh sách Cặp theo dõi Nhà máy - Nguyên liệu
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Master_PlantItemList
    @Search NVARCHAR(100) = NULL,
    @FactoryID INT = NULL,
    @Category NVARCHAR(50) = NULL,
    @IsTracked BIT = NULL,
    @IsActive BIT = NULL,
    @Page INT = 1,
    @PageSize INT = 20,
    @SortBy NVARCHAR(50) = 'PairID',
    @SortOrder NVARCHAR(4) = 'ASC'
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Offset INT = CASE WHEN @PageSize > 0 THEN (@Page - 1) * @PageSize ELSE 0 END;
    DECLARE @FetchRows INT = CASE WHEN @PageSize > 0 THEN @PageSize ELSE 2147483647 END;

    WITH FilteredPairs AS (
        SELECT 
            fm.PairID,
            fm.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            fm.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            m.Category,
            m.ItemGroup,
            m.UOM,
            m.DisplayDecimals,
            fm.IsTracked,
            fm.IsActive,
            fm.CreatedAt,
            fm.UpdatedAt,
            COUNT(*) OVER() AS TotalCount
        FROM dbo.dim_Factory_Material fm
        INNER JOIN dbo.dim_Factory f ON fm.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON fm.MaterialID = m.MaterialID
        WHERE (@Search IS NULL OR m.MaterialCode LIKE '%' + @Search + '%' OR m.MaterialName LIKE '%' + @Search + '%' OR f.FactoryCode LIKE '%' + @Search + '%')
          AND (@FactoryID IS NULL OR fm.FactoryID = @FactoryID)
          AND (@Category IS NULL OR m.Category = @Category)
          AND (@IsTracked IS NULL OR fm.IsTracked = @IsTracked)
          AND (@IsActive IS NULL OR fm.IsActive = @IsActive)
    )
    SELECT *
    FROM FilteredPairs
    ORDER BY 
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'PairID' THEN PairID END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'PairID' THEN PairID END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'FactoryCode' THEN FactoryCode END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'FactoryCode' THEN FactoryCode END DESC,
        CASE WHEN @SortOrder = 'ASC' AND @SortBy = 'MaterialCode' THEN MaterialCode END ASC,
        CASE WHEN @SortOrder = 'DESC' AND @SortBy = 'MaterialCode' THEN MaterialCode END DESC
    OFFSET @Offset ROWS FETCH NEXT @FetchRows ROWS ONLY;
END;
GO

-- ============================================================================
-- 5. dbo.usp_Master_UpdateMaterial: Sửa PIC và DisplayDecimals
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Master_UpdateMaterial
    @MaterialID INT,
    @PIC NVARCHAR(50) = NULL,
    @DisplayDecimals TINYINT,
    @UpdatedBy NVARCHAR(50) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = @MaterialID)
        BEGIN
            RAISERROR(N'Nguyên liệu không tồn tại', 16, 1);
            RETURN;
        END

        IF @DisplayDecimals < 0 OR @DisplayDecimals > 4
        BEGIN
            RAISERROR(N'Số lẻ hiển thị phải nằm trong khoảng từ 0 đến 4', 16, 1);
            RETURN;
        END

        UPDATE dbo.dim_Material
        SET PIC = NULLIF(LTRIM(RTRIM(@PIC)), ''),
            DisplayDecimals = @DisplayDecimals,
            UpdatedAt = SYSUTCDATETIME()
        WHERE MaterialID = @MaterialID;

        COMMIT TRANSACTION;

        SELECT * FROM dbo.dim_Material WHERE MaterialID = @MaterialID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 6. dbo.usp_Master_UpdateSupplier: Sửa LeadTimeDays
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Master_UpdateSupplier
    @SupplierID INT,
    @LeadTimeDays INT,
    @UpdatedBy NVARCHAR(50) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Supplier WHERE SupplierID = @SupplierID)
        BEGIN
            RAISERROR(N'Nhà cung cấp không tồn tại', 16, 1);
            RETURN;
        END

        IF @LeadTimeDays < 0 OR @LeadTimeDays > 365
        BEGIN
            RAISERROR(N'Thời gian giao hàng (LeadTimeDays) phải nằm trong khoảng 0 đến 365 ngày', 16, 1);
            RETURN;
        END

        UPDATE dbo.dim_Supplier
        SET LeadTimeDays = @LeadTimeDays,
            UpdatedAt = SYSUTCDATETIME()
        WHERE SupplierID = @SupplierID;

        COMMIT TRANSACTION;

        SELECT * FROM dbo.dim_Supplier WHERE SupplierID = @SupplierID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 7. dbo.usp_Master_UpdatePlantItem: Bật/Tắt cờ IsTracked
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Master_UpdatePlantItem
    @PairID INT,
    @IsTracked BIT,
    @UpdatedBy NVARCHAR(50) = 'admin'
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory_Material WHERE PairID = @PairID)
        BEGIN
            RAISERROR(N'Cặp nhà máy - nguyên liệu không tồn tại', 16, 1);
            RETURN;
        END

        UPDATE dbo.dim_Factory_Material
        SET IsTracked = @IsTracked,
            UpdatedAt = SYSUTCDATETIME()
        WHERE PairID = @PairID;

        COMMIT TRANSACTION;

        SELECT 
            fm.PairID,
            fm.FactoryID,
            f.FactoryCode,
            f.FactoryName,
            fm.MaterialID,
            m.MaterialCode,
            m.MaterialName,
            fm.IsTracked,
            fm.IsActive,
            fm.UpdatedAt
        FROM dbo.dim_Factory_Material fm
        INNER JOIN dbo.dim_Factory f ON fm.FactoryID = f.FactoryID
        INNER JOIN dbo.dim_Material m ON fm.MaterialID = m.MaterialID
        WHERE fm.PairID = @PairID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

-- ============================================================================
-- 8. dbo.usp_Master_Dropdowns: Nạp dữ liệu dropdowns dùng chung toàn ứng dụng
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.usp_Master_Dropdowns
AS
BEGIN
    SET NOCOUNT ON;

    -- Tập 1: Nhà máy
    SELECT FactoryID, FactoryCode, FactoryName, WarehouseCode, Region
    FROM dbo.dim_Factory
    WHERE IsActive = 1
    ORDER BY FactoryCode;

    -- Tập 2: Nguyên liệu
    SELECT MaterialID, MaterialCode, MaterialName, Category, ItemGroup, UOM, DisplayDecimals
    FROM dbo.dim_Material
    WHERE IsActive = 1
    ORDER BY MaterialCode;

    -- Tập 3: Nhà cung cấp
    SELECT SupplierID, SupplierCode, SupplierName, VendorGroup, LeadTimeDays
    FROM dbo.dim_Supplier
    WHERE IsActive = 1
    ORDER BY SupplierCode;

    -- Tập 4: Danh mục Category
    SELECT DISTINCT Category
    FROM dbo.dim_Material
    WHERE IsActive = 1
    ORDER BY Category;
END;
GO
