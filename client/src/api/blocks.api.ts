import { apiClient } from './client';
import { BlockedItem, PaginatedResult } from '../types';

export interface CreateBlockPayload {
  factoryId: number;
  materialId: number;
  blockedKg: number;
  startDate?: string;
  reason: string;
}

export interface BlockQueryParams {
  page?: number;
  pageSize?: string;
  search?: string;
  factoryId?: number;
  materialId?: number;
  status?: 'ACTIVE' | 'RELEASED' | 'ALL';
  sortBy?: 'CreatedAt' | 'BlockedKg' | 'StartDate';
  sortOrder?: 'ASC' | 'DESC';
}

export const blocksApi = {
  getBlocks: async (params?: BlockQueryParams): Promise<PaginatedResult<BlockedItem>> => {
    const res = await apiClient.get('/blocks', { params });
    const raw = res.data?.data || res.data;
    if (Array.isArray(raw)) {
      return {
        items: raw,
        total: raw.length,
        page: 1,
        limit: 'all',
        totalPages: 1,
      };
    }
    return raw;
  },

  createBlock: async (payload: CreateBlockPayload): Promise<BlockedItem> => {
    const res = await apiClient.post('/blocks', payload);
    return res.data?.data || res.data;
  },

  releaseBlock: async (id: number, endDate?: string): Promise<any> => {
    const res = await apiClient.post(`/blocks/${id}/release`, { endDate });
    return res.data?.data || res.data;
  },
};
