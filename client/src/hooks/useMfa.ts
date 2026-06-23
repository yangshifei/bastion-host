import { useState, useCallback } from 'react';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';

type MfaState = 'idle' | 'setup' | 'verifying' | 'enabled';

export function useMfa() {
  const [state, setState] = useState<MfaState>('idle');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const startSetup = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authService.mfaSetup();
      if (res.code === 0 && res.data) {
        setSecret(res.data.secret);
        setOtpauthUrl(res.data.otpauth_url);
        setState('setup');
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'MFA 设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyAndEnable = useCallback(async (code: string) => {
    try {
      setLoading(true);
      setError('');
      setState('verifying');
      const res = await authService.mfaEnable(code);
      if (res.code === 0 && res.data) {
        setRecoveryCodes(res.data.recoveryCodes);
        setState('enabled');
        // Refresh user info
        const meRes = await authService.getMe();
        if (meRes.code === 0 && meRes.data) {
          useAuthStore.getState().setUser(meRes.data);
        }
      } else {
        setError(res.message);
        setState('setup');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'MFA 启用失败');
      setState('setup');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setSecret('');
    setOtpauthUrl('');
    setRecoveryCodes([]);
    setError('');
  }, []);

  return {
    state,
    secret,
    otpauthUrl,
    recoveryCodes,
    error,
    loading,
    startSetup,
    verifyAndEnable,
    reset,
  };
}
