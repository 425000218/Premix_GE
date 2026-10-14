export type WarningLevel = 'CRITICAL' | 'WARNING' | 'BALANCED' | 'OVERSTOCK' | 'NO_DEMAND';

export type DemandSource = 'ERP_FORECAST' | 'HISTORICAL_USAGE' | 'OVERRIDE';

export type PrStatus = 'SENT' | 'MATCHED' | 'EXPIRED' | 'CANCELLED';

export interface User {
  userId: number;
  username: string;
  fullName: string;
  email?: string;
  roleId?: number;
  roleCode: string;
  roleName: string;
  factoryScope: 'ALL' | 'ASSIGNED';
  assignedFactories?: string[];
  permissions: string[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number | 'all';
  totalPages: number;
}

// Positions (F04a)
export interface PositionItem {
  factoryId: string;
  factoryCode: string;
  factoryName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  categoryName?: string;
  effectiveStockKg: number;
  effectiveStockTons: number;
  physicalStockKg?: number;
  blockedStockKg?: number;
  openPoKg?: number;
  avgDailyDemandKg: number;
  avgDailyDemandTons: number;
  monthlyDemandKg?: number;
  monthlyDemandTons?: number;
  demandSource: DemandSource;
  doiDays: number;
  warningLevel: WarningLevel;
  stockoutDate?: string | null;
  minDoiDays?: number;
  maxDoiDays?: number;
  lastCutoffDate?: string;
}

export interface PositionDetailLot {
  lotNumber: string;
  quantityKg: number;
  quantityTons: number;
  expireDate?: string;
  isBlocked: boolean;
  blockReason?: string;
}

export interface PositionDetailPo {
  poNumber: string;
  supplierName: string;
  orderDate: string;
  etdDate?: string;
  etaDate?: string;
  orderedQtyKg: number;
  deliveredQtyKg: number;
  remainQtyKg: number;
  remainQtyTons: number;
  status: string;
}

export interface DemandOverrideRecord {
  overrideId: number;
  factoryId: number;
  factoryCode?: string;
  materialId: number;
  materialCode?: string;
  materialName?: string;
  periodMonth: string;
  effectiveDate: string;
  overrideKg: number | null;
  overrideTons: number | null;
  isRemoval: boolean;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface FlagsSummaryResponse {
  totalPairs: number;
  flagCounts: Record<string, number>;
  pairs: Array<{
    factoryId: number;
    factoryCode: string;
    factoryName: string;
    materialId: number;
    materialCode: string;
    materialName: string;
    doi: number | null;
    warningLevel: WarningLevel;
    flagCodes: string[];
    flags: Array<{
      code: string;
      level: string;
      description: string;
    }>;
  }>;
}

export interface ProjectionMilestones {
  tier1StockoutDate: string | null;
  tier1DeliveryRequiredDate: string | null;
  tier1OrderDeadline: string | null;
  tier2StockoutDate: string | null;
  tier2DeliveryRequiredDate: string | null;
  tier2OrderDeadline: string | null;
}

export interface DayTierMetric {
  inboundKg: number;
  inboundTons: number;
  closingStockKg: number;
  closingStockTons: number;
  doi: number | null;
  warningLevel: WarningLevel;
}

export interface ProjectionDay {
  dayIndex: number;
  date: string;
  dayOfWeek: number;
  dayName: string;
  isSunday: boolean;
  dailyDemandKg: number;
  tier1: DayTierMetric;
  tier2: DayTierMetric;
}

export interface DeliverySuggestionItem {
  suggestionIndex: number;
  suggestDate: string;
  dayIndex: number;
  suggestQtyKg: number;
  suggestQtyTons: number;
  poNumber: string;
  supplierId?: number;
  supplierName?: string;
  reason: string;
  isLateWarning?: boolean;
}

export interface ProjectionEngineResult {
  factoryId: number;
  factoryCode: string;
  factoryName: string;
  materialId: number;
  materialCode: string;
  materialName: string;
  snapshotDate: string;
  initialStockKg: number;
  initialStockTons: number;
  stdDailyKg: number;
  safetyDays: number;
  safetyStockKg: number;
  unitShipmentKg: number;
  milestones: ProjectionMilestones;
  suggestions: DeliverySuggestionItem[];
  timeline: ProjectionDay[];
}

export interface PositionDetail {
  position: PositionItem;
  lots: PositionDetailLot[];
  openPos: PositionDetailPo[];
  recentUsages: Array<{ date: string; usageKg: number; usageTons: number }>;
  demandOverrideHistory?: DemandOverrideRecord[];
}

// Dashboard (F05)
export interface DashboardSummary {
  cutoffDate: string;
  totalPhysicalStockKg: number;
  totalPhysicalStockTons: number;
  totalEffectiveStockKg: number;
  totalEffectiveStockTons: number;
  totalBlockedStockKg: number;
  totalBlockedStockTons: number;
  totalOpenPoKg: number;
  totalOpenPoTons: number;
  criticalPairsCount: number;
  warningPairsCount: number;
  balancedPairsCount: number;
  overstockPairsCount: number;
  noDemandPairsCount: number;
  totalPairsCount: number;
}

export interface MillMatrixCell {
  factoryId: string;
  factoryCode: string;
  effectiveStockTons: number;
  doiDays: number;
  warningLevel: WarningLevel;
  avgDailyDemandTons: number;
}

export interface MatrixRow {
  materialId: string;
  materialCode: string;
  materialName: string;
  categoryName?: string;
  mills: Record<string, MillMatrixCell>;
}

export interface DashboardMatrixData {
  factories: Array<{ id: string; code: string; name: string }>;
  matrix: MatrixRow[];
}

// Delivery Plan (F07)
export interface DayPlanDetail {
  planDate: string;
  dayOfWeek: number; // 2=Monday .. 8=Sunday
  planQtyKg: number;
  planQtyTons: number;
  receivedQtyKg: number;
  receivedQtyTons: number;
  varianceKg: number;
  varianceTons: number;
  porList: Array<{ porNumber: string; qtyKg: number; qtyTons: number; receiptDate: string }>;
}

export interface DeliveryPlanRow {
  rowId: string;
  factoryId: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  supplierId?: string;
  supplierName?: string;
  poNumber?: string;
  hasOverPoWarning?: boolean;
  overPoMessage?: string;
  days: Record<string, DayPlanDetail>; // Keyed by YYYY-MM-DD
  totalPlanTons: number;
  totalReceivedTons: number;
  totalVarianceTons: number;
}

export interface PoOption {
  poNumber: string;
  supplierId: string;
  supplierName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  deliverRemainderKg: number;
  deliverRemainderTons: number;
  etaDate?: string;
}

// Purchase Requests (F08)
export interface PurchaseSuggestionItem {
  factoryId: string;
  factoryCode: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  supplierId?: string;
  supplierName?: string;
  doiDays: number;
  warningLevel: WarningLevel;
  avgDailyDemandKg: number;
  avgDailyDemandTons: number;
  rawRequiredKg: number;
  rawRequiredTons: number;
  openPoKg: number;
  openPoTons: number;
  sentPrKg: number;
  sentPrTons: number;
  netRequiredKg: number;
  netRequiredTons: number;
  suggestedQtyKg: number;
  suggestedQtyTons: number;
  bagSizeKg?: number;
  leadTimeDays: number;
  needByDate?: string;
  latestOrderDate?: string;
}

export interface PurchaseRequestItem {
  id: number;
  requestCode: string;
  factoryId: string;
  factoryCode: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  supplierId?: string;
  supplierName?: string;
  quantityKg: number;
  quantityTons: number;
  needByDate?: string;
  latestOrderDate?: string;
  status: PrStatus;
  matchedPoNumber?: string;
  matchedDate?: string;
  cancelReason?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

// Blocked Stock (F06)
export interface BlockedItem {
  blockId: number;
  factoryId: string;
  factoryCode: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  lotNumber: string;
  blockedKg: number;
  blockedTons: number;
  reason: string;
  isReleased: boolean;
  blockedBy: string;
  blockedAt: string;
  releasedBy?: string;
  releasedAt?: string;
}

// Master Data Catalog (F02a)
export interface Factory {
  factoryId: string;
  factoryCode: string;
  factoryName: string;
  address?: string;
  isActive: boolean;
}

export interface Material {
  materialId: string;
  materialCode: string;
  materialName: string;
  category?: string;
  uom: string;
  bagSizeKg?: number;
  isActive: boolean;
}

export interface Supplier {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  contactPerson?: string;
  phone?: string;
  isActive: boolean;
}

export interface ThresholdItem {
  factoryId: string;
  factoryCode: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  minDoiDays: number;
  maxDoiDays: number;
  safetyStockKg?: number;
}

// Import (F03)
export interface ImportHistoryItem {
  id: number;
  importType: string;
  fileName: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  recordsProcessed: number;
  errorMessage?: string;
  createdBy: string;
  createdAt: string;
}

// Roles & Permissions (F01c)
export interface RoleItem {
  roleCode: string;
  roleName: string;
  description: string | null;
  factoryScope: 'ALL' | 'ASSIGNED';
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  permissionCount: number;
}

export interface PermissionCatalogItem {
  permissionCode: string;
  permissionName: string;
  moduleCode: string;
  moduleName: string;
  description: string;
  sortOrder: number;
}

export interface CreateRolePayload {
  roleCode: string;
  roleName: string;
  description?: string;
  factoryScope: 'ALL' | 'ASSIGNED';
  permissionCodes?: string[];
}

export interface UpdateRolePayload {
  roleName: string;
  description?: string;
  factoryScope: 'ALL' | 'ASSIGNED';
}
