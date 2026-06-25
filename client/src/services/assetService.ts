import api from './api';
import type { ApiResponse, SafeAsset, PaginatedData } from '../types';

export interface AssetQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  protocol?: string;
  group?: string;
  status?: string;
}

export const assetService = {
  getList(params: AssetQuery = {}): Promise<ApiResponse<PaginatedData<SafeAsset>>> {
    return api.get('/assets', { params }).then(r => r.data);
  },

  getStats(): Promise<ApiResponse<{ total: number; ssh: number; rdp: number; online: number; offline: number }>> {
    return api.get('/assets/stats').then(r => r.data);
  },

  getGroups(): Promise<ApiResponse<string[]>> {
    return api.get('/assets/groups').then(r => r.data);
  },

  getById(id: number): Promise<ApiResponse<SafeAsset>> {
    return api.get(`/assets/${id}`).then(r => r.data);
  },

  create(data: any): Promise<ApiResponse<any>> {
    return api.post('/assets', data).then(r => r.data);
  },

  update(id: number, data: any): Promise<ApiResponse<any>> {
    return api.put(`/assets/${id}`, data).then(r => r.data);
  },

  setRecordingEnabled(id: number, enabled: boolean): Promise<ApiResponse<{ recording_enabled: boolean }>> {
    return api.patch(`/assets/${id}/recording`, { recording_enabled: enabled }).then(r => r.data);
  },

  remove(id: number): Promise<ApiResponse<any>> {
    return api.delete(`/assets/${id}`).then(r => r.data);
  },

  testConnection(id: number): Promise<ApiResponse<{ success: boolean; latencyMs: number; error?: string }>> {
    return api.post(`/assets/${id}/test`).then(r => r.data);
  },

  importCsv(file: File): Promise<ApiResponse<{ imported: number; skipped: number; total: number; errors: string[] }>> {
    const form = new FormData();
    form.append('file', file);
    return api.post('/assets/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
};
