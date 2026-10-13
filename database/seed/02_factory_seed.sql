USE PremixTrack_DB;
GO

SET IDENTITY_INSERT dbo.dim_Factory ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = 1)
    INSERT INTO dbo.dim_Factory (FactoryID, FactoryCode, WarehouseCode, FactoryName, Region, PlantType, IsActive, CreatedAt, UpdatedAt)
    VALUES (1, 'DN', N'WH_DN_RAW', N'Nhà máy Đồng Nai', 'SOUTH', 'FEED', 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = 2)
    INSERT INTO dbo.dim_Factory (FactoryID, FactoryCode, WarehouseCode, FactoryName, Region, PlantType, IsActive, CreatedAt, UpdatedAt)
    VALUES (2, 'BD', N'WH_BD_RAW', N'Nhà máy Bình Dương', 'SOUTH', 'FEED', 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = 3)
    INSERT INTO dbo.dim_Factory (FactoryID, FactoryCode, WarehouseCode, FactoryName, Region, PlantType, IsActive, CreatedAt, UpdatedAt)
    VALUES (3, 'VL2', N'WH_VL2_RAW', N'Nhà máy Vĩnh Long 2', 'MEKONG', 'FEED', 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = 4)
    INSERT INTO dbo.dim_Factory (FactoryID, FactoryCode, WarehouseCode, FactoryName, Region, PlantType, IsActive, CreatedAt, UpdatedAt)
    VALUES (4, 'HG', N'WH_HG_RAW', N'Nhà máy Hậu Giang', 'MEKONG', 'FEED', 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = 5)
    INSERT INTO dbo.dim_Factory (FactoryID, FactoryCode, WarehouseCode, FactoryName, Region, PlantType, IsActive, CreatedAt, UpdatedAt)
    VALUES (5, 'BD1', N'WH_BD1_RAW', N'Nhà máy Bình Định 1', 'CENTRAL', 'FEED', 1, SYSUTCDATETIME(), SYSUTCDATETIME());

IF NOT EXISTS (SELECT 1 FROM dbo.dim_Factory WHERE FactoryID = 6)
    INSERT INTO dbo.dim_Factory (FactoryID, FactoryCode, WarehouseCode, FactoryName, Region, PlantType, IsActive, CreatedAt, UpdatedAt)
    VALUES (6, 'BD2', N'WH_BD2_RAW', N'Nhà máy Bình Định 2', 'CENTRAL', 'FEED', 1, SYSUTCDATETIME(), SYSUTCDATETIME());

GO
SET IDENTITY_INSERT dbo.dim_Factory OFF;
GO

PRINT N'Seeded 6 standard factories successfully';
GO
