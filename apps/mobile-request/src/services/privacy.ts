import { apiRequest } from './api';

export type ExportedUserData = Record<string, unknown>;

export async function deleteAccount() {
  return apiRequest<{ message: string }>('/users/me', { method: 'DELETE' });
}

export async function exportMyData() {
  return apiRequest<ExportedUserData>('/users/me/data');
}
