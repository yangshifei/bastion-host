import React, { useState, useEffect } from 'react';
import { Dialog, Form, Input, Button, MessagePlugin, Alert, Divider } from 'tdesign-react';
import QRCode from 'qrcode';
import { useMfa } from '../hooks/useMfa';

const { FormItem } = Form;

interface MfaSetupProps {
  autoOpen?: boolean;
  onEnabled?: () => void;
}

export const MfaSetup: React.FC<MfaSetupProps> = ({ autoOpen = false, onEnabled }) => {
  const [visible, setVisible] = useState(false);
  const [code, setCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const { state, secret, otpauthUrl, recoveryCodes, error, loading, startSetup, verifyAndEnable, reset } = useMfa();

  const handleOpen = async () => {
    setVisible(true);
    await startSetup();
    if (otpauthUrl) {
      try {
        const url = await QRCode.toDataURL(otpauthUrl, { width: 200, margin: 2 });
        setQrDataUrl(url);
      } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    if (autoOpen) {
      handleOpen();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  useEffect(() => {
    if (state === 'enabled') {
      onEnabled?.();
    }
  }, [state, onEnabled]);

  const handleClose = () => {
    setVisible(false);
    reset();
    setCode('');
    setQrDataUrl('');
  };

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      MessagePlugin.warning('请输入 6 位验证码');
      return;
    }
    await verifyAndEnable(code);
  };

  return (
    <>
      <Button variant="outline" onClick={handleOpen}>设置 MFA</Button>

      <Dialog visible={visible} header="MFA 多因素认证设置" width={480} onClose={handleClose} footer={null}>
        {error && <Alert theme="error" message={error} className="mb-4" />}

        {state === 'idle' && <p className="text-slate-400">加载中...</p>}

        {state === 'setup' && (
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-4">
              使用 Google Authenticator 或 Authy 扫描下方二维码
            </p>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR Code" className="mx-auto mb-4 bg-white p-2 rounded-lg" />
            )}
            <p className="text-xs text-slate-500 mb-3 break-all">
              或手动输入密钥: <code className="text-cyan-400">{secret}</code>
            </p>
            <FormItem label="验证码">
              <Input
                value={code}
                onChange={setCode}
                placeholder="输入 6 位验证码"
                maxlength={6}
                size="large"
              />
            </FormItem>
            <Button theme="primary" block loading={loading} onClick={handleVerify}>
              验证并启用
            </Button>
          </div>
        )}

        {state === 'verifying' && <p className="text-slate-400 text-center">验证中...</p>}

        {state === 'enabled' && (
          <div className="text-center">
            <p className="text-green-400 text-lg mb-4">✅ MFA 已成功启用</p>
            <Alert theme="warning" message="请妥善保管以下恢复码，每个恢复码仅能使用一次" className="mb-4" />
            <div className="bg-slate-800 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((code, i) => (
                  <code key={i} className="text-xs text-cyan-400 bg-slate-900 px-2 py-1 rounded">{code}</code>
                ))}
              </div>
            </div>
            <Button theme="primary" onClick={handleClose}>完成</Button>
          </div>
        )}
      </Dialog>
    </>
  );
};
