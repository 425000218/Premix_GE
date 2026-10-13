import { apiClient } from './client';
import { Factory, Material, Supplier, ThresholdItem, PaginatedResult } from '../types';

export interface DropdownsData {
  factories: Array<{ factoryId: number; factoryCode: string; factoryName: string; shortName: string }>;
  materials: Array<{ materialId: number; materialCode: string; materialName: string; category: string; bagSizeKg: number }>;
  suppliers: Array<{ supplierId: number; supplierCode: string; supplierName: string }>;
}

export const catalogApi = {
  getDropdowns: async (): Promise<DropdownsData> => {
    const res = await apiClient.get('/catalog/dropdowns');
    return res.data?.data || res.data;
  },

  getFactories: async (params?: any): Promise<PaginatedResult<Factory>> => {
    const res = await apiClient.get('/catalog/factories', { params });
    const raw = res.data;
    return {
      items: raw.data || raw.items || [],
      total: raw.meta?.total || raw.total || (raw.data?.length ?? 0),
      page: raw.meta?.page || 1,
      limit: raw.meta?.limit || '20',
      totalPages: raw.meta?.totalPages || 1,
    };
  },

  getMaterials: async (params?: any): Promise<PaginatedResult<Material>> => {
    const res = await apiClient.get('/catalog/materials', { params });
    const raw = res.data;
    return {
      items: raw.data || raw.items || [],
      total: raw.meta?.total || raw.total || (raw.data?.length ?? 0),
      page: raw.meta?.page || 1,
      limit: raw.meta?.limit || '20',
      totalPages: raw.meta?.totalPages || 1,
    };
  },

  getSuppliers: async (params?: any): Promise<PaginatedResult<Supplier>> => {
    const res = await apiClient.get('/catalog/suppliers', { params });
    const raw = res.data;
    return {
      items: raw.data || raw.items || [],
      total: raw.meta?.total || raw.total || (raw.data?.length ?? 0),
      page: raw.meta?.page || 1,
      limit: raw.meta?.limit || '20',
      totalPages: raw.meta?.totalPages || 1,
    };
  },

  getThresholds: async (params?: any): Promise<PaginatedResult<ThresholdItem>> => {
    const res = await apiClient.get('/catalog/thresholds', { params });
    const raw = res.data;
    return {
      items: raw.data || raw.items || [],
      total: raw.meta?.total || raw.total || (raw.data?.length ?? 0),
      page: raw.meta?.page || 1,
      limit: raw.meta?.limit || '20',
      totalPages: raw.meta?.totalPages || 1,
    };
  },
};
