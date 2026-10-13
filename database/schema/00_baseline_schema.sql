-- =====================================================================================
-- PREMIXTRACK DATABASE BASELINE SCHEMA
-- Hệ thống: PremixTrack - Theo dõi tồn kho & Đặt hàng nguyên liệu Premix
-- Quản trị CSDL: Microsoft SQL Server 2019 (Compatibility Level 150)
-- Bảng mã: Vietnamese_100_CI_AS_SC_UTF8
-- Chế độ cô lập: READ_COMMITTED_SNAPSHOT ON (RCSI)
-- Phiên bản: Baseline 1.0 (Bao gồm 24 bảng chuẩn theo đặc tả hệ thống)
-- =====================================================================================

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

/*
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'PremixTrack_DB')
BEGIN
    CREATE DATABASE PremixTrack_DB COLLATE Vietnamese_100_CI_AS_SC_UTF8;
END;
GO

USE PremixTrack_DB;
GO

ALTER DATABASE CURRENT SET COMPATIBILITY_LEVEL = 150;
ALTER DATABASE CURRENT SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO
*/

-- =====================================================================================
-- PHẦN I: DANH MỤC MASTER DATA (dim_*)
-- =====================================================================================

-- 1. dim_Factory (Danh mục Nhà máy)
IF OBJECT_ID('dbo.dim_Factory', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dim_Factory (
        FactoryID INT IDENTITY(1,1) NOT NULL,
        FactoryCode VARCHAR(20) NOT NULL,
        WarehouseCode NVARCHAR(50) NOT NULL, -- Mã kho tương ứng trong ERP (Org codes)
        FactoryName NVARCHAR(100) NOT NULL,
        Region VARCHAR(20) NOT NULL,         -- 'SOUTH', 'CENTRAL', 'NORTH'
        PlantType VARCHAR(20) NOT NULL,      -- 'Feed', 'Aqua'
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_dim_Factory PRIMARY KEY CLUSTERED (FactoryID),
        CONSTRAINT UQ_dim_Factory_Code UNIQUE (FactoryCode),
        CONSTRAINT UQ_dim_Factory_Warehouse UNIQUE (WarehouseCode)
    );
END;
GO

-- 2. dim_Material (Danh mục Nguyên liệu)
IF OBJECT_ID('dbo.dim_Material', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dim_Material (
        MaterialID INT IDENTITY(1,1) NOT NULL,
        MaterialCode VARCHAR(50) NOT NULL,   -- Mã NL là chuỗi giữ số 0 đầu
        MaterialName NVARCHAR(150) NOT NULL,
        Category NVARCHAR(50) NOT NULL,      -- Vitamin, Khoáng vi lượng, Enzyme...
        ItemGroup NVARCHAR(50) NOT NULL,     -- 'Premix' hoặc 'Ngoài premix'
        PackingSpec NVARCHAR(50) NULL,       -- Quy cách đóng gói
        BagKg DECIMAL(18,0) NULL,            -- Khối lượng 1 bao (kg), NULL = Hàng xá
        UOM NVARCHAR(20) NOT NULL DEFAULT 'kg',
        ItemType NVARCHAR(50) NULL,
        PIC NVARCHAR(50) NULL,               -- Người phụ trách nguyên liệu
        DisplayDecimals TINYINT NOT NULL DEFAULT 1, -- Số lẻ hiển thị (0-3)
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_dim_Material PRIMARY KEY CLUSTERED (MaterialID),
        CONSTRAINT UQ_dim_Material_Code UNIQUE (MaterialCode),
        CONSTRAINT CK_dim_Material_Decimals CHECK (DisplayDecimals BETWEEN 0 AND 3)
    );
END;
GO

-- 3. dim_Supplier (Danh mục Nhà cung cấp)
IF OBJECT_ID('dbo.dim_Supplier', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dim_Supplier (
        SupplierID INT IDENTITY(1,1) NOT NULL,
        SupplierCode VARCHAR(50) NOT NULL,
        SupplierName NVARCHAR(150) NOT NULL,
        VendorGroup VARCHAR(20) NOT NULL,    -- 'LOC_*' (Trong nước), 'FOR_*' (Nhập khẩu)
        Country NVARCHAR(50) NULL,
        LeadTimeDays INT NOT NULL DEFAULT 7, -- Thời gian giao hàng (ngày)
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_dim_Supplier PRIMARY KEY CLUSTERED (SupplierID),
        CONSTRAINT UQ_dim_Supplier_Code UNIQUE (SupplierCode),
        CONSTRAINT CK_dim_Supplier_LeadTime CHECK (LeadTimeDays BETWEEN 0 AND 365)
    );
END;
GO

-- 4. dim_Factory_Material (Danh sách Cặp theo dõi - Plant Items)
IF OBJECT_ID('dbo.dim_Factory_Material', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dim_Factory_Material (
        PairID INT IDENTITY(1,1) NOT NULL,
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        IsTracked BIT NOT NULL DEFAULT 1,    -- 1: Đang theo dõi trên vị thế; 0: Tạm tắt
        IsActive BIT NOT NULL DEFAULT 1,     -- 0: Vắng mặt trong Master Data mới nhất
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_dim_Factory_Material PRIMARY KEY CLUSTERED (PairID),
        CONSTRAINT UQ_dim_Factory_Material_Pair UNIQUE (FactoryID, MaterialID),
        CONSTRAINT FK_FactoryMaterial_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_FactoryMaterial_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID)
    );
END;
GO

-- 5. dim_Material_Substitution (Nguyên liệu thay thế - Lưu trữ cấu trúc, chưa kích hoạt)
IF OBJECT_ID('dbo.dim_Material_Substitution', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dim_Material_Substitution (
        SubstitutionID INT IDENTITY(1,1) NOT NULL,
        MaterialID INT NOT NULL,
        SubMaterialID INT NOT NULL,
        Ratio DECIMAL(5,2) NOT NULL DEFAULT 1.0, -- Tỷ lệ thay thế
        Note NVARCHAR(250) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_dim_Material_Substitution PRIMARY KEY CLUSTERED (SubstitutionID),
        CONSTRAINT UQ_dim_Material_Substitution UNIQUE (MaterialID, SubMaterialID),
        CONSTRAINT FK_Sub_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_Sub_SubMaterial FOREIGN KEY (SubMaterialID) REFERENCES dbo.dim_Material(MaterialID)
    );
END;
GO

-- =====================================================================================
-- PHẦN II: THIẾT LẬP CẤU HÌNH & NGƯỠNG (cfg_*)
-- =====================================================================================

-- 6. cfg_System (Tham số cấu hình chung - Đúng 1 dòng ConfigID = 1)
IF OBJECT_ID('dbo.cfg_System', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cfg_System (
        ConfigID INT NOT NULL DEFAULT 1,
        StandardMonthDays INT NOT NULL DEFAULT 28,
        CriticalDays INT NOT NULL DEFAULT 7,
        WarningDays INT NOT NULL DEFAULT 15,
        OverstockDays INT NOT NULL DEFAULT 75,
        OverstockDaysLowUsage INT NOT NULL DEFAULT 90,
        LowUsageKgPerMonth DECIMAL(18,0) NOT NULL DEFAULT 1000,
        MinActiveDays INT NOT NULL DEFAULT 3,
        ActualWindowDays INT NOT NULL DEFAULT 14,
        PoLateMonths INT NOT NULL DEFAULT 3,
        PoAgeReference VARCHAR(10) NOT NULL DEFAULT 'SNAPSHOT',
        DeliveryDays INT NOT NULL DEFAULT 7,
        BulkDeliveryKg DECIMAL(18,0) NOT NULL DEFAULT 30000,
        UnusedStockDays INT NOT NULL DEFAULT 60,
        ReorderCoverDays INT NOT NULL DEFAULT 20,
        UsageDeviationPct DECIMAL(5,2) NOT NULL DEFAULT 30.00,
        StaleDataDays INT NOT NULL DEFAULT 2,
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy NVARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        CONSTRAINT PK_cfg_System PRIMARY KEY CLUSTERED (ConfigID),
        CONSTRAINT CK_cfg_System_SingleRow CHECK (ConfigID = 1),
        CONSTRAINT CK_cfg_System_Thresholds CHECK (
            CriticalDays < WarningDays 
            AND WarningDays < OverstockDays 
            AND OverstockDays <= OverstockDaysLowUsage
        ),
        CONSTRAINT CK_cfg_System_PoAgeRef CHECK (PoAgeReference IN ('SNAPSHOT', 'TODAY'))
    );
END;
GO

-- 7. cfg_Stock_Threshold (Ngưỡng tồn kho & Định mức giao ghi đè theo cặp)
IF OBJECT_ID('dbo.cfg_Stock_Threshold', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.cfg_Stock_Threshold (
        ThresholdID INT IDENTITY(1,1) NOT NULL,
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        WarningDays INT NULL,
        OverstockDays INT NULL,
        SafetyDays DECIMAL(4,1) NULL,
        DeliveryDays DECIMAL(4,1) NULL,
        DeliveryQtyKg DECIMAL(18,0) NULL,
        Note NVARCHAR(250) NULL,
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy NVARCHAR(50) NOT NULL,
        CONSTRAINT PK_cfg_Stock_Threshold PRIMARY KEY CLUSTERED (ThresholdID),
        CONSTRAINT UQ_cfg_Stock_Threshold_Pair UNIQUE (FactoryID, MaterialID),
        CONSTRAINT FK_StockThreshold_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_StockThreshold_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT CK_StockThreshold_SafetyDays CHECK (SafetyDays IS NULL OR (SafetyDays >= 0 AND SafetyDays <= 365)),
        CONSTRAINT CK_StockThreshold_DeliveryDays CHECK (DeliveryDays IS NULL OR (DeliveryDays >= 1 AND DeliveryDays <= 365)),
        CONSTRAINT CK_StockThreshold_DeliveryQty CHECK (DeliveryQtyKg IS NULL OR DeliveryQtyKg > 0)
    );
END;
GO

-- =====================================================================================
-- PHẦN III: QUẢN TRỊ NGƯỜI DÙNG & PHÂN QUYỀN ĐỘNG (sys_*)
-- =====================================================================================

-- 8. sys_Role (Danh mục Vai trò)
IF OBJECT_ID('dbo.sys_Role', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sys_Role (
        RoleCode VARCHAR(30) NOT NULL,
        RoleName NVARCHAR(100) NOT NULL,
        Description NVARCHAR(255) NULL,
        FactoryScope VARCHAR(10) NOT NULL DEFAULT 'ALL', -- 'ALL' hoặc 'ASSIGNED'
        IsSystem BIT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_sys_Role PRIMARY KEY CLUSTERED (RoleCode),
        CONSTRAINT CK_sys_Role_Scope CHECK (FactoryScope IN ('ALL', 'ASSIGNED'))
    );
END;
GO

-- 9. sys_Role_Permission (Ma trận quyền theo vai trò)
IF OBJECT_ID('dbo.sys_Role_Permission', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sys_Role_Permission (
        RoleCode VARCHAR(30) NOT NULL,
        PermissionCode VARCHAR(50) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_sys_Role_Permission PRIMARY KEY CLUSTERED (RoleCode, PermissionCode),
        CONSTRAINT FK_RolePermission_Role FOREIGN KEY (RoleCode) REFERENCES dbo.sys_Role(RoleCode) ON DELETE CASCADE
    );
END;
GO

-- 10. sys_User (Tài khoản người dùng)
IF OBJECT_ID('dbo.sys_User', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sys_User (
        UserID INT IDENTITY(1,1) NOT NULL,
        Username NVARCHAR(50) NOT NULL,
        PasswordHash NVARCHAR(255) NOT NULL,
        FullName NVARCHAR(100) NOT NULL,
        Email NVARCHAR(100) NULL,
        RoleCode VARCHAR(30) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_sys_User PRIMARY KEY CLUSTERED (UserID),
        CONSTRAINT UQ_sys_User_Username UNIQUE (Username),
        CONSTRAINT FK_sys_User_Role FOREIGN KEY (RoleCode) REFERENCES dbo.sys_Role(RoleCode)
    );
END;
GO

-- 11. sys_User_Factory (Nhà máy được gán cho người dùng phạm vi ASSIGNED)
IF OBJECT_ID('dbo.sys_User_Factory', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sys_User_Factory (
        UserID INT NOT NULL,
        FactoryID INT NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_sys_User_Factory PRIMARY KEY CLUSTERED (UserID, FactoryID),
        CONSTRAINT FK_UserFactory_User FOREIGN KEY (UserID) REFERENCES dbo.sys_User(UserID) ON DELETE CASCADE,
        CONSTRAINT FK_UserFactory_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID)
    );
END;
GO

-- 12. sys_Import_Batch (Lịch sử các lần nạp file)
IF OBJECT_ID('dbo.sys_Import_Batch', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sys_Import_Batch (
        BatchID INT IDENTITY(1,1) NOT NULL,
        BatchType VARCHAR(20) NOT NULL, -- 'MASTER', 'DAILY_SET', 'FORECAST'
        SnapshotDate DATE NULL,         -- Ngày chốt C = D - 1
        CutoffDate DATE NULL,           -- Ngày D trên tên file
        PeriodMonth DATE NULL,          -- Tháng nhu cầu cho Forecast
        VersionDate DATETIME2(0) NULL,  -- Ngày lập forecast
        OriginalFileName NVARCHAR(255) NOT NULL,
        FileHash VARCHAR(64) NOT NULL,  -- SHA-256
        TotalRows INT NOT NULL DEFAULT 0,
        ValidRows INT NOT NULL DEFAULT 0,
        ErrorRows INT NOT NULL DEFAULT 0,
        Status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
        ImportedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        ImportedBy NVARCHAR(50) NOT NULL,
        CONSTRAINT PK_sys_Import_Batch PRIMARY KEY CLUSTERED (BatchID)
    );
END;
GO

-- 13. sys_Data_Quality_Issue (Cảnh báo kiểm chéo chất lượng dữ liệu)
IF OBJECT_ID('dbo.sys_Data_Quality_Issue', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sys_Data_Quality_Issue (
        IssueID INT IDENTITY(1,1) NOT NULL,
        BatchID INT NOT NULL,
        SnapshotDate DATE NOT NULL,
        FactoryID INT NULL,
        MaterialID INT NULL,
        IssueType VARCHAR(50) NOT NULL,
        Severity VARCHAR(10) NOT NULL DEFAULT 'WARNING',
        Description NVARCHAR(500) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_sys_Data_Quality_Issue PRIMARY KEY CLUSTERED (IssueID),
        CONSTRAINT FK_QualityIssue_Batch FOREIGN KEY (BatchID) REFERENCES dbo.sys_Import_Batch(BatchID)
    );
END;
GO

-- 14. sys_Audit_Log (Nhật ký kiểm toán hệ thống)
IF OBJECT_ID('dbo.sys_Audit_Log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.sys_Audit_Log (
        LogID BIGINT IDENTITY(1,1) NOT NULL,
        Timestamp DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UserID INT NULL,
        Username NVARCHAR(50) NOT NULL,
        ActionCode VARCHAR(50) NOT NULL,
        TargetEntity VARCHAR(50) NOT NULL,
        TargetID NVARCHAR(100) NULL,
        IPAddress VARCHAR(45) NULL,
        OldValues NVARCHAR(MAX) NULL,
        NewValues NVARCHAR(MAX) NULL,
        Status VARCHAR(10) NOT NULL DEFAULT 'SUCCESS',
        ErrorMessage NVARCHAR(500) NULL,
        CONSTRAINT PK_sys_Audit_Log PRIMARY KEY CLUSTERED (LogID)
    );
    CREATE NONCLUSTERED INDEX IX_sys_Audit_Log_Query
    ON dbo.sys_Audit_Log (Timestamp DESC, ActionCode, Username);
END;
GO

-- =====================================================================================
-- PHẦN IV: DỮ LIỆU GIAO DỊCH NẠP TỪ ERP & FORECAST (fact_*)
-- =====================================================================================

-- 15. fact_Inventory_SOH (Tồn kho thực tế SOH RAW theo ngày chốt)
IF OBJECT_ID('dbo.fact_Inventory_SOH', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_Inventory_SOH (
        SohID BIGINT IDENTITY(1,1) NOT NULL,
        SnapshotDate DATE NOT NULL,
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        SohQtyKg DECIMAL(18,0) NOT NULL,
        BatchID INT NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_fact_Inventory_SOH PRIMARY KEY CLUSTERED (SohID),
        CONSTRAINT UQ_fact_Inventory_SOH_Key UNIQUE (SnapshotDate, FactoryID, MaterialID),
        CONSTRAINT FK_InventorySOH_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_InventorySOH_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_InventorySOH_Batch FOREIGN KEY (BatchID) REFERENCES dbo.sys_Import_Batch(BatchID)
    );
    CREATE NONCLUSTERED INDEX IX_fact_Inventory_SOH_Date
    ON dbo.fact_Inventory_SOH (SnapshotDate, FactoryID, MaterialID) INCLUDE (SohQtyKg);
END;
GO

-- 16. fact_Inventory_Movement (Lũy kế nhập xuất MTD từ đầu tháng đến ngày chốt)
IF OBJECT_ID('dbo.fact_Inventory_Movement', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_Inventory_Movement (
        MovementID BIGINT IDENTITY(1,1) NOT NULL,
        SnapshotDate DATE NOT NULL,
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        BeginOnhandKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        QtyReceiveKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        WipIssueKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        TransferInKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        TransferOutKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        AdjustKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        ClosedOnhandKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        BatchID INT NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_fact_Inventory_Movement PRIMARY KEY CLUSTERED (MovementID),
        CONSTRAINT UQ_fact_Inventory_Movement_Key UNIQUE (SnapshotDate, FactoryID, MaterialID),
        CONSTRAINT FK_InventoryMovement_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_InventoryMovement_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_InventoryMovement_Batch FOREIGN KEY (BatchID) REFERENCES dbo.sys_Import_Batch(BatchID)
    );
    CREATE NONCLUSTERED INDEX IX_fact_Inventory_Movement_Date
    ON dbo.fact_Inventory_Movement (SnapshotDate, FactoryID, MaterialID) INCLUDE (WipIssueKg);
END;
GO

-- 17. fact_PO_Pending (Đơn mua hàng còn mở & Hợp đồng khung PAG)
IF OBJECT_ID('dbo.fact_PO_Pending', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_PO_Pending (
        PoPendingID BIGINT IDENTITY(1,1) NOT NULL,
        SnapshotDate DATE NOT NULL,
        PONumber NVARCHAR(50) NOT NULL,
        MaterialID INT NOT NULL,
        DeliveryDate DATE NOT NULL,          -- Ngày tạo PO trong D365
        FactoryID INT NOT NULL,
        VendorAccount VARCHAR(50) NOT NULL,
        Unit NVARCHAR(20) NOT NULL DEFAULT 'kg',
        OrderQtyKg DECIMAL(18,0) NOT NULL,
        ReceivedQtyKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        DeliverRemainderKg DECIMAL(18,0) NOT NULL, -- Lượng còn lại chưa nhận
        DocType VARCHAR(20) NOT NULL DEFAULT 'PO', -- 'PO' hoặc 'PAG'
        LineStatus NVARCHAR(50) NULL,
        BatchID INT NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_fact_PO_Pending PRIMARY KEY CLUSTERED (PoPendingID),
        CONSTRAINT UQ_fact_PO_Pending_Key UNIQUE (SnapshotDate, PONumber, MaterialID, DeliveryDate),
        CONSTRAINT FK_POPending_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_POPending_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_POPending_Batch FOREIGN KEY (BatchID) REFERENCES dbo.sys_Import_Batch(BatchID)
    );
    CREATE NONCLUSTERED INDEX IX_fact_PO_Pending_Snapshot
    ON dbo.fact_PO_Pending (SnapshotDate, FactoryID, MaterialID) INCLUDE (DeliverRemainderKg, DeliveryDate);
END;
GO

-- 18. fact_PO_Receipt (Phiếu nhận hàng thực tế - POR)
IF OBJECT_ID('dbo.fact_PO_Receipt', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_PO_Receipt (
        ReceiptID BIGINT IDENTITY(1,1) NOT NULL,
        ReceiptNumber NVARCHAR(50) NOT NULL, -- Số POR
        MaterialID INT NOT NULL,
        FactoryID INT NOT NULL,
        SupplierID INT NOT NULL,
        PONumber NVARCHAR(50) NULL,
        PAGNumber NVARCHAR(50) NULL,
        DeliveryDate DATE NOT NULL,          -- Ngày nhận hàng thực tế
        ReceivedQtyKg DECIMAL(18,0) NOT NULL,
        Unit NVARCHAR(20) NOT NULL DEFAULT 'kg',
        TruckNumber NVARCHAR(50) NULL,
        BatchID INT NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_fact_PO_Receipt PRIMARY KEY CLUSTERED (ReceiptID),
        CONSTRAINT UQ_fact_PO_Receipt_Key UNIQUE (ReceiptNumber, MaterialID),
        CONSTRAINT FK_POReceipt_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_POReceipt_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_POReceipt_Supplier FOREIGN KEY (SupplierID) REFERENCES dbo.dim_Supplier(SupplierID),
        CONSTRAINT FK_POReceipt_Batch FOREIGN KEY (BatchID) REFERENCES dbo.sys_Import_Batch(BatchID)
    );
    CREATE NONCLUSTERED INDEX IX_fact_PO_Receipt_Date
    ON dbo.fact_PO_Receipt (DeliveryDate, FactoryID, MaterialID) INCLUDE (ReceivedQtyKg, PONumber);
END;
GO

-- 19. fact_Internal_Transfer (Lệnh điều chuyển nội bộ giữa các nhà máy - TO)
IF OBJECT_ID('dbo.fact_Internal_Transfer', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_Internal_Transfer (
        TransferID BIGINT IDENTITY(1,1) NOT NULL,
        TransferNumber NVARCHAR(50) NOT NULL,
        MaterialID INT NOT NULL,
        FromWarehouse NVARCHAR(50) NOT NULL,
        ToWarehouse NVARCHAR(50) NOT NULL,
        FromFactoryID INT NULL,
        ToFactoryID INT NULL,
        TransferStatus VARCHAR(20) NOT NULL, -- 'Created', 'Shipped', 'Received'
        ShippedDate DATE NULL,
        ReceivedDate DATE NULL,
        ShippedQtyKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        PostedQtyKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        BatchID INT NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_fact_Internal_Transfer PRIMARY KEY CLUSTERED (TransferID),
        CONSTRAINT UQ_fact_Internal_Transfer_Key UNIQUE (TransferNumber, MaterialID),
        CONSTRAINT FK_InternalTransfer_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_InternalTransfer_Batch FOREIGN KEY (BatchID) REFERENCES dbo.sys_Import_Batch(BatchID)
    );
    CREATE NONCLUSTERED INDEX IX_fact_Internal_Transfer_Transit
    ON dbo.fact_Internal_Transfer (TransferStatus, ShippedDate, ReceivedDate, ToFactoryID, MaterialID);
END;
GO

-- 20. fact_Demand_Forecast (Dự báo nhu cầu nguyên liệu theo tháng và version)
IF OBJECT_ID('dbo.fact_Demand_Forecast', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_Demand_Forecast (
        ForecastID BIGINT IDENTITY(1,1) NOT NULL,
        PeriodMonth DATE NOT NULL,          -- Ngày đầu tháng (YYYY-MM-01)
        VersionDate DATETIME2(0) NOT NULL,  -- Ngày giờ lập ghi trên file
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        ForecastKg DECIMAL(18,0) NOT NULL DEFAULT 0,
        BatchID INT NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_fact_Demand_Forecast PRIMARY KEY CLUSTERED (ForecastID),
        CONSTRAINT UQ_fact_Demand_Forecast_Key UNIQUE (PeriodMonth, VersionDate, FactoryID, MaterialID),
        CONSTRAINT FK_DemandForecast_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_DemandForecast_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_DemandForecast_Batch FOREIGN KEY (BatchID) REFERENCES dbo.sys_Import_Batch(BatchID)
    );
    CREATE NONCLUSTERED INDEX IX_fact_Demand_Forecast_Lookup
    ON dbo.fact_Demand_Forecast (PeriodMonth, VersionDate DESC, FactoryID, MaterialID);
END;
GO

-- =====================================================================================
-- PHẦN V: GIAO DỊCH NGƯỜI DÙNG TẠO (USER ACTIONS)
-- =====================================================================================

-- 21. fact_Inventory_Block (Lệnh khóa hàng thủ công - Chặn tồn)
IF OBJECT_ID('dbo.fact_Inventory_Block', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_Inventory_Block (
        BlockID INT IDENTITY(1,1) NOT NULL,
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        BlockedKg DECIMAL(18,0) NOT NULL,
        StartDate DATE NOT NULL,
        EndDate DATE NULL,                  -- NULL = Đang khóa
        Reason NVARCHAR(250) NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedBy NVARCHAR(50) NOT NULL,
        ReleasedAt DATETIME2(0) NULL,
        ReleasedBy NVARCHAR(50) NULL,
        CONSTRAINT PK_fact_Inventory_Block PRIMARY KEY CLUSTERED (BlockID),
        CONSTRAINT FK_InventoryBlock_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_InventoryBlock_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT CK_InventoryBlock_Kg CHECK (BlockedKg > 0),
        CONSTRAINT CK_InventoryBlock_Dates CHECK (EndDate IS NULL OR EndDate >= StartDate)
    );
    CREATE NONCLUSTERED INDEX IX_fact_Inventory_Block_Active
    ON dbo.fact_Inventory_Block (StartDate, EndDate, FactoryID, MaterialID) INCLUDE (BlockedKg);
END;
GO

-- 22. fact_Delivery_Plan (Kế hoạch giao hàng tuần chi tiết theo ngày)
IF OBJECT_ID('dbo.fact_Delivery_Plan', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_Delivery_Plan (
        PlanID INT IDENTITY(1,1) NOT NULL,
        PlanDate DATE NOT NULL,
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        SupplierID INT NOT NULL,
        PONumber NVARCHAR(50) NULL,
        PlanQtyKg DECIMAL(18,0) NOT NULL,
        Note NVARCHAR(250) NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedBy NVARCHAR(50) NOT NULL,
        UpdatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedBy NVARCHAR(50) NOT NULL,
        CONSTRAINT PK_fact_Delivery_Plan PRIMARY KEY CLUSTERED (PlanID),
        CONSTRAINT FK_DeliveryPlan_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_DeliveryPlan_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT FK_DeliveryPlan_Supplier FOREIGN KEY (SupplierID) REFERENCES dbo.dim_Supplier(SupplierID),
        CONSTRAINT CK_DeliveryPlan_Qty CHECK (PlanQtyKg > 0)
    );
    CREATE UNIQUE NONCLUSTERED INDEX UQ_fact_Delivery_Plan_Po
    ON dbo.fact_Delivery_Plan (PlanDate, FactoryID, MaterialID, SupplierID, PONumber)
    WHERE PONumber IS NOT NULL;
END;
GO

-- 23. fact_Purchase_Request (Phiếu đề nghị mua hàng - PR)
IF OBJECT_ID('dbo.fact_Purchase_Request', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_Purchase_Request (
        RequestID INT IDENTITY(1,1) NOT NULL,
        RequestCode VARCHAR(30) NOT NULL,    -- 'PR-YYYYMMDD-XXXX'
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        SupplierID INT NOT NULL,
        RequestedQtyKg DECIMAL(18,0) NOT NULL,
        NeedByDate DATE NOT NULL,
        Status VARCHAR(20) NOT NULL DEFAULT 'SENT', -- 'SENT', 'MATCHED', 'EXPIRED', 'CANCELLED'
        PONumber NVARCHAR(50) NULL,
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
    CREATE NONCLUSTERED INDEX IX_fact_Purchase_Request_Status
    ON dbo.fact_Purchase_Request (Status, FactoryID, MaterialID) INCLUDE (RequestedQtyKg);
END;
GO

-- 24. fact_Demand_Override (Lịch sử nhu cầu tháng sửa tay - Append-only)
IF OBJECT_ID('dbo.fact_Demand_Override', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.fact_Demand_Override (
        OverrideID INT IDENTITY(1,1) NOT NULL,
        FactoryID INT NOT NULL,
        MaterialID INT NOT NULL,
        PeriodMonth DATE NOT NULL,          -- Ngày đầu tháng (YYYY-MM-01)
        EffectiveDate DATE NOT NULL,        -- Ngày bắt đầu áp dụng
        OverrideKg DECIMAL(18,0) NULL,      -- NULL = HỦY BỎ sửa tay
        Reason NVARCHAR(250) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedBy NVARCHAR(50) NOT NULL,
        CONSTRAINT PK_fact_Demand_Override PRIMARY KEY CLUSTERED (OverrideID),
        CONSTRAINT FK_DemandOverride_Factory FOREIGN KEY (FactoryID) REFERENCES dbo.dim_Factory(FactoryID),
        CONSTRAINT FK_DemandOverride_Material FOREIGN KEY (MaterialID) REFERENCES dbo.dim_Material(MaterialID),
        CONSTRAINT CK_DemandOverride_Kg CHECK (OverrideKg IS NULL OR OverrideKg >= 0)
    );
    CREATE NONCLUSTERED INDEX IX_fact_Demand_Override_Effective
    ON dbo.fact_Demand_Override (FactoryID, MaterialID, PeriodMonth, EffectiveDate DESC, CreatedAt DESC);
END;
GO
