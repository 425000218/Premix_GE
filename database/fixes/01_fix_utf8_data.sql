-- =====================================================================================
-- FIX 01: SỬA LỖI FONT TIẾNG VIỆT UTF-8 TRONG BẢNG SYS_ROLE VÀ DỮ LIỆU BAN ĐẦU
-- File: database/fixes/01_fix_utf8_data.sql
-- =====================================================================================

USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- 1. Cập nhật lại tên và mô tả vai trò tiếng Việt chuẩn UTF-8
UPDATE dbo.sys_Role
SET 
    RoleName = N'Quản trị hệ thống',
    Description = N'Toàn quyền quản trị tài khoản, vai trò và cấu hình hệ thống'
WHERE RoleCode = 'ADMIN';

UPDATE dbo.sys_Role
SET 
    RoleName = N'Lập kế hoạch & Mua hàng',
    Description = N'Nạp file ERP, theo dõi vị thế, lập kế hoạch giao và tạo đề nghị mua'
WHERE RoleCode = 'PLANNER';

UPDATE dbo.sys_Role
SET 
    RoleName = N'Người dùng nhà máy',
    Description = N'Theo dõi vị thế, kế hoạch giao và quản lý tồn khóa tại nhà máy được gán'
WHERE RoleCode = 'FACTORY';

UPDATE dbo.sys_Role
SET 
    RoleName = N'Ban quản lý / Chỉ xem',
    Description = N'Xem bảng điều khiển, bảng vị thế và kế hoạch giao toàn hệ thống'
WHERE RoleCode = 'VIEWER';

-- 2. Cập nhật các vai trò tùy biến nếu có (giữ role chuẩn)
UPDATE dbo.sys_Role
SET 
    RoleName = N'Trưởng bộ phận QA/QC Toàn quốc',
    Description = N'Theo dõi chất lượng, kiểm soát tồn bị khóa và đối chiếu tỷ lệ hao hụt'
WHERE RoleCode IN ('QA_58916', 'TEST_QA_LEAD');

-- 3. Cập nhật bảng dim_Factory chuẩn tiếng Việt
UPDATE dbo.dim_Factory SET FactoryName = N'Nhà máy Đồng Nai' WHERE FactoryCode = 'DN';
UPDATE dbo.dim_Factory SET FactoryName = N'Nhà máy Bình Dương' WHERE FactoryCode = 'BD';
UPDATE dbo.dim_Factory SET FactoryName = N'Nhà máy Vĩnh Long 2' WHERE FactoryCode = 'VL2';
UPDATE dbo.dim_Factory SET FactoryName = N'Nhà máy Hậu Giang' WHERE FactoryCode = 'HG';
UPDATE dbo.dim_Factory SET FactoryName = N'Nhà máy Bình Định 1' WHERE FactoryCode = 'BD1';
UPDATE dbo.dim_Factory SET FactoryName = N'Nhà máy Bình Định 2' WHERE FactoryCode = 'BD2';

PRINT N'Cập nhật dữ liệu UTF-8 cho sys_Role và dim_Factory thành công!';
GO
