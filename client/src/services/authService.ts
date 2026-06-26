import api from './api';
import type { ApiResponse, LoginResponse, SafeUser, MfaSetupData } from '../types';

export const authService = {
  login(
    username: string,
    password: string,
    captcha?: { captcha_id: string; captcha_answer: string }
  ): Promise<ApiResponse<LoginResponse>> {
    return api.post('/auth/login', { username, password, ...captcha }).then(r => r.data);
  },

  getCaptcha(): Promise<ApiResponse<{ challenge_id: string; question: string; expires_in: number }>> {
    return api.get('/auth/captcha').then(r => r.data);
  },

  mfaVerify(mfaToken: string, code: string): Promise<ApiResponse<LoginResponse>> {
    return api.post('/auth/mfa/verify', { mfaToken, code }).then(r => r.data);
  },

  mfaSetup(): Promise<ApiResponse<MfaSetupData>> {
    return api.post('/auth/mfa/setup').then(r => r.data);
  },

  mfaEnable(code: string): Promise<ApiResponse<{ recoveryCodes: string[]; token?: string }>> {
    return api.post('/auth/mfa/enable', { code }).then(r => r.data);
  },

  mfaDisable(password: string): Promise<ApiResponse<any>> {
    return api.post('/auth/mfa/disable', { password }).then(r => r.data);
  },

  emailMfaVerify(sessionToken: string, code: string): Promise<ApiResponse<LoginResponse>> {
    return api.post('/auth/mfa/email/verify', { session_token: sessionToken, code }).then(r => r.data);
  },

  emailMfaEnable(): Promise<ApiResponse<any>> {
    return api.post('/auth/mfa/email/enable').then(r => r.data);
  },

  emailMfaVerifyEnable(code: string): Promise<ApiResponse<{ recoveryCodes: string[] }>> {
    return api.post('/auth/mfa/email/enable/verify', { code }).then(r => r.data);
  },

  emailMfaResend(sessionToken: string): Promise<ApiResponse<any>> {
    return api.post('/auth/mfa/email/resend', { session_token: sessionToken }).then(r => r.data);
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
