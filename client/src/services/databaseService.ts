import api from './api';
import type { ApiResponse } from '../types';

export interface DbObjects {
  tables: string[];
  views: string[];
  procedures: string[];
}

export interface DbQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  affectedRows?: number;
}

export interface DbTableInfo {
  columns: {
    name: string;
    type: string;
    nullable: string;
    default_val: string | null;
    key_type?: string;
  }[];
  ddl: string;
}

export interface QueryHistoryItem {
  id: number;
  asset_id: number;
  query_text: string;
  status: 'success' | 'error';
  row_count: number | null;
  duration_ms: number | null;
  error_message: string | null;
  executed_at: string;
}

export interface SavedQueryItem {
  id: number;
  asset_id: number | null;
  name: string;
  query_text: string;
  created_at: string;
}

export interface DbSession {
  id: number;
  user: string;
  host: string;
  database: string;
  command: string;
  time: number;
  state: string;
  query: string;
}

export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
  rowCount: number;
}

export const databaseService = {
  execute(assetId: number, sql: string, database?: string): Promise<ApiResponse<DbQueryResult>> {
    return api.post(`/database/${assetId}/execute`, { sql, database }).then((r) => r.data);
  },

  testConnection(assetId: number): Promise<ApiResponse<{ success: boolean; message: string }>> {
    return api.post(`/database/${assetId}/test`).then((r) => r.data);
  },

  listDatabases(assetId: number): Promise<ApiResponse<string[]>> {
    return api.get(`/database/${assetId}/databases`).then((r) => r.data);
  },

  getObjects(assetId: number, database?: string): Promise<ApiResponse<DbObjects>> {
    const p = database ? `?database=${encodeURIComponent(database)}` : '';
    return api.get(`/database/${assetId}/objects${p}`).then((r) => r.data);
  },

  getTableInfo(assetId: number, table: string): Promise<ApiResponse<DbTableInfo>> {
    return api.get(`/database/${assetId}/table/${encodeURIComponent(table)}`).then((r) => r.data);
  },

  getHistory(): Promise<ApiResponse<QueryHistoryItem[]>> {
    return api.get('/database/history').then((r) => r.data);
  },

  getSavedQueries(): Promise<ApiResponse<SavedQueryItem[]>> {
    return api.get('/database/saved-queries').then((r) => r.data);
  },

  saveQuery(data: { name: string; query_text: string; asset_id?: number }): Promise<ApiResponse<null>> {
    return api.post('/database/saved-queries', data).then((r) => r.data);
  },

  deleteSavedQuery(id: number): Promise<ApiResponse<null>> {
    return api.delete(`/database/saved-queries/${id}`).then((r) => r.data);
  },

  getSessions(assetId: number): Promise<ApiResponse<DbSession[]>> {
    return api.get(`/database/${assetId}/sessions`).then((r) => r.data);
  },

  killSession(assetId: number, sessionId: number): Promise<ApiResponse<null>> {
    return api.delete(`/database/${assetId}/sessions/${sessionId}`).then((r) => r.data);
  },

  exportTable(
    assetId: number,
    data: { table: string; format: 'csv' | 'sql'; limit?: number }
  ): Promise<ApiResponse<ExportResult>> {
    return api.post(`/database/${assetId}/export`, data).then((r) => r.data);
  },

  importData(
    assetId: number,
    data: { table: string; format: 'csv' | 'sql'; content: string }
  ): Promise<ApiResponse<{ affectedRows: number }>> {
    return api.post(`/database/${assetId}/import`, data).then((r) => r.data);
  },
};
