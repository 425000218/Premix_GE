import { apiClient } from './client';
import { ImportHistoryItem, PaginatedResult } from '../types';

export const importApi = {
  importMasterData: async (file: File, dryRun: boolean = false) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/import/master-data', formData, {
      params: { dryRun },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data || res.data;
  },

  importDailySet: async (files: {
    onHand: File;
    movement: File;
    poPending: File;
    poReceipt: File;
    transfer: File;
  }, snapshotDate?: string, dryRun: boolean = false) => {
    const formData = new FormData();
    formData.append('onHand', files.onHand);
    formData.append('movement', files.movement);
    formData.append('poPending', files.poPending);
    formData.append('poReceipt', files.poReceipt);
    formData.append('transfer', files.transfer);

    const endpoint = dryRun ? '/import/preview/daily-set' : '/import/execute/daily-set';
    const res = await apiClient.post(endpoint, formData, {
      params: { snapshotDate },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data || res.data;
  },

  importForecast: async (file: File, params: { year: number; month: number; versionDate?: string; dryRun?: boolean }) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await apiClient.post('/import/forecast', formData, {
      params,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.data || res.data;
  },

  getHistory: async (params?: any): Promise<PaginatedResult<ImportHistoryItem>> => {
    const res = await apiClient.get('/import/history', { params });
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
