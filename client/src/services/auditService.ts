import api from './api';
import type { ApiResponse, AuditLog, PaginatedData } from '../types';

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  userId?: number;
  username?: string;
  action?: string;
  targetType?: string;
  startDate?: string;
  endDate?: string;
}

export interface CommandLogEntry {
  id: number;
  session_id: number;
  timestamp: string;
  command: string;
  is_dangerous: number | boolean;
  is_blocked: number | boolean;
  risk_level: string | null;
  protocol?: string;
  username?: string;
  asset_name?: string;
  asset_host?: string;
}

export interface AuditStats {
  todayCount: number;
  connectCount: number;
  dangerousCount: number;
  blockedCount: number;
  actionDistribution: { action: string; count: number }[];
  dailyCounts: { date: string; count: number }[];
  topUsers: { username: string; count: number }[];
}

export const auditService = {
  getList(params: AuditQuery = {}): Promise<ApiResponse<PaginatedData<AuditLog>>> {
    return api.get('/audit', { params }).then((r) => r.data);
  },

  getCommands(params: AuditQuery & { isDangerous?: boolean } = {}): Promise<ApiResponse<PaginatedData<CommandLogEntry>>> {
    return api.get('/audit/commands', { params }).then((r) => r.data);
  },

  getStats(): Promise<ApiResponse<AuditStats>> {
    return api.get('/audit/stats').then((r) => r.data);
  },

  async exportCsv(params: AuditQuery = {}): Promise<void> {
    const response = await api.get('/audit/export', {
      params,
      responseType: 'blob',
    });
    const blob = new Blob(['\uFEFF', response.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  },
};
