import { apiClient } from './client';
import { PositionItem, PositionDetail, PaginatedResult } from '../types';

export interface PositionQueryParams {
  factoryId?: string;
  materialId?: string;
  warningLevel?: string;
  search?: string;
  page?: number;
  limit?: number | 'all';
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

function normalizePosition(raw: any): PositionItem {
  const effectiveStockKg = raw.availableKg ?? raw.sohKg ?? raw.effectiveStockKg ?? 0;
  const avgDailyDemandKg = raw.dailyKg ?? raw.avgDailyDemandKg ?? 0;
  const doiDays = raw.doi !== null && raw.doi !== undefined ? Number(raw.doi) : (raw.doiDays ?? null);

  return {
    factoryId: String(raw.factoryId),
    factoryCode: raw.factoryCode || '',
    factoryName: raw.factoryName || '',
    materialId: String(raw.materialId),
    materialCode: raw.materialCode || '',
    materialName: raw.materialName || '',
    categoryName: raw.category || raw.categoryName || '',
    effectiveStockKg,
    effectiveStockTons: raw.effectiveStockTons ?? effectiveStockKg / 1000,
    physicalStockKg: raw.sohKg ?? raw.physicalStockKg ?? 0,
    blockedStockKg: raw.blockedKg ?? raw.blockedStockKg ?? 0,
    openPoKg: raw.poPendingKg ?? raw.openPoKg ?? 0,
    avgDailyDemandKg,
    avgDailyDemandTons: raw.avgDailyDemandTons ?? avgDailyDemandKg / 1000,
    monthlyDemandKg: raw.demandMonthKg ?? raw.monthlyDemandKg ?? 0,
    monthlyDemandTons: (raw.demandMonthKg ?? raw.monthlyDemandKg ?? 0) / 1000,
    demandSource: raw.demandSource || 'NONE',
    doiDays: doiDays ?? 0,
    warningLevel: raw.warningLevel || 'NO_DEMAND',
    stockoutDate: raw.stockoutDate || null,
    minDoiDays: raw.effectiveThresholds?.criticalDays ?? 7,
    maxDoiDays: raw.effectiveThresholds?.overstockDays ?? 75,
    lastCutoffDate: raw.snapshotDate || raw.lastCutoffDate,
  };
}

export const positionsApi = {
  getPositions: async (params?: PositionQueryParams): Promise<PaginatedResult<PositionItem>> => {
    const res = await apiClient.get('/positions', { params });
    const payload = res.data?.data || res.data;

    if (payload?.items && Array.isArray(payload.items)) {
      return {
        items: payload.items.map(normalizePosition),
        total: payload.meta?.totalItems ?? payload.items.length,
        page: payload.meta?.page ?? 1,
        limit: payload.meta?.pageSize ?? '20',
        totalPages: payload.meta?.totalPages ?? 1,
      };
    }

    if (Array.isArray(payload)) {
      return {
        items: payload.map(normalizePosition),
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

  getPositionDetail: async (factoryId: string, materialId: string): Promise<PositionDetail> => {
    const res = await apiClient.get(`/positions/${factoryId}/${materialId}`);
    return res.data?.data || res.data;
  },

  createOverride: async (
    factoryId: string | number,
    materialId: string | number,
    data: {
      overrideKg?: number;
      overrideTons?: number;
      reason: string;
      periodMonth?: string;
      effectiveDate?: string;
    }
  ) => {
    const res = await apiClient.post(
      `/positions/${factoryId}/${materialId}/override`,
      data
    );
    return res.data?.data || res.data;
  },

  removeOverride: async (
    factoryId: string | number,
    materialId: string | number,
    reason?: string
  ) => {
    const res = await apiClient.delete(
      `/positions/${factoryId}/${materialId}/override`,
      { data: { reason } }
    );
    return res.data?.data || res.data;
  },

  getOverrideHistory: async (
    factoryId: string | number,
    materialId: string | number
  ) => {
    const res = await apiClient.get(
      `/positions/${factoryId}/${materialId}/override-history`
    );
    return res.data?.data || res.data;
  },

  getFlagsSummary: async (params?: {
    flagCode?: string;
    factoryId?: number;
    snapshotDate?: string;
  }) => {
    const res = await apiClient.get('/positions/flags', { params });
    return res.data?.data || res.data;
  },

  getProjection: async (
    factoryId: string | number,
    materialId: string | number,
    snapshotDate?: string
  ) => {
    const res = await apiClient.get(
      `/positions/${factoryId}/${materialId}/projection`,
      { params: { snapshotDate } }
    );
    return res.data?.data || res.data;
  },
};
