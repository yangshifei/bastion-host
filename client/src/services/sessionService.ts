import api from './api';
import type { ApiResponse, Session, PaginatedData, ActiveSessionInfo } from '../types';

export const sessionService = {
  getList(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    hasRecording?: boolean;
  } = {}): Promise<ApiResponse<PaginatedData<Session>>> {
    const query = { ...params };
    if (query.hasRecording) {
      (query as any).hasRecording = '1';
      delete (query as any).status;
    }
    return api.get('/sessions', { params: query }).then((r) => r.data);
  },

  getActive(): Promise<ApiResponse<ActiveSessionInfo[]>> {
    return api.get('/sessions/active').then((r) => r.data);
  },

  terminate(id: number): Promise<ApiResponse<any>> {
    return api.post(`/sessions/${id}/terminate`).then((r) => r.data);
  },

  terminateAll(excludeSelf = true): Promise<ApiResponse<{ terminated: number }>> {
    return api.post('/sessions/terminate-all', { excludeSelf }).then((r) => r.data);
  },

  getRecording(id: number): Promise<string> {
    return api.get(`/sessions/${id}/recording`, { responseType: 'text' }).then((r) => r.data);
  },

  getById(id: number): Promise<ApiResponse<Session>> {
    return api.get(`/sessions/${id}`).then((r) => r.data);
  },

  getRecordingUrl(id: number): string {
    return `/api/sessions/${id}/recording`;
  },
};
