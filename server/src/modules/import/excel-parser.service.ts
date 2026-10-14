import { BadRequestException, Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  ParsedForecastCell,
  ParsedForecastData,
  ParsedMasterData,
  ParsedMaterial,
  ParsedMovementRow,
  ParsedOnHandRow,
  ParsedPlant,
  ParsedPlantItem,
  ParsedPoPendingRow,
  ParsedPoReceiptRow,
  ParsedSubstitution,
  ParsedSupplier,
  ParsedTransferRow,
  ParsedVendorItem,
} from './interfaces/master-data.interface.js';

@Injectable()
export class ExcelParserService {
  /**
   * Phân tích file Master Data.xlsx gồm 5 sheets:
   * 1. Plants (Mã nhà máy, Tên, Region, Type, Org codes)
   * 2. Items (Item code, Item name, Category, Nhóm, Quy cách, Bao (kg), UOM, Item type)
   * 3. Plant Items (OU, Org code, Item code)
   * 4. Vendors (Vendor account, Vendor name, Group, Country)
   * 5. Vendor Items (Item code, Vendor account) hoặc Substitutions (Mã NL gốc, Mã NL thay thế)
   */
  parseMasterData(buffer: Buffer): ParsedMasterData {
    const workbook = this.readWorkbook(buffer, 'Master Data');
    const sheetNames = workbook.SheetNames;

    const plantsSheetName = this.findSheetName(sheetNames, ['plants', 'nhà máy', 'nha may', 'factories']);
    if (!plantsSheetName) {
      throw new BadRequestException('Thiếu sheet bắt buộc: "Plants".');
    }

    const itemsSheetName = this.findSheetName(sheetNames, ['items', 'nguyên liệu', 'nguyen lieu', 'materials']);
    if (!itemsSheetName) {
      throw new BadRequestException('Thiếu sheet bắt buộc: "Items".');
    }

    const plantItemsSheetName = this.findSheetName(sheetNames, ['plant items', 'cặp theo dõi', 'cap theo doi', 'plant_items']);
    if (!plantItemsSheetName) {
      throw new BadRequestException('Thiếu sheet bắt buộc: "Plant Items".');
    }

    const vendorsSheetName = this.findSheetName(sheetNames, ['vendors', 'nhà cung cấp', 'nha cung cap', 'suppliers']);
    if (!vendorsSheetName) {
      throw new BadRequestException('Thiếu sheet bắt buộc: "Vendors".');
    }

    const vendorItemsSheetName = this.findSheetName(sheetNames, ['vendor items', 'vendor_items', 'ncc nguyên liệu']);
    const substitutionsSheetName = this.findSheetName(sheetNames, ['substitutions', 'thay thế', 'thay the', 'nguyên liệu thay thế']);

    if (!vendorItemsSheetName && !substitutionsSheetName) {
      throw new BadRequestException('Thiếu sheet thứ 5 bắt buộc: "Vendor Items" hoặc "Substitutions".');
    }

    const plants = this.parsePlantsSheet(workbook.Sheets[plantsSheetName]);
    const materials = this.parseItemsSheet(workbook.Sheets[itemsSheetName]);
    const suppliers = this.parseVendorsSheet(workbook.Sheets[vendorsSheetName]);
    const plantItems = this.parsePlantItemsSheet(workbook.Sheets[plantItemsSheetName]);

    let substitutions: ParsedSubstitution[] = [];
    if (substitutionsSheetName) {
      substitutions = this.parseSubstitutionsSheet(workbook.Sheets[substitutionsSheetName]);
    }

    let vendorItems: ParsedVendorItem[] = [];
    if (vendorItemsSheetName) {
      vendorItems = this.parseVendorItemsSheet(workbook.Sheets[vendorItemsSheetName]);
    }

    return {
      plants,
      materials,
      suppliers,
      plantItems,
      substitutions,
      vendorItems,
    };
  }

  /**
   * Trích xuất Ngày cắt D từ tên file ("Cut off 06h 071026") và tính Ngày chốt C = D - 1 (BR-15e)
   */
  extractCutoffAndSnapshotDate(
    fileNames: string[],
    explicitSnapshotDate?: string,
  ): { snapshotDate: string; cutoffDate: string } {
    if (explicitSnapshotDate && /^\d{4}-\d{2}-\d{2}$/.test(explicitSnapshotDate.trim())) {
      const cDate = new Date(`${explicitSnapshotDate.trim()}T00:00:00Z`);
      if (!isNaN(cDate.getTime())) {
        const dDate = new Date(cDate.getTime() + 86400000);
        return {
          snapshotDate: cDate.toISOString().slice(0, 10),
          cutoffDate: dDate.toISOString().slice(0, 10),
        };
      }
    }

    // Dò tìm mẫu DDMMYY hoặc YYYY-MM-DD trên tên file
    for (const name of fileNames) {
      // Mẫu YYYY-MM-DD
      const isoMatch = name.match(/(20\d{2})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const dDate = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
        if (!isNaN(dDate.getTime())) {
          const cDate = new Date(dDate.getTime() - 86400000);
          return {
            snapshotDate: cDate.toISOString().slice(0, 10),
            cutoffDate: dDate.toISOString().slice(0, 10),
          };
        }
      }

      // Mẫu DDMMYY (ví dụ: Cut off 06h 071026 -> 07/10/2026)
      const ddmmyyMatch = name.match(/(?:cut\s*off[^0-9]*|on\s*hand[^0-9]*|movement[^0-9]*|pending[^0-9]*|\b)(\d{2})(\d{2})(\d{2})\b/i);
      if (ddmmyyMatch) {
        const day = parseInt(ddmmyyMatch[1], 10);
        const month = parseInt(ddmmyyMatch[2], 10);
        const year = 2000 + parseInt(ddmmyyMatch[3], 10);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          const dDate = new Date(Date.UTC(year, month - 1, day));
          const cDate = new Date(dDate.getTime() - 86400000);
          return {
            snapshotDate: cDate.toISOString().slice(0, 10),
            cutoffDate: dDate.toISOString().slice(0, 10),
          };
        }
      }
    }

    // Mặc định nếu không tìm thấy trên tên file: lấy hôm qua làm C, hôm nay làm D
    const today = new Date();
    const dDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const cDate = new Date(dDate.getTime() - 86400000);
    return {
      snapshotDate: cDate.toISOString().slice(0, 10),
      cutoffDate: dDate.toISOString().slice(0, 10),
    };
  }

  /**
   * Trích xuất khoảng ngày nhận hàng từ tên file POR (ví dụ: "PO receipt 011026-061026.xlsx") (BR-18)
   */
  extractPorDateRange(fileName: string): { porStartDate: string | null; porEndDate: string | null } {
    const rangeMatch = fileName.match(/(\d{2})(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})(\d{2})/);
    if (rangeMatch) {
      const d1 = new Date(Date.UTC(2000 + parseInt(rangeMatch[3], 10), parseInt(rangeMatch[2], 10) - 1, parseInt(rangeMatch[1], 10)));
      const d2 = new Date(Date.UTC(2000 + parseInt(rangeMatch[6], 10), parseInt(rangeMatch[5], 10) - 1, parseInt(rangeMatch[4], 10)));
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        return {
          porStartDate: d1.toISOString().slice(0, 10),
          porEndDate: d2.toISOString().slice(0, 10),
        };
      }
    }
    return { porStartDate: null, porEndDate: null };
  }

  /**
   * 1. Phân tích file On Hand (Sheet SOH) - BR-15c
   * Tìm dòng tiêu đề (có thể ở dòng 1 hoặc khoảng dòng 10), lọc lấy RAW và TRANSIT
   */
  parseOnHand(buffer: Buffer): ParsedOnHandRow[] {
    const workbook = this.readWorkbook(buffer, 'On Hand');
    const sheetName = this.findSheetName(workbook.SheetNames, ['soh', 'on hand', 'onhand']);
    if (!sheetName) {
      throw new BadRequestException('File On Hand thiếu sheet bắt buộc: "SOH".');
    }

    const rows = this.extractRowsWithDynamicHeader(
      workbook.Sheets[sheetName],
      'On Hand (SOH)',
      [
        { name: 'ORG CODE', aliases: ['org code', 'warehouse', 'mã kho'] },
        { name: 'SUB INV', aliases: ['sub inv', 'subinventory', 'sub_inv'] },
        { name: 'ITEM CODE', aliases: ['item code', 'item number', 'mã nl'] },
        { name: 'SOH', aliases: ['soh', 'on hand', 'physical inventory'] },
      ],
    );

    const result: ParsedOnHandRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const orgCode = this.getCell(row, ['org code', 'warehouse', 'mã kho']);
      const subInv = this.getCell(row, ['sub inv', 'subinventory', 'sub_inv']).toUpperCase();
      const itemCode = this.getCell(row, ['item code', 'item number', 'mã nl']);
      const sohStr = this.getCell(row, ['soh', 'on hand', 'physical inventory']);

      if (!orgCode && !itemCode) continue;
      if (orgCode.toLowerCase() === 'total' || itemCode.toLowerCase() === 'total') continue;

      if (!orgCode || !itemCode || !subInv) {
        continue;
      }

      const sohQtyKg = this.parseNumber(sohStr, `File On Hand dòng ${i + 1} (SOH)`);
      if (sohQtyKg < 0) {
        throw new BadRequestException(`Vi phạm BR-22a: File On Hand có số lượng tồn âm (${sohQtyKg}) tại kho ${orgCode}, mã NL ${itemCode}.`);
      }

      // BR-15c: Bỏ qua các dòng tồn = 0
      if (sohQtyKg === 0) continue;

      // Chỉ giữ RAW (để ghi vào fact_Inventory_SOH) và TRANSIT (để kiểm chéo BR-15d #4)
      if (subInv === 'RAW' || subInv === 'TRANSIT') {
        result.push({
          orgCode,
          subInv,
          itemCode,
          sohQtyKg: Math.round(sohQtyKg),
        });
      }
    }

    return result;
  }

  /**
   * 2. Phân tích file Inventory Movement (Sheet INV46) - BR-15a
   */
  parseMovement(buffer: Buffer): ParsedMovementRow[] {
    const workbook = this.readWorkbook(buffer, 'Inventory Movement');
    const sheetName = this.findSheetName(workbook.SheetNames, ['inv46', 'movement', 'inventory movement']);
    if (!sheetName) {
      throw new BadRequestException('File Inventory Movement thiếu sheet bắt buộc: "INV46".');
    }

    const rows = this.extractRowsWithDynamicHeader(
      workbook.Sheets[sheetName],
      'Inventory Movement (INV46)',
      [
        { name: 'Org Code', aliases: ['org code', 'warehouse', 'wh'] },
        { name: 'Item code', aliases: ['item code', 'item number', 'item'] },
        { name: 'Begin Onhand', aliases: ['begin onhand qty', 'begin onhand', 'begin on hand', 'begin on hand qty', 'begin qty', 'soh đầu kỳ'] },
        { name: 'Qty Receive', aliases: ['qty receive', 'qty receive qty', 'receive qty', 'receive', 'nhập kho'] },
        { name: 'Wip Issue', aliases: ['wip issue qty', 'wip issue', 'issue qty', 'issue', 'xuất sản xuất'] },
        { name: 'Transfer In', aliases: ['transfer in qty', 'transfer in', 'chuyển đến'] },
        { name: 'Transfer Out', aliases: ['transfer out qty', 'transfer out', 'chuyển đi'] },
        { name: 'Adjust', aliases: ['adjust qty', 'adjustment qty', 'adjust', 'adjustment', 'điều chỉnh'] },
        { name: 'Closed Onhand', aliases: ['closed onhand qty', 'closed onhand', 'closed on hand', 'closed on hand qty', 'closed qty', 'soh cuối kỳ'] },
      ],
    );

    const result: ParsedMovementRow[] = [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const orgCode = this.getCell(row, ['org code', 'warehouse', 'wh']);
      const itemCode = this.getCell(row, ['item code', 'item number', 'item']);

      if (!orgCode && !itemCode) continue;
      if (orgCode.toLowerCase().includes('total') || itemCode.toLowerCase().includes('total')) continue;
      if (!orgCode || !itemCode) continue;

      const key = `${orgCode}#${itemCode}`;
      if (seenKeys.has(key)) {
        throw new BadRequestException(`Vi phạm BR-22a: File Inventory Movement trùng lặp khóa (Org Code: "${orgCode}", Item code: "${itemCode}").`);
      }
      seenKeys.add(key);

      const beginOnhandKg = Math.round(this.parseNumber(this.getCell(row, ['begin onhand qty', 'begin onhand', 'begin on hand', 'begin on hand qty', 'begin qty']), 'Begin Onhand'));
      const qtyReceiveKg = Math.round(this.parseNumber(this.getCell(row, ['qty receive', 'qty receive qty', 'receive qty', 'receive']), 'Qty Receive'));
      const wipIssueKg = Math.round(this.parseNumber(this.getCell(row, ['wip issue qty', 'wip issue', 'issue qty', 'issue']), 'Wip Issue'));
      const transferInKg = Math.round(this.parseNumber(this.getCell(row, ['transfer in qty', 'transfer in']), 'Transfer In'));
      const transferOutKg = Math.round(this.parseNumber(this.getCell(row, ['transfer out qty', 'transfer out']), 'Transfer Out'));
      const adjustKg = Math.round(this.parseNumber(this.getCell(row, ['adjust qty', 'adjustment qty', 'adjust', 'adjustment']), 'Adjust'));
      const closedOnhandKg = Math.round(this.parseNumber(this.getCell(row, ['closed onhand qty', 'closed onhand', 'closed on hand', 'closed on hand qty', 'closed qty']), 'Closed Onhand'));

      result.push({
        orgCode,
        itemCode,
        beginOnhandKg,
        qtyReceiveKg,
        wipIssueKg,
        transferInKg,
        transferOutKg,
        adjustKg,
        closedOnhandKg,
      });
    }

    return result;
  }

  /**
   * 3. Phân tích file PO Pending (Sheet FINISH PENDING) - BR-19 & BR-19b
   */
  parsePoPending(buffer: Buffer): ParsedPoPendingRow[] {
    const workbook = this.readWorkbook(buffer, 'PO Pending');
    const sheetName = this.findSheetName(workbook.SheetNames, ['finish pending', 'po pending', 'pending']);
    if (!sheetName) {
      throw new BadRequestException('File PO Pending thiếu sheet bắt buộc: "FINISH PENDING".');
    }

    const rows = this.extractRowsWithDynamicHeader(
      workbook.Sheets[sheetName],
      'PO Pending (FINISH PENDING)',
      [
        { name: 'Warehouse', aliases: ['warehouse', 'org code', 'wh'] },
        { name: 'Vendor account', aliases: ['vendor account', 'code vendor'] },
        { name: 'Purchase order/PAG', aliases: ['purchase order/pag', 'po number', 'purchase order'] },
        { name: 'Item number', aliases: ['item number', 'item code', 'code rm'] },
        { name: 'Unit', aliases: ['unit', 'uom'] },
        { name: 'Quantity', aliases: ['quantity', 'order qty'] },
        { name: 'Deliver remainder', aliases: ['deliver remainder', 'remainder'] },
        { name: 'Delivery date', aliases: ['delivery date', 'date'] },
      ],
    );

    const result: ParsedPoPendingRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const orgCode = this.getCell(row, ['warehouse', 'org code', 'wh']);
      const vendorAccount = this.getCell(row, ['vendor account', 'code vendor']);
      const vendorName = this.getCell(row, ['vendor name', 'name']) || null;
      const vendorGroup = this.getCell(row, ['group', 'vendor group']) || null;
      const poNumber = this.getCell(row, ['purchase order/pag', 'po number', 'purchase order']);
      const itemCode = this.getCell(row, ['item number', 'item code', 'code rm']);
      const unit = this.getCell(row, ['unit', 'uom']);
      const qtyStr = this.getCell(row, ['quantity', 'order qty']);
      const receivedStr = this.getCell(row, ['received/release', 'received']);
      const remainderStr = this.getCell(row, ['deliver remainder', 'remainder']);
      const deliveryDateStr = this.getCell(row, ['delivery date', 'date']);
      const lineStatus = this.getCell(row, ['line status', 'status']) || null;

      if (!orgCode && !poNumber && !itemCode) continue;
      if (!orgCode || !poNumber || !itemCode) continue;

      if (unit && unit.toLowerCase() !== 'kg') {
        throw new BadRequestException(`Vi phạm BR-22a: File PO Pending dòng ${i + 2} có đơn vị tính "${unit}" khác "kg" (PO: ${poNumber}).`);
      }

      const orderQtyKg = Math.round(this.parseNumber(qtyStr, 'PO Pending Quantity'));
      const receivedQtyKg = Math.round(this.parseNumber(receivedStr || '0', 'PO Pending Received'));
      const deliverRemainderKg = Math.round(this.parseNumber(remainderStr, 'PO Pending Deliver remainder'));

      if (deliverRemainderKg < 0 || orderQtyKg < 0) {
        throw new BadRequestException(`Vi phạm BR-22a: File PO Pending dòng ${i + 2} có số lượng âm (PO: ${poNumber}).`);
      }

      const deliveryDate = this.parseDateString(deliveryDateStr, `PO Pending dòng ${i + 2} (Delivery date)`);
      const docType = poNumber.toUpperCase().startsWith('PAG') ? 'PAG' : 'PO';

      result.push({
        orgCode,
        vendorAccount: vendorAccount || 'UNKNOWN_VENDOR',
        vendorName,
        vendorGroup,
        poNumber,
        itemCode,
        unit: 'kg',
        orderQtyKg,
        receivedQtyKg,
        deliverRemainderKg,
        deliveryDate,
        docType,
        lineStatus,
      });
    }

    return result;
  }

  /**
   * 4. Phân tích file PO Receipt (Sheet POR) - BR-18 & BR-18a
   */
  parsePoReceipt(buffer: Buffer): ParsedPoReceiptRow[] {
    const workbook = this.readWorkbook(buffer, 'PO Receipt');
    const sheetName = this.findSheetName(workbook.SheetNames, ['por', 'po receipt', 'receipt']);
    if (!sheetName) {
      throw new BadRequestException('File PO Receipt thiếu sheet bắt buộc: "POR".');
    }

    const rows = this.extractRowsWithDynamicHeader(
      workbook.Sheets[sheetName],
      'PO Receipt (POR)',
      [
        { name: 'WH', aliases: ['wh', 'warehouse', 'org code', 'kho'] },
        { name: 'Code Vendor', aliases: ['code vendor', 'vendor account', 'vendor', 'mã ncc'] },
        { name: 'POR', aliases: ['por', 'receipt number', 'por number', 'phiếu nhận'] },
        { name: 'Date Delivery', aliases: ['date delivery', 'delivery date', 'ngày nhận', 'ngay delivery'] },
        { name: 'Code RM', aliases: ['code rm', 'item code', 'item number', 'mã nl'] },
        { name: 'Unit', aliases: ['unit', 'uom', 'đvt'] },
        { name: 'Quantity', aliases: ['quantity / số lượng', 'quantity / so luong', 'quantity', 'received qty', 'số lượng', 'so luong'] },
      ],
    );

    const result: ParsedPoReceiptRow[] = [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const orgCode = this.getCell(row, ['wh', 'warehouse', 'org code', 'kho']);
      const vendorAccount = this.getCell(row, ['code vendor', 'vendor account', 'vendor', 'mã ncc']);
      const poNumber = this.getCell(row, ['po number', 'purchase order', 'số po']) || null;
      const receiptNumber = this.getCell(row, ['por', 'receipt number', 'por number', 'phiếu nhận']);
      const deliveryDateStr = this.getCell(row, ['date delivery', 'delivery date', 'ngày nhận', 'ngay delivery']);
      const itemCode = this.getCell(row, ['code rm', 'item code', 'item number', 'mã nl']);
      const unit = this.getCell(row, ['unit', 'uom', 'đvt']);
      const qtyStr = this.getCell(row, ['quantity / số lượng', 'quantity / so luong', 'quantity', 'received qty', 'số lượng', 'so luong']);
      const pagNumber = this.getCell(row, ['pag', 'pag number']) || null;
      const truckNumber = this.getCell(row, ['truck number', 'truck', 'biển số xe', 'xe', 'số xe']) || null;

      if (!orgCode && !receiptNumber && !itemCode) continue;
      if (!orgCode || !receiptNumber || !itemCode) continue;

      if (unit && unit.toLowerCase() !== 'kg') {
        throw new BadRequestException(`Vi phạm BR-18a/BR-22a: File PO Receipt dòng ${i + 2} có đơn vị tính "${unit}" khác "kg" (POR: ${receiptNumber}).`);
      }

      const key = `${receiptNumber}#${itemCode}`;
      if (seenKeys.has(key)) {
        throw new BadRequestException(`Vi phạm BR-22a: File PO Receipt trùng lặp khóa (POR: "${receiptNumber}", Code RM: "${itemCode}").`);
      }
      seenKeys.add(key);

      const receivedQtyKg = Math.round(this.parseNumber(qtyStr, `POR dòng ${i + 2} Quantity`));
      if (receivedQtyKg < 0) {
        throw new BadRequestException(`Vi phạm BR-22a: File PO Receipt dòng ${i + 2} có số lượng nhận âm (${receivedQtyKg}).`);
      }

      const deliveryDate = this.parseDateString(deliveryDateStr, `POR dòng ${i + 2} Date Delivery`);

      result.push({
        orgCode,
        vendorAccount: vendorAccount || 'UNKNOWN_VENDOR',
        poNumber,
        receiptNumber,
        deliveryDate,
        itemCode,
        unit: 'kg',
        receivedQtyKg,
        pagNumber,
        truckNumber,
      });
    }

    return result;
  }

  /**
   * 5. Phân tích file Transfer Order (Sheet1) - BR-19a
   */
  parseTransferOrder(buffer: Buffer): ParsedTransferRow[] {
    const workbook = this.readWorkbook(buffer, 'Transfer Order');
    const sheetName = this.findSheetName(workbook.SheetNames, ['sheet1', 'transfer order', 'to', 'transfer']);
    if (!sheetName) {
      throw new BadRequestException('File Transfer Order thiếu sheet bắt buộc: "Sheet1".');
    }

    const rows = this.extractRowsWithDynamicHeader(
      workbook.Sheets[sheetName],
      'Transfer Order (Sheet1)',
      [
        { name: 'Transfer Number', aliases: ['transfer number', 'to number'] },
        { name: 'Item No', aliases: ['item no', 'item code', 'item number'] },
        { name: 'From Warehouse', aliases: ['from warehouse', 'from wh'] },
        { name: 'To Warehouse', aliases: ['to warehouse', 'to wh'] },
        { name: 'Transfer status', aliases: ['transfer status', 'status'] },
        { name: 'Shipped Qty', aliases: ['shipped qty', 'shipped quantity'] },
        { name: 'Posted Qty to onhand', aliases: ['posted qty to onhand', 'posted qty'] },
      ],
    );

    const result: ParsedTransferRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const transferNumber = this.getCell(row, ['transfer number', 'to number']);
      const itemCode = this.getCell(row, ['item no', 'item code', 'item number']);
      const fromWarehouse = this.getCell(row, ['from warehouse', 'from wh']);
      const toWarehouse = this.getCell(row, ['to warehouse', 'to wh']);
      const transferStatus = this.getCell(row, ['transfer status', 'status']);
      const shippedDateStr = this.getCell(row, ['shipped date']);
      const receivedDateStr = this.getCell(row, ['received date']);
      const shippedQtyStr = this.getCell(row, ['shipped qty', 'shipped quantity']);
      const postedQtyStr = this.getCell(row, ['posted qty to onhand', 'posted qty']);

      if (!transferNumber && !itemCode) continue;
      if (!transferNumber || !itemCode || !fromWarehouse || !toWarehouse) continue;

      const shippedQtyKg = Math.round(this.parseNumber(shippedQtyStr || '0', 'TO Shipped Qty'));
      const postedQtyKg = Math.round(this.parseNumber(postedQtyStr || '0', 'TO Posted Qty'));

      if (shippedQtyKg < 0 || postedQtyKg < 0) {
        throw new BadRequestException(`Vi phạm BR-22a: File Transfer Order dòng ${i + 2} có số lượng điều chuyển âm (TO: ${transferNumber}).`);
      }

      const shippedDate = shippedDateStr ? this.parseDateString(shippedDateStr, `TO Shipped Date`) : null;
      const receivedDate = receivedDateStr ? this.parseDateString(receivedDateStr, `TO Received Date`) : null;

      result.push({
        transferNumber,
        itemCode,
        fromWarehouse,
        toWarehouse,
        transferStatus: transferStatus || 'Created',
        shippedDate,
        receivedDate,
        shippedQtyKg,
        postedQtyKg,
      });
    }

    return result;
  }

  /**
   * 6. Phân tích file Forecast (Sheet RM Usage) - BR-15b
   * Hỗ trợ ma trận: Dòng = Nguyên liệu, Cột = Nhà máy (DN, BD, VL2, HG, BD1, BD2 hoặc mã kho 1001..1006)
   */
  parseForecast(
    buffer: Buffer,
    explicitPeriodMonth?: string,
    explicitVersionDate?: string,
  ): ParsedForecastData {
    const workbook = this.readWorkbook(buffer, 'Forecast (RM Usage)');
    const sheetName = this.findSheetName(workbook.SheetNames, ['rm usage', 'forecast', 'rm_usage']);
    if (!sheetName) {
      throw new BadRequestException('File Forecast thiếu sheet bắt buộc: "RM Usage".');
    }

    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' });
    if (!matrix || matrix.length === 0) {
      throw new BadRequestException('Sheet "RM Usage" không có dữ liệu.');
    }

    // 1. Tìm dòng tiêu đề chứa Mã NL và các cột Nhà máy
    let headerRowIdx = -1;
    let itemCodeColIdx = -1;
    const factoryCols: { colIdx: number; orgCode: string }[] = [];
    const knownFactories = ['DN', 'BD', 'VL2', 'HG', 'BD1', 'BD2', '1001', '1002', '1003', '1004', '1005', '1006'];

    for (let r = 0; r < Math.min(matrix.length, 15); r++) {
      const row = matrix[r].map((c: any) => String(c || '').trim());
      const codeIdx = row.findIndex((c: string) =>
        ['item code', 'mã nl', 'ma nl', 'material code', 'code rm'].includes(c.toLowerCase()),
      );

      const matchedFactories: { colIdx: number; orgCode: string }[] = [];
      row.forEach((cellVal: string, cIdx: number) => {
        const upper = cellVal.toUpperCase();
        if (knownFactories.includes(upper) && cIdx !== codeIdx) {
          matchedFactories.push({ colIdx: cIdx, orgCode: upper });
        }
      });

      if (codeIdx !== -1 && matchedFactories.length > 0) {
        headerRowIdx = r;
        itemCodeColIdx = codeIdx;
        factoryCols.push(...matchedFactories);
        break;
      }
    }

    if (headerRowIdx === -1 || itemCodeColIdx === -1 || factoryCols.length === 0) {
      throw new BadRequestException(
        'Sheet "RM Usage" thiếu dòng tiêu đề hợp lệ (Cần cột "Item code" và các cột Nhà máy: DN, BD, VL2, HG, BD1, BD2).',
      );
    }

    // 2. Xác định PeriodMonth và VersionDate
    let versionDate = explicitVersionDate || new Date().toISOString();
    let periodMonth = explicitPeriodMonth || '';

    // Tìm trên các dòng đầu (trước headerRowIdx) nếu chưa truyền
    for (let r = 0; r < headerRowIdx; r++) {
      const rowText = matrix[r].join(' ').trim();
      const isoDateMatch = rowText.match(/(20\d{2}-\d{2}-\d{2})/);
      if (isoDateMatch && !explicitVersionDate) {
        versionDate = `${isoDateMatch[1]}T00:00:00Z`;
      }
      const monthMatch = rowText.match(/(20\d{2}-\d{2})/);
      if (monthMatch && !periodMonth) {
        periodMonth = `${monthMatch[1]}-01`;
      }
    }

    if (!periodMonth) {
      const now = new Date();
      periodMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
    } else if (/^\d{4}-\d{2}$/.test(periodMonth.trim())) {
      periodMonth = `${periodMonth.trim()}-01`;
    }

    // 3. Xoay ma trận (Unpivot)
    const cells: ParsedForecastCell[] = [];
    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;

      const itemCode = String(row[itemCodeColIdx] || '').trim();
      if (!itemCode || itemCode.toLowerCase() === 'total' || itemCode.toLowerCase() === 'tổng') {
        continue;
      }

      for (const fc of factoryCols) {
        const rawVal = String(row[fc.colIdx] || '').trim();
        if (!rawVal || rawVal === '-' || rawVal === '') continue;

        const forecastKg = Math.round(this.parseNumber(rawVal, `Forecast dòng ${r + 1} cột ${fc.orgCode}`));
        if (forecastKg < 0) {
          throw new BadRequestException(
            `Vi phạm BR-22a: File Forecast có nhu cầu âm (${forecastKg}) tại mã NL ${itemCode}, nhà máy ${fc.orgCode}.`,
          );
        }

        if (forecastKg > 0) {
          cells.push({
            orgCode: fc.orgCode,
            itemCode,
            forecastKg,
          });
        }
      }
    }

    if (cells.length === 0) {
      throw new BadRequestException('Sheet "RM Usage" không có ô dữ liệu dự báo nào lớn hơn 0.');
    }

    return {
      periodMonth,
      versionDate,
      cells,
    };
  }

  // ===================================================================================
  // CÁC HÀM HỖ TRỢ NỘI BỘ (PRIVATE HELPERS)
  // ===================================================================================

  private readWorkbook(buffer: Buffer, label: string): XLSX.WorkBook {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    } catch (err: any) {
      throw new BadRequestException(`Không thể đọc file Excel ${label}: ${err?.message || 'Định dạng không hợp lệ'}`);
    }
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new BadRequestException(`File Excel ${label} không có sheet nào.`);
    }
    return workbook;
  }

  private findSheetName(sheetNames: string[], candidates: string[]): string | undefined {
    return sheetNames.find((name) =>
      candidates.some((cand) => name.trim().toLowerCase() === cand.toLowerCase()),
    );
  }

  /**
   * Dò dòng tiêu đề động trong 20 dòng đầu tiên của Sheet và kiểm tra đủ các cột bắt buộc (BR-22)
   */
  private extractRowsWithDynamicHeader(
    sheet: XLSX.WorkSheet,
    fileLabel: string,
    requiredCols: { name: string; aliases: string[] }[],
  ): Record<string, any>[] {
    const matrix = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: false, defval: '' });
    if (!matrix || matrix.length === 0) {
      throw new BadRequestException(`Sheet trong file ${fileLabel} không có dữ liệu.`);
    }

    let headerRowIndex = -1;
    let normalizedHeaders: string[] = [];

    for (let r = 0; r < Math.min(matrix.length, 20); r++) {
      const rowCells = matrix[r].map((c: any) => this.normalizeHeader(String(c || '')));
      // Nếu dòng này khớp ít nhất 2 cột bắt buộc thì coi là ứng viên dòng tiêu đề
      const matchCount = requiredCols.filter((col) =>
        col.aliases.some((alias) => rowCells.includes(alias.toLowerCase())),
      ).length;

      if (matchCount >= Math.min(2, requiredCols.length)) {
        headerRowIndex = r;
        normalizedHeaders = rowCells;
        break;
      }
    }

    if (headerRowIndex === -1) {
      // Kiểm tra dòng đầu tiên để báo lỗi cụ thể cột thiếu theo BR-22
      const firstRowCells = matrix[0].map((c: any) => this.normalizeHeader(String(c || '')));
      for (const col of requiredCols) {
        const found = col.aliases.some((alias) => firstRowCells.includes(alias.toLowerCase()));
        if (!found) {
          throw new BadRequestException(`File ${fileLabel}: Cột bắt buộc "${col.name}" không tồn tại trong sheet.`);
        }
      }
      throw new BadRequestException(`File ${fileLabel}: Không tìm thấy dòng tiêu đề hợp lệ.`);
    }

    // Kiểm tra đủ tất cả các cột bắt buộc trên dòng tiêu đề tìm được
    for (const col of requiredCols) {
      const found = col.aliases.some((alias) => normalizedHeaders.includes(alias.toLowerCase()));
      if (!found) {
        throw new BadRequestException(`File ${fileLabel}: Cột bắt buộc "${col.name}" không tồn tại trong sheet.`);
      }
    }

    // Chuyển các dòng bên dưới dòng tiêu đề thành mảng đối tượng key-value
    const resultRows: Record<string, any>[] = [];
    const rawHeaders = matrix[headerRowIndex].map((c: any) => String(c || '').trim());

    for (let r = headerRowIndex + 1; r < matrix.length; r++) {
      const rowData = matrix[r];
      if (!rowData || rowData.every((c: any) => String(c || '').trim() === '')) {
        continue;
      }
      const obj: Record<string, any> = {};
      for (let c = 0; c < rawHeaders.length; c++) {
        if (rawHeaders[c]) {
          obj[rawHeaders[c]] = rowData[c] !== undefined && rowData[c] !== null ? String(rowData[c]).trim() : '';
        }
      }
      resultRows.push(obj);
    }

    return resultRows;
  }

  private parseNumber(val: string, context: string): number {
    if (!val || val.trim() === '' || val.trim() === '-') return 0;
    let cleaned = val.trim().replace(/\s+/g, '');

    // Hỗ trợ định dạng số châu Âu (1.234,5 -> 1234.5) và chuẩn Mỹ (1,234.5 -> 1234.5)
    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',')) {
      // Nếu có dấu phẩy và sau dấu phẩy có 3 chữ số (ví dụ 12,000) -> dấu phân cách hàng nghìn
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length !== 3) {
        cleaned = cleaned.replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    }

    const num = Number(cleaned);
    if (isNaN(num)) {
      throw new BadRequestException(`Giá trị số không hợp lệ tại ${context}: "${val}".`);
    }
    return num;
  }

  private parseDateString(val: string, context: string): string {
    if (!val || val.trim() === '') {
      throw new BadRequestException(`Thiếu ngày tháng bắt buộc tại ${context}.`);
    }
    const trimmed = val.trim();

    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }

    // DD/MM/YYYY hoặc M/D/YY
    const slashParts = trimmed.split(/[\/\-]/);
    if (slashParts.length === 3) {
      let p0 = parseInt(slashParts[0], 10);
      let p1 = parseInt(slashParts[1], 10);
      let p2 = parseInt(slashParts[2], 10);
      if (p2 < 100) p2 += 2000;

      // Nếu p0 > 12 -> chắc chắn là DD/MM/YYYY
      if (p0 > 12) {
        return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
      }
      // Mặc định ưu tiên DD/MM/YYYY nếu p1 <= 12
      if (p1 <= 12 && p0 <= 31) {
        return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
      }
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    throw new BadRequestException(`Định dạng ngày tháng không hợp lệ tại ${context}: "${val}".`);
  }

  private getSheetRows(sheet: XLSX.WorkSheet): Record<string, any>[] {
    return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      raw: false,
      defval: '',
      header: 0,
    });
  }

  private normalizeHeader(header: string): string {
    return header.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private getCell(row: Record<string, any>, aliases: string[]): string {
    for (const key of Object.keys(row)) {
      const normalizedKey = this.normalizeHeader(key);
      for (const alias of aliases) {
        if (normalizedKey === alias.toLowerCase()) {
          const val = row[key];
          return val !== undefined && val !== null ? String(val).trim() : '';
        }
      }
    }
    return '';
  }

  private checkRequiredHeaders(firstRow: Record<string, any>, requiredCols: { name: string; aliases: string[] }[]) {
    const keys = Object.keys(firstRow).map((k) => this.normalizeHeader(k));
    for (const col of requiredCols) {
      const found = col.aliases.some((alias) => keys.includes(alias.toLowerCase()));
      if (!found) {
        throw new BadRequestException(`Cột bắt buộc "${col.name}" không tồn tại trong sheet.`);
      }
    }
  }

  private parsePlantsSheet(sheet: XLSX.WorkSheet): ParsedPlant[] {
    const rows = this.getSheetRows(sheet);
    if (rows.length === 0) {
      throw new BadRequestException('Sheet "Plants" không có dữ liệu.');
    }

    this.checkRequiredHeaders(rows[0], [
      { name: 'Mã nhà máy', aliases: ['mã nhà máy', 'ma nha may', 'factorycode', 'plantcode'] },
      { name: 'Tên', aliases: ['tên', 'ten', 'factoryname', 'plantname', 'tên nhà máy', 'ten nha may'] },
      { name: 'Region', aliases: ['region', 'vùng', 'vung'] },
      { name: 'Type', aliases: ['type', 'loại', 'loai', 'planttype'] },
      { name: 'Org codes', aliases: ['org codes', 'org code', 'warehousecode', 'mã kho', 'ma kho'] },
    ]);

    const plants: ParsedPlant[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const factoryCode = this.getCell(row, ['mã nhà máy', 'ma nha may', 'factorycode', 'plantcode']).toUpperCase();
      const factoryName = this.getCell(row, ['tên', 'ten', 'factoryname', 'plantname', 'tên nhà máy', 'ten nha may']);
      const region = this.getCell(row, ['region', 'vùng', 'vung']).toUpperCase();
      const plantType = this.getCell(row, ['type', 'loại', 'loai', 'planttype']);
      const warehouseCode = this.getCell(row, ['org codes', 'org code', 'warehousecode', 'mã kho', 'ma kho']);

      if (!factoryCode && !factoryName && !warehouseCode) continue;

      if (!factoryCode || !factoryName || !warehouseCode) {
        throw new BadRequestException(`Dòng ${i + 2} sheet "Plants" thiếu thông tin bắt buộc (Mã NM, Tên hoặc Org code).`);
      }

      if (seenCodes.has(factoryCode)) {
        throw new BadRequestException(`Dòng ${i + 2} sheet "Plants": Trùng lặp Mã nhà máy "${factoryCode}".`);
      }
      seenCodes.add(factoryCode);

      plants.push({
        factoryCode,
        factoryName,
        region: region || 'SOUTH',
        plantType: plantType || 'Feed',
        warehouseCode,
      });
    }

    return plants;
  }

  private parseItemsSheet(sheet: XLSX.WorkSheet): ParsedMaterial[] {
    const rows = this.getSheetRows(sheet);
    if (rows.length === 0) {
      throw new BadRequestException('Sheet "Items" không có dữ liệu.');
    }

    this.checkRequiredHeaders(rows[0], [
      { name: 'Item code', aliases: ['item code', 'mã nl', 'ma nl', 'materialcode'] },
      { name: 'Item name', aliases: ['item name', 'tên nl', 'ten nl', 'materialname'] },
      { name: 'Category', aliases: ['category', 'nhóm nl', 'nhom nl'] },
      { name: 'Nhóm', aliases: ['nhóm', 'nhom', 'itemgroup', 'phân nhóm', 'phan nhom'] },
    ]);

    const materials: ParsedMaterial[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const materialCode = this.getCell(row, ['item code', 'mã nl', 'ma nl', 'materialcode']);
      const materialName = this.getCell(row, ['item name', 'tên nl', 'ten nl', 'materialname']);
      const category = this.getCell(row, ['category', 'nhóm nl', 'nhom nl']);
      const itemGroup = this.getCell(row, ['nhóm', 'nhom', 'itemgroup', 'phân nhóm', 'phan nhom']);
      const packingSpec = this.getCell(row, ['quy cách', 'quy cach', 'packingspec']) || null;
      const bagKgStr = this.getCell(row, ['bao (kg)', 'bao(kg)', 'bagkg', 'quy cách bao']);
      const uom = this.getCell(row, ['uom', 'đvt', 'dvt', 'unit']) || 'kg';
      const itemType = this.getCell(row, ['item type', 'itemtype', 'loại item', 'loai item']) || null;

      if (!materialCode && !materialName) continue;

      if (!materialCode || !materialName || !category) {
        throw new BadRequestException(`Dòng ${i + 2} sheet "Items" thiếu thông tin bắt buộc (Mã NL, Tên NL hoặc Category).`);
      }

      if (seenCodes.has(materialCode)) {
        throw new BadRequestException(`Dòng ${i + 2} sheet "Items": Trùng lặp Mã nguyên liệu "${materialCode}".`);
      }
      seenCodes.add(materialCode);

      let bagKg: number | null = null;
      if (bagKgStr && bagKgStr !== '' && bagKgStr !== '0') {
        const parsed = parseFloat(bagKgStr.replace(',', '.'));
        if (isNaN(parsed) || parsed < 0) {
          throw new BadRequestException(`Dòng ${i + 2} sheet "Items": Khối lượng bao (kg) không hợp lệ: "${bagKgStr}".`);
        }
        bagKg = parsed;
      }

      materials.push({
        materialCode,
        materialName,
        category,
        itemGroup: itemGroup || 'Premix',
        packingSpec,
        bagKg,
        uom,
        itemType,
      });
    }

    return materials;
  }

  private parseVendorsSheet(sheet: XLSX.WorkSheet): ParsedSupplier[] {
    const rows = this.getSheetRows(sheet);
    if (rows.length === 0) {
      throw new BadRequestException('Sheet "Vendors" không có dữ liệu.');
    }

    this.checkRequiredHeaders(rows[0], [
      { name: 'Vendor account', aliases: ['vendor account', 'mã ncc', 'ma ncc', 'suppliercode', 'vendorcode'] },
      { name: 'Vendor name', aliases: ['vendor name', 'tên ncc', 'ten ncc', 'suppliername'] },
      { name: 'Group', aliases: ['group', 'nhóm vendor', 'nhom vendor', 'vendorgroup'] },
    ]);

    const suppliers: ParsedSupplier[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const supplierCode = this.getCell(row, ['vendor account', 'mã ncc', 'ma ncc', 'suppliercode', 'vendorcode']);
      const supplierName = this.getCell(row, ['vendor name', 'tên ncc', 'ten ncc', 'suppliername']);
      const vendorGroup = this.getCell(row, ['group', 'nhóm vendor', 'nhom vendor', 'vendorgroup']).toUpperCase();
      const country = this.getCell(row, ['country', 'quốc gia', 'quoc gia']) || null;

      if (!supplierCode && !supplierName) continue;

      if (!supplierCode || !supplierName || !vendorGroup) {
        throw new BadRequestException(`Dòng ${i + 2} sheet "Vendors" thiếu thông tin bắt buộc (Mã NCC, Tên NCC hoặc Group).`);
      }

      if (seenCodes.has(supplierCode)) {
        throw new BadRequestException(`Dòng ${i + 2} sheet "Vendors": Trùng lặp Mã nhà cung cấp "${supplierCode}".`);
      }
      seenCodes.add(supplierCode);

      suppliers.push({
        supplierCode,
        supplierName,
        vendorGroup,
        country,
      });
    }

    return suppliers;
  }

  private parsePlantItemsSheet(sheet: XLSX.WorkSheet): ParsedPlantItem[] {
    const rows = this.getSheetRows(sheet);
    if (rows.length === 0) {
      throw new BadRequestException('Sheet "Plant Items" không có dữ liệu.');
    }

    this.checkRequiredHeaders(rows[0], [
      { name: 'Org code', aliases: ['org code', 'org codes', 'warehousecode', 'mã kho', 'ma kho', 'factorycode'] },
      { name: 'Item code', aliases: ['item code', 'mã nl', 'ma nl', 'materialcode'] },
    ]);

    const plantItems: ParsedPlantItem[] = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const orgCode = this.getCell(row, ['org code', 'org codes', 'warehousecode', 'mã kho', 'ma kho', 'factorycode']);
      const itemCode = this.getCell(row, ['item code', 'mã nl', 'ma nl', 'materialcode']);

      if (!orgCode && !itemCode) continue;

      if (!orgCode || !itemCode) {
        throw new BadRequestException(`Dòng ${i + 2} sheet "Plant Items" thiếu Org code hoặc Item code.`);
      }

      const pairKey = `${orgCode}#${itemCode}`;
      if (seenPairs.has(pairKey)) {
        throw new BadRequestException(`Dòng ${i + 2} sheet "Plant Items": Trùng lặp cặp (Org code: "${orgCode}", Item code: "${itemCode}").`);
      }
      seenPairs.add(pairKey);

      plantItems.push({
        orgCode,
        itemCode,
      });
    }

    return plantItems;
  }

  private parseSubstitutionsSheet(sheet: XLSX.WorkSheet): ParsedSubstitution[] {
    const rows = this.getSheetRows(sheet);
    const substitutions: ParsedSubstitution[] = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const materialCode = this.getCell(row, ['item code', 'mã nl', 'material code', 'mã nl gốc', 'materialcode']);
      const subMaterialCode = this.getCell(row, ['sub item code', 'mã nl thay thế', 'sub material code', 'submaterialcode']);
      const ratioStr = this.getCell(row, ['tỷ lệ', 'ty le', 'ratio']);
      const note = this.getCell(row, ['ghi chú', 'ghi chu', 'note']) || null;

      if (!materialCode && !subMaterialCode) continue;
      if (!materialCode || !subMaterialCode) continue;

      const pairKey = `${materialCode}#${subMaterialCode}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      let ratio: number | null = 1.0;
      if (ratioStr) {
        const parsedRatio = parseFloat(ratioStr.replace(',', '.'));
        if (!isNaN(parsedRatio) && parsedRatio > 0) {
          ratio = parsedRatio;
        }
      }

      substitutions.push({
        materialCode,
        subMaterialCode,
        ratio,
        note,
      });
    }

    return substitutions;
  }

  private parseVendorItemsSheet(sheet: XLSX.WorkSheet): ParsedVendorItem[] {
    const rows = this.getSheetRows(sheet);
    const vendorItems: ParsedVendorItem[] = [];
    const seenPairs = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const itemCode = this.getCell(row, ['item code', 'mã nl', 'materialcode']);
      const vendorAccount = this.getCell(row, ['vendor account', 'mã ncc', 'suppliercode', 'vendorcode']);

      if (!itemCode && !vendorAccount) continue;
      if (!itemCode || !vendorAccount) continue;

      const pairKey = `${itemCode}#${vendorAccount}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      vendorItems.push({
        itemCode,
        vendorAccount,
      });
    }

    return vendorItems;
  }
}
