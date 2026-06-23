import api from './api';
import type { ApiResponse, SafeUser, PaginatedData } from '../types';

export interface UserQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
  status?: string;
}

export const userService = {
  getList(params: UserQuery = {}): Promise<ApiResponse<PaginatedData<SafeUser>>> {
    return api.get('/users', { params }).then(r => r.data);
  },

  create(data: { username: string; password: string; role: string; email?: string; phone?: string }): Promise<ApiResponse<any>> {
    return api.post('/users', data).then(r => r.data);
  },

  update(id: number, data: any): Promise<ApiResponse<any>> {
    return api.put(`/users/${id}`, data).then(r => r.data);
  },

  remove(id: number): Promise<ApiResponse<any>> {
    return api.delete(`/users/${id}`).then(r => r.data);
  },
};
