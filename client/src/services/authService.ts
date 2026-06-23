import api from './api';
import type { ApiResponse, LoginResponse, SafeUser, MfaSetupData } from '../types';

export const authService = {
  login(username: string, password: string): Promise<ApiResponse<LoginResponse>> {
    return api.post('/auth/login', { username, password }).then(r => r.data);
  },

  mfaVerify(mfaToken: string, code: string): Promise<ApiResponse<LoginResponse>> {
    return api.post('/auth/mfa/verify', { mfaToken, code }).then(r => r.data);
  },

  mfaSetup(): Promise<ApiResponse<MfaSetupData>> {
    return api.post('/auth/mfa/setup').then(r => r.data);
  },

  mfaEnable(code: string): Promise<ApiResponse<{ recoveryCodes: string[] }>> {
    return api.post('/auth/mfa/enable', { code }).then(r => r.data);
  },

  mfaDisable(password: string): Promise<ApiResponse<any>> {
    return api.post('/auth/mfa/disable', { password }).then(r => r.data);
  },

  mfaRecovery(username: string, recoveryCode: string): Promise<ApiResponse<LoginResponse>> {
    return api.post('/auth/mfa/recovery', { username, recoveryCode }).then(r => r.data);
  },

  logout(): Promise<ApiResponse<any>> {
    return api.post('/auth/logout').then(r => r.data);
  },

  getMe(): Promise<ApiResponse<SafeUser>> {
    return api.get('/auth/me').then(r => r.data);
  },

  changePassword(oldPassword: string, newPassword: string): Promise<ApiResponse<any>> {
    return api.post('/auth/change-password', { oldPassword, newPassword }).then(r => r.data);
  },
};
