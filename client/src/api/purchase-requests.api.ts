import { apiClient } from './client';
import { PurchaseSuggestionItem, PurchaseRequestItem, PaginatedResult, PrStatus } from '../types';

export interface CreatePrPayload {
  factoryId: number;
  materialId: number;
  supplierId?: number;
  quantityTons?: number;
  quantityKg?: number;
  needByDate?: string;
  latestOrderDate?: string;
  notes?: string;
}

export interface ChangePrStatusPayload {
  status: PrStatus;
  matchedPoNumber?: string;
  cancelReason?: string;
}

export interface PrQueryParams {
  factoryId?: number;
  materialId?: number;
  supplierId?: number;
  status?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  limit?: number | 'all';
}

function normalizeSuggestion(raw: any): PurchaseSuggestionItem {
  return {
    factoryId: String(raw.factoryId),
    factoryCode: raw.factoryCode || '',
    materialId: String(raw.materialId),
    materialCode: raw.materialCode || '',
    materialName: raw.materialName || '',
    supplierId: raw.supplierId ? String(raw.supplierId) : undefined,
    supplierName: raw.supplierName,
    doiDays: raw.doi !== null && raw.doi !== undefined ? Number(raw.doi) : 0,
    warningLevel: raw.warningLevel || 'CRITICAL',
    avgDailyDemandKg: raw.dailyUsageKg ?? raw.avgDailyDemandKg ?? 0,
    avgDailyDemandTons: raw.dailyUsageTons ?? raw.avgDailyDemandTons ?? 0,
    rawRequiredKg: raw.rawQtyKg ?? raw.rawRequiredKg ?? 0,
    rawRequiredTons: raw.rawQtyTons ?? raw.rawRequiredTons ?? 0,
    openPoKg: raw.openPoKg ?? 0,
    openPoTons: raw.openPoTons ?? 0,
    sentPrKg: raw.sentPrKg ?? 0,
    sentPrTons: raw.sentPrTons ?? 0,
    netRequiredKg: raw.netQtyKg ?? raw.netRequiredKg ?? 0,
    netRequiredTons: raw.netQtyTons ?? raw.netRequiredTons ?? 0,
    suggestedQtyKg: raw.suggestedQtyKg ?? 0,
    suggestedQtyTons: raw.suggestedQtyTons ?? 0,
    bagSizeKg: raw.bagKg ?? raw.bagSizeKg,
    leadTimeDays: raw.leadTimeDays ?? 0,
    needByDate: raw.needByDate,
    latestOrderDate: raw.suggestedOrderDate || raw.latestOrderDate,
  };
}

function normalizePr(raw: any): PurchaseRequestItem {
  return {
    id: raw.requestId ?? raw.id,
    requestCode: raw.requestCode || '',
    factoryId: String(raw.factoryId),
    factoryCode: raw.factoryCode || '',
    materialId: String(raw.materialId),
    materialCode: raw.materialCode || '',
    materialName: raw.materialName || '',
    supplierId: raw.supplierId ? String(raw.supplierId) : undefined,
    supplierName: raw.supplierName,
    quantityKg: raw.requestedQtyKg ?? raw.quantityKg ?? 0,
    quantityTons: raw.requestedQtyTons ?? raw.quantityTons ?? 0,
    needByDate: raw.needByDate,
    latestOrderDate: raw.suggestedOrderDate || raw.latestOrderDate,
    status: raw.status as PrStatus,
    matchedPoNumber: raw.poNumber || raw.matchedPoNumber,
    matchedDate: raw.matchedDate,
    cancelReason: raw.cancelReason,
    notes: raw.notes,
    createdBy: raw.createdBy || 'ADMIN',
    createdAt: raw.createdAt || '',
  };
}

export const purchaseRequestsApi = {
  getSuggestions: async (factoryId?: number): Promise<PurchaseSuggestionItem[]> => {
    const res = await apiClient.get('/purchase-requests/suggestions', {
      params: { factoryId },
    });
    const payload = res.data?.data || res.data;
    if (payload?.items && Array.isArray(payload.items)) {
      return payload.items.map(normalizeSuggestion);
    }
    if (Array.isArray(payload)) {
      return payload.map(normalizeSuggestion);
    }
    return [];
  },

  createPr: async (payload: CreatePrPayload): Promise<PurchaseRequestItem> => {
    const res = await apiClient.post('/purchase-requests', payload);
    return normalizePr(res.data?.data || res.data);
  },

  getPrs: async (params?: PrQueryParams): Promise<PaginatedResult<PurchaseRequestItem>> => {
    const res = await apiClient.get('/purchase-requests', { params });
    const payload = res.data?.data || res.data;

    if (payload?.items && Array.isArray(payload.items)) {
      return {
        items: payload.items.map(normalizePr),
        total: payload.meta?.totalItems ?? payload.items.length,
        page: payload.meta?.page ?? 1,
        limit: payload.meta?.pageSize ?? '20',
        totalPages: payload.meta?.totalPages ?? 1,
      };
    }

    if (Array.isArray(payload)) {
      return {
        items: payload.map(normalizePr),
        total: payload.length,
        page: 1,
        limit: 'all',
        totalPages: 1,
      };
    }

    return {
      items: [],
      total: 0,
      page: 1,
      limit: 'all',
      totalPages: 1,
    };
  },

  updateStatus: async (id: number, payload: ChangePrStatusPayload): Promise<PurchaseRequestItem> => {
    const res = await apiClient.patch(`/purchase-requests/${id}/status`, payload);
    return normalizePr(res.data?.data || res.data);
  },

  exportExcel: async (payload: { factoryId?: number; status?: string; ids?: number[] }): Promise<Blob> => {
    const res = await apiClient.post('/purchase-requests/export', payload, {
      responseType: 'blob',
    });
    return res.data;
  },
};
