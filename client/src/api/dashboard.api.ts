import { apiClient } from './client';
import { DashboardSummary, DashboardMatrixData } from '../types';

export const dashboardApi = {
  getSummary: async (factoryId?: string): Promise<DashboardSummary> => {
    const res = await apiClient.get('/dashboard/summary', { params: { factoryId } });
    return res.data?.data || res.data;
  },

  getMatrix: async (category?: string): Promise<DashboardMatrixData> => {
    const res = await apiClient.get('/dashboard/matrix', { params: { category } });
    return res.data?.data || res.data;
  },
};
