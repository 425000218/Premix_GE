import { apiClient } from './client';
import { AuthResponse, User } from '../types';

export const authApi = {
  login: async (credentials: { username: string; password: string }): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/login', credentials);
    return res.data?.data || res.data;
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    return res.data?.data || res.data;
  },

  logout: async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  },

  changePassword: async (passwords: { currentPassword: string; newPassword: string }): Promise<void> => {
    await apiClient.post('/auth/change-password', passwords);
  },
};
