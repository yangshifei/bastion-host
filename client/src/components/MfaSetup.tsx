import React, { useState, useEffect } from 'react';
import { Dialog, Form, Input, Button, MessagePlugin, Alert } from 'tdesign-react';
import QRCode from 'qrcode';
import { useMfa } from '../hooks/useMfa';
import { authService } from '../services/authService';

const { FormItem } = Form;

interface MfaSetupProps {
  autoOpen?: boolean;
  onEnabled?: () => void;
}

export const MfaSetup: React.FC<MfaSetupProps> = ({ autoOpen = false, onEnabled }) => {
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [method, setMethod] = useState<'totp' | 'email' | null>(null);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const mfa = useMfa();

  const reset = () => {
    mfa.reset();
    setCode('');
    setQrDataUrl('');
    setMethod(null);
    setEmailCodeSent(false);
  };

  const handleOpen = () => {
    setVisible(true);
    reset();
  };

  // Generate QR for TOTP
  useEffect(() => {
    if (mfa.otpauthUrl) {
      QRCode.toDataURL(mfa.otpauthUrl, { width: 200, margin: 2 })
        .then(setQrDataUrl).catch(() => {});
    }
  }, [mfa.otpauthUrl]);

  useEffect(() => { if (autoOpen) handleOpen(); }, [autoOpen]); // eslint-disable-line
  useEffect(() => { if (mfa.state === 'enabled') onEnabled?.(); }, [mfa.state, onEnabled]);

  const handleClose = () => { setVisible(false); reset(); };

  // ── TOTP flow ──
  const startTotp = () => { setMethod('totp'); mfa.startSetup(); };

  const verifyTotp = async () => {
    if (!code || code.length !== 6) { MessagePlugin.warning('请输入 6 位验证码'); return; }
    await mfa.verifyAndEnable(code);
  };

  // ── Email MFA flow ──
  const startEmailMfa = async () => {
    setMethod('email');
    try {
      const res = await authService.emailMfaEnable();
      if (res.code === 0) { setEmailCodeSent(true); MessagePlugin.success('验证码已发送至您的邮箱'); }
      else MessagePlugin.error(res.message || '发送失败');
    } catch (err: any) { MessagePlugin.error(err?.response?.data?.message || err?.message || '发送失败'); }
  };

  const verifyEmailCode = async () => {
    if (!code || code.length !== 6) { MessagePlugin.warning('请输入 6 位验证码'); return; }
    try {
      const res = await authService.emailMfaVerifyEnable(code);
      if (res.code === 0) { mfa.setState('enabled' as any); MessagePlugin.success('邮箱 MFA 已启用'); }
      else MessagePlugin.error(res.message || '验证失败');
    } catch (err: any) { MessagePlugin.error(err.response?.data?.message || '验证失败'); }
  };

  return (
    <>
      <Button variant="outline" onClick={handleOpen}>设置 MFA</Button>

      <Dialog visible={visible} header="MFA 多因素认证设置" width={480} onClose={handleClose} footer={null}>
        {mfa.error && <Alert theme="error" message={mfa.error} className="mb-4" />}

        {/* ── Method selection ── */}
        {!method && !mfa.error && (
          <div>
            <p className="text-sm text-slate-400 mb-4">选择一种多因素认证方式：</p>
            <div className="space-y-3">
              <button onClick={startTotp}
                className="w-full text-left p-4 rounded-xl border border-[var(--border-subtle)] hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all">
                <p className="text-sm font-semibold text-slate-200">📱 TOTP 验证器应用</p>
                <p className="text-xs text-slate-500 mt-1">使用 Google Authenticator / Authy 等应用扫描二维码生成动态验证码，无需网络</p>
              </button>
              <button onClick={startEmailMfa}
                className="w-full text-left p-4 rounded-xl border border-[var(--border-subtle)] hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all">
                <p className="text-sm font-semibold text-slate-200">📧 邮箱验证码</p>
                <p className="text-xs text-slate-500 mt-1">将 6 位验证码发送到您的注册邮箱，无需安装额外应用</p>
              </button>
            </div>
          </div>
        )}

        {/* ── TOTP setup ── */}
        {method === 'totp' && mfa.state === 'idle' && <p className="text-slate-400 text-center">加载中...</p>}
        {method === 'totp' && mfa.state === 'setup' && (
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-4">使用 Google Authenticator 或 Authy 扫描下方二维码</p>
            {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="mx-auto mb-4 bg-white p-2 rounded-lg" />}
            <p className="text-xs text-slate-500 mb-3 break-all">或手动输入密钥: <code className="text-cyan-400">{mfa.secret}</code></p>
            <FormItem label="验证码"><Input value={code} onChange={setCode} placeholder="输入 6 位验证码" maxlength={6} size="large" /></FormItem>
            <Button theme="primary" block loading={mfa.loading} onClick={verifyTotp}>验证并启用</Button>
          </div>
        )}
        {method === 'totp' && mfa.state === 'verifying' && <p className="text-slate-400 text-center">验证中...</p>}

        {/* ── Email MFA setup ── */}
        {method === 'email' && (
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-4">
              {emailCodeSent ? '验证码已发送至您的注册邮箱，请查收' : '点击下方按钮发送验证码到您的邮箱'}
            </p>
            {emailCodeSent && (
              <>
                <FormItem label="邮箱验证码">
                  <Input value={code} onChange={setCode} placeholder="输入 6 位验证码" maxlength={6} size="large" />
                </FormItem>
                <Button theme="primary" block loading={mfa.loading} onClick={verifyEmailCode}>验证并启用</Button>
              </>
            )}
          </div>
        )}

        {/* ── Enabled state ── */}
        {mfa.state === 'enabled' && (
          <div className="text-center">
            <p className="text-green-400 text-lg mb-4">✅ MFA 已成功启用</p>
            {mfa.recoveryCodes.length > 0 && (
              <>
                <Alert theme="warning" message="请妥善保管以下恢复码，每个恢复码仅能使用一次" className="mb-4" />
                <div className="bg-slate-800 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-2">
                    {mfa.recoveryCodes.map((c, i) => <code key={i} className="text-xs text-cyan-400 bg-slate-900 px-2 py-1 rounded">{c}</code>)}
                  </div>
                </div>
              </>
            )}
            <Button theme="primary" onClick={handleClose}>完成</Button>
          </div>
        )}

        {/* back button */}
        {method && mfa.state !== 'enabled' && mfa.state !== 'verifying' && (
          <div className="text-center mt-3">
            <Button variant="text" size="small" onClick={reset}>← 返回选择</Button>
          </div>
        )}
      </Dialog>
    </>
  );
};
