import api from './api';
import type { ApiResponse, Authorization, PaginatedData } from '../types';

export interface AuthorizationQuery {
  page?: number;
  pageSize?: number;
  user_id?: number;
  asset_id?: number;
  status?: 'active' | 'expired' | 'pending' | '';
  protocol?: string;
  search?: string;
}

export interface AuthorizationStats {
  total: number;
  active: number;
  expired: number;
  pending: number;
}

export const authorizationService = {
  getList(params: AuthorizationQuery = {}): Promise<ApiResponse<PaginatedData<Authorization>>> {
    return api.get('/authorizations', { params }).then((r) => r.data);
  },

  getStats(): Promise<ApiResponse<AuthorizationStats>> {
    return api.get('/authorizations/stats').then((r) => r.data);
  },

  create(data: { user_id: number; asset_id: number; start_time?: string; end_time?: string }): Promise<ApiResponse<any>> {
    return api.post('/authorizations', data).then((r) => r.data);
  },

  update(id: number, data: { start_time?: string | null; end_time?: string | null }): Promise<ApiResponse<any>> {
    return api.put(`/authorizations/${id}`, data).then((r) => r.data);
  },

  remove(id: number): Promise<ApiResponse<any>> {
    return api.delete(`/authorizations/${id}`).then((r) => r.data);
  },

  batchCreate(data: {
    user_id: number;
    asset_ids: number[];
    start_time?: string;
    end_time?: string;
  }): Promise<ApiResponse<{ created: number; skipped: number; ids: number[] }>> {
    return api.post('/authorizations/batch', data).then((r) => r.data);
  },

  getPairs(): Promise<ApiResponse<{ user_id: number; asset_id: number }[]>> {
    return api.get('/authorizations/pairs').then((r) => r.data);
  },
};
