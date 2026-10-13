import { apiClient } from './client';
import { PoOption } from '../types';

export interface PlanItemPayload {
  planDate: string;
  materialId: number;
  supplierId: number;
  poNumber?: string;
  planQtyTons?: number;
  planQtyKg?: number;
  note?: string;
}

export interface SaveWeekPlanPayload {
  weekStartDate: string;
  factoryId: number;
  plans: PlanItemPayload[];
}

export const deliveryPlansApi = {
  getWeekPlan: async (weekStartDate: string, factoryId?: number, materialId?: number) => {
    const res = await apiClient.get('/delivery-plans/week', {
      params: { weekStartDate, factoryId, materialId },
    });
    return res.data?.data || res.data;
  },

  saveWeekPlan: async (payload: SaveWeekPlanPayload) => {
    const res = await apiClient.post('/delivery-plans/week', payload);
    return res.data?.data || res.data;
  },

  getPoOptions: async (factoryId: number, materialId: number, supplierId?: number): Promise<PoOption[]> => {
    const res = await apiClient.get('/delivery-plans/po-options', {
      params: { factoryId, materialId, supplierId },
    });
    return res.data?.data || res.data;
  },

  getSuggestions: async (weekStartDate: string, factoryId: number, materialId?: number) => {
    const res = await apiClient.post('/delivery-plans/suggest', {
      weekStartDate,
      factoryId,
      materialId,
    });
    return res.data?.data || res.data;
  },
};
