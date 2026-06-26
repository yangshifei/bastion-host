import api from './api';
import type { ApiResponse } from '../types';

export interface PasswordPolicy {
  min_length: number;
  require_upper: boolean;
  require_lower: boolean;
  require_digit: boolean;
  require_special: boolean;
  expire_days: number;
  history_count: number;
  force_change_on_create: boolean;
  captcha_threshold: number;
  lockout_threshold: number;
  lockout_minutes: number;
  require_mfa: boolean;
}

export interface IpWhitelistEntry {
  id: number;
  network: string;
  mask: number;
  description: string | null;
  enabled: boolean;
}

export interface LoginNotification {
  id: number;
  type: 'new_ip_login' | 'failed_login' | 'account_locked' | 'password_changed';
  ip: string | null;
  detail: any;
  read: boolean;
  created_at: string;
}

export const securityService = {
  getPasswordPolicy(): Promise<ApiResponse<PasswordPolicy>> {
    return api.get('/security/password-policy').then(r => r.data);
  },

  updatePasswordPolicy(updates: Partial<PasswordPolicy>): Promise<ApiResponse<PasswordPolicy>> {
    return api.put('/security/password-policy', updates).then(r => r.data);
  },

  getIpWhitelist(): Promise<ApiResponse<IpWhitelistEntry[]>> {
    return api.get('/security/ip-whitelist').then(r => r.data);
  },

  addIpWhitelist(entry: { network: string; mask: number; description?: string }): Promise<ApiResponse<any>> {
    return api.post('/security/ip-whitelist', entry).then(r => r.data);
  },

  deleteIpWhitelist(id: number): Promise<ApiResponse<any>> {
    return api.delete(`/security/ip-whitelist/${id}`).then(r => r.data);
  },

  updateIpWhitelist(id: number, data: { enabled?: boolean }): Promise<ApiResponse<any>> {
    return api.patch(`/security/ip-whitelist/${id}`, data).then(r => r.data);
  },

  getNotifications(unreadOnly?: boolean, limit?: number): Promise<ApiResponse<{ list: LoginNotification[]; unread_count: number }>> {
    const params = new URLSearchParams();
    if (unreadOnly) params.set('unread_only', 'true');
    if (limit) params.set('limit', String(limit));
    return api.get(`/notifications?${params.toString()}`).then(r => r.data);
  },

  getUnreadCount(): Promise<ApiResponse<{ count: number }>> {
    return api.get('/notifications/unread-count').then(r => r.data);
  },

  markNotificationsRead(data: { ids?: number[]; all?: boolean }): Promise<ApiResponse<any>> {
    return api.post('/notifications/mark-read', data).then(r => r.data);
  },

  getCaptcha(): Promise<ApiResponse<{ challenge_id: string; question: string; expires_in: number }>> {
    return api.get('/auth/captcha').then(r => r.data);
  },

  getSmtpConfig(): Promise<ApiResponse<{ host: string; port: number; user: string; from_address: string; configured: boolean }>> {
    return api.get('/security/smtp-config').then(r => r.data);
  },

  updateSmtpConfig(data: any): Promise<ApiResponse<any>> {
    return api.put('/security/smtp-config', data).then(r => r.data);
  },
};
