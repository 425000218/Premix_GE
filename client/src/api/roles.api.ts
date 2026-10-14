import { apiClient } from './client';
import {
  CreateRolePayload,
  PermissionCatalogItem,
  RoleItem,
  UpdateRolePayload,
} from '../types';

export const rolesApi = {
  /**
   * Lấy danh sách toàn bộ vai trò
   */
  async getRoles(): Promise<RoleItem[]> {
    const res = await apiClient.get<any>('/roles');
    return res.data?.data || [];
  },

  /**
   * Lấy danh mục 27 mã quyền chuẩn gom nhóm
   */
  async getPermissionsCatalog(): Promise<PermissionCatalogItem[]> {
    const res = await apiClient.get<any>('/roles/permissions');
    return res.data?.data || [];
  },

  /**
   * Lấy chi tiết vai trò và danh sách quyền
   */
  async getRoleByCode(code: string): Promise<{
    role: RoleItem;
    permissions: string[];
  }> {
    const res = await apiClient.get<any>(`/roles/${code}`);
    return res.data?.data || { role: null, permissions: [] };
  },

  /**
   * Tạo vai trò mới
   */
  async createRole(payload: CreateRolePayload): Promise<any> {
    const res = await apiClient.post<any>('/roles', payload);
    return res.data?.data;
  },

  /**
   * Cập nhật thông tin vai trò
   */
  async updateRole(code: string, payload: UpdateRolePayload): Promise<any> {
    const res = await apiClient.put<any>(`/roles/${code}`, payload);
    return res.data?.data;
  },

  /**
   * Xóa vai trò tùy biến
   */
  async deleteRole(code: string): Promise<any> {
    const res = await apiClient.delete<any>(`/roles/${code}`);
    return res.data;
  },

  /**
   * Cập nhật ma trận 27 mã quyền cho vai trò
   */
  async setRolePermissions(code: string, permissionCodes: string[]): Promise<any> {
    const res = await apiClient.put<any>(`/roles/${code}/permissions`, {
      permissionCodes,
    });
    return res.data?.data || res.data;
  },
};
