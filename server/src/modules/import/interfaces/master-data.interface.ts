export interface ParsedPlant {
  factoryCode: string;
  warehouseCode: string;
  factoryName: string;
  region: string;
  plantType: string;
}

export interface ParsedMaterial {
  materialCode: string;
  materialName: string;
  category: string;
  itemGroup: string;
  packingSpec?: string | null;
  bagKg?: number | null;
  uom: string;
  itemType?: string | null;
}

export interface ParsedSupplier {
  supplierCode: string;
  supplierName: string;
  vendorGroup: string;
  country?: string | null;
}

export interface ParsedPlantItem {
  orgCode: string;
  itemCode: string;
}

export interface ParsedSubstitution {
  materialCode: string;
  subMaterialCode: string;
  ratio?: number | null;
  note?: string | null;
}

export interface ParsedVendorItem {
  itemCode: string;
  vendorAccount: string;
}

export interface ParsedMasterData {
  plants: ParsedPlant[];
  materials: ParsedMaterial[];
  suppliers: ParsedSupplier[];
  plantItems: ParsedPlantItem[];
  substitutions: ParsedSubstitution[];
  vendorItems: ParsedVendorItem[];
}

export interface ParsedOnHandRow {
  orgCode: string;
  subInv: string;
  itemCode: string;
  sohQtyKg: number;
}

export interface ParsedMovementRow {
  orgCode: string;
  itemCode: string;
  beginOnhandKg: number;
  qtyReceiveKg: number;
  wipIssueKg: number;
  transferInKg: number;
  transferOutKg: number;
  adjustKg: number;
  closedOnhandKg: number;
}

export interface ParsedPoPendingRow {
  orgCode: string;
  vendorAccount: string;
  vendorName?: string | null;
  vendorGroup?: string | null;
  poNumber: string;
  itemCode: string;
  unit: string;
  orderQtyKg: number;
  receivedQtyKg: number;
  deliverRemainderKg: number;
  deliveryDate: string;
  docType: string;
  lineStatus?: string | null;
}

export interface ParsedPoReceiptRow {
  orgCode: string;
  vendorAccount: string;
  poNumber?: string | null;
  receiptNumber: string;
  deliveryDate: string;
  itemCode: string;
  unit: string;
  receivedQtyKg: number;
  pagNumber?: string | null;
  truckNumber?: string | null;
}

export interface ParsedTransferRow {
  transferNumber: string;
  itemCode: string;
  fromWarehouse: string;
  toWarehouse: string;
  transferStatus: string;
  shippedDate?: string | null;
  receivedDate?: string | null;
  shippedQtyKg: number;
  postedQtyKg: number;
}

export interface ParsedForecastCell {
  orgCode: string;
  itemCode: string;
  forecastKg: number;
}

export interface ParsedForecastData {
  periodMonth: string;
  versionDate: string;
  cells: ParsedForecastCell[];
}
