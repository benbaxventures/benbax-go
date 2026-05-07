import { create } from 'zustand';
import { apiRequest } from '../services/api';

type AdminUser = {
  id: string;
  name: string;
  phone: string;
  role: string;
};

type AdminSession = {
  user: AdminUser | null;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
};

export const useAdminSession = create<AdminSession>((set) => ({
  user: localStorage.getItem('benbax.admin.user')
    ? JSON.parse(localStorage.getItem('benbax.admin.user') as string)
    : null,
  async login(phone, password) {
    const data = await apiRequest<{ user: AdminUser; tokens: { accessToken: string; refreshToken: string } }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ phone, password })
      }
    );
    localStorage.setItem('benbax.admin.accessToken', data.tokens.accessToken);
    localStorage.setItem('benbax.admin.refreshToken', data.tokens.refreshToken);
    localStorage.setItem('benbax.admin.user', JSON.stringify(data.user));
    set({ user: data.user });
  },
  logout() {
    localStorage.removeItem('benbax.admin.accessToken');
    localStorage.removeItem('benbax.admin.refreshToken');
    localStorage.removeItem('benbax.admin.user');
    set({ user: null });
  }
}));
