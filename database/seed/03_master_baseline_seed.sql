USE PremixTrack_DB;
GO

SET NOCOUNT ON;
GO

-- 1. SEED NGUYÊN LIỆU MẪU (dim_Material)
SET IDENTITY_INSERT dbo.dim_Material ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = 1)
    INSERT INTO dbo.dim_Material (MaterialID, MaterialCode, MaterialName, Category, ItemGroup, PackingSpec, BagKg, UOM, ItemType, PIC, DisplayDecimals, IsActive, CreatedAt, UpdatedAt)
    VALUES (1, 'PREMIX_01', N'Premix Heo Con 4% CP', N'PREMIX', N'PREMIX', N'Bao 25kg', 25.0, N'KG', N'RAW', N'Nguyễn Văn A', 0, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = 2)
    INSERT INTO dbo.dim_Material (MaterialID, MaterialCode, MaterialName, Category, ItemGroup, PackingSpec, BagKg, UOM, ItemType, PIC, DisplayDecimals, IsActive, CreatedAt, UpdatedAt)
    VALUES (2, 'PREMIX_02', N'Premix Gà Thịt Broiler', N'PREMIX', N'PREMIX', N'Bao 25kg', 25.0, N'KG', N'RAW', N'Trần Thị B', 0, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = 3)
    INSERT INTO dbo.dim_Material (MaterialID, MaterialCode, MaterialName, Category, ItemGroup, PackingSpec, BagKg, UOM, ItemType, PIC, DisplayDecimals, IsActive, CreatedAt, UpdatedAt)
    VALUES (3, 'VIT_A', N'Vitamin A 1000', N'VITAMIN', N'NGOAI_PREMIX', N'Thùng 20kg', 20.0, N'KG', N'RAW', N'Lê Văn C', 2, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Material WHERE MaterialID = 4)
    INSERT INTO dbo.dim_Material (MaterialID, MaterialCode, MaterialName, Category, ItemGroup, PackingSpec, BagKg, UOM, ItemType, PIC, DisplayDecimals, IsActive, CreatedAt, UpdatedAt)
    VALUES (4, 'MINERAL_ZN', N'Kẽm Oxit Zinc Oxide 72%', N'TRACE_MINERAL', N'NGOAI_PREMIX', N'Bao 25kg', 25.0, N'KG', N'RAW', N'Phạm Văn D', 1, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

GO
SET IDENTITY_INSERT dbo.dim_Material OFF;
GO

-- 2. SEED NHÀ CUNG CẤP MẪU (dim_Supplier)
SET IDENTITY_INSERT dbo.dim_Supplier ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Supplier WHERE SupplierID = 1)
    INSERT INTO dbo.dim_Supplier (SupplierID, SupplierCode, SupplierName, VendorGroup, Country, LeadTimeDays, IsActive, CreatedAt, UpdatedAt)
    VALUES (1, 'SUP_001', N'Công ty TNHH Hóa Chất CJ', 'LOC_SUPPLIER', N'Việt Nam', 7, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Supplier WHERE SupplierID = 2)
    INSERT INTO dbo.dim_Supplier (SupplierID, SupplierCode, SupplierName, VendorGroup, Country, LeadTimeDays, IsActive, CreatedAt, UpdatedAt)
    VALUES (2, 'SUP_002', N'DSM Nutritional Products Ltd', 'FOR_SUPPLIER', N'Thụy Sĩ', 45, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Supplier WHERE SupplierID = 3)
    INSERT INTO dbo.dim_Supplier (SupplierID, SupplierCode, SupplierName, VendorGroup, Country, LeadTimeDays, IsActive, CreatedAt, UpdatedAt)
    VALUES (3, 'SUP_003', N'Adisseo France SAS', 'FOR_SUPPLIER', N'Pháp', 60, 1, SYSUTCDATETIME(), SYSUTCDATETIME());

GO
SET IDENTITY_INSERT dbo.dim_Supplier OFF;
GO

-- 3. SEED CẶP THEO DÕI NHÀ MÁY - NGUYÊN LIỆU (dim_Factory_Material)
-- Gán 4 nguyên liệu cho 2 nhà máy DN (ID=1) và BD (ID=2)
INSERT INTO dbo.dim_Factory_Material (FactoryID, MaterialID, IsTracked, IsActive, CreatedAt, UpdatedAt)
SELECT f.FactoryID, m.MaterialID, 1, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
FROM dbo.dim_Factory f
CROSS JOIN dbo.dim_Material m
WHERE f.FactoryID IN (1, 2)
  AND NOT EXISTS (
    SELECT 1 FROM dbo.dim_Factory_Material fm
    WHERE fm.FactoryID = f.FactoryID AND fm.MaterialID = m.MaterialID
  );

PRINT N'Seeded baseline Master Data successfully';
GO
