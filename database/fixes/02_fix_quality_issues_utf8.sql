USE PremixTrack_DB;
GO

SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- Sửa 8 cảnh báo chất lượng bị lỗi mã hóa tiếng Việt
UPDATE dbo.sys_Data_Quality_Issue
SET Description = N'Cặp Nhà máy VL2 (1003) - Nguyên liệu 0038 (Vitamin C 99%) phát sinh giao dịch nhưng không nằm trong danh sách theo dõi Plant Items.'
WHERE IssueID = 1;

UPDATE dbo.sys_Data_Quality_Issue
SET Description = N'Lệch phương trình xuất nhập tồn (Movement) tại NM BD - NL 0014: Tính toán = 3100 kg, Closed Onhand trên file = 3000 kg.'
WHERE IssueID = 2;

UPDATE dbo.sys_Data_Quality_Issue
SET Description = N'Lệch tồn cuối giữa Movement và On Hand RAW tại NM DN - NL 0014: Closed Onhand = 5000 kg, SOH RAW = 0 kg.'
WHERE IssueID = 3;

UPDATE dbo.sys_Data_Quality_Issue
SET Description = N'Lệch tồn cuối giữa Movement và On Hand RAW tại NM BD - NL 0014: Closed Onhand = 3000 kg, SOH RAW = 0 kg.'
WHERE IssueID = 4;

UPDATE dbo.sys_Data_Quality_Issue
SET Description = N'Lệch lượng hàng nhận giữa phiếu POR và báo cáo Movement tại NM DN - NL 0014: Tổng POR = 1750 kg, Movement Qty Receive = 2000 kg.'
WHERE IssueID = 5;

UPDATE dbo.sys_Data_Quality_Issue
SET Description = N'Lệch tồn đang đi đường (TRANSIT) tại kho DN - NL 0014: SOH TRANSIT = 0 kg, Tổng TO Shipped = 1000 kg.'
WHERE IssueID = 6;

UPDATE dbo.sys_Data_Quality_Issue
SET Description = N'Lệch tồn đang đi đường (TRANSIT) tại kho DN - NL 0014: SOH TRANSIT = 1500 kg, Tổng TO Shipped = 0 kg.'
WHERE IssueID = 7;

UPDATE dbo.sys_Data_Quality_Issue
SET Description = N'Số lượng đặt/nhận không phải là bội số quy cách bao (25 kg/bao) tại NM BD - NL 0014 (Chứng từ: PAG-2026-009, Lượng: 510 kg).'
WHERE IssueID = 8;

GO
