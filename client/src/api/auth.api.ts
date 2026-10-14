import { apiClient } from './client';
import { AuthResponse, User } from '../types';

export const authApi = {
  login: async (credentials: { username: string; password: string }): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/login', credentials);
    const data = res.data?.data || res.data;
    if (data && data.user) {
      return {
        ...data,
        user: {
          ...data.user,
          permissions: data.permissions || [],
        },
      };
    }
    return data;
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    const data = res.data?.data || res.data;
    if (data && data.user) {
      return {
        ...data.user,
        permissions: data.permissions || [],
        factories: data.factories || [],
      };
    }
    return data;
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
