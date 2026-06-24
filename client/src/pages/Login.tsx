import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, MessagePlugin } from 'tdesign-react';
import {
  SecuredIcon,
  TerminalIcon,
  FileIcon,
  UserIcon,
} from 'tdesign-icons-react';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/authStore';
import { BrandLogo } from '../components/BrandLogo';
import type { LoginResponse } from '../types';

const { FormItem } = Form;

const FEATURES = [
  { icon: <TerminalIcon size="18px" />, title: '多协议接入', desc: 'SSH / RDP 统一远程访问' },
  { icon: <SecuredIcon size="18px" />, title: '零信任安全', desc: 'MFA 认证 · 细粒度授权' },
  { icon: <FileIcon size="18px" />, title: '全链路审计', desc: '操作录像 · 命令追溯' },
];

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login: setAuth, token } = useAuthStore();
  const isAuthenticated = !!token;
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'login' | 'mfa' | 'recovery'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');

  React.useEffect(() => {
    if (isAuthenticated) navigate('/dashboard');
  }, [isAuthenticated, navigate]);

  const handleLogin = async () => {
    if (!username || !password) {
      MessagePlugin.warning('请输入用户名和密码');
      return;
    }
    setLoading(true);
    try {
      const res = await authService.login(username, password);
      if (res.code === 0 && res.data) {
        const data = res.data as LoginResponse;
        if (data.requireMfa && data.mfaToken) {
          setMfaToken(data.mfaToken);
          setStep('mfa');
        } else if (data.token && data.user) {
          setAuth(data.token, data.user);
          MessagePlugin.success('登录成功');
          navigate('/dashboard');
        }
      } else {
        MessagePlugin.error(res.message || '登录失败');
      }
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (!mfaCode || mfaCode.length !== 6) {
      MessagePlugin.warning('请输入 6 位验证码');
      return;
    }
    setLoading(true);
    try {
      const res = await authService.mfaVerify(mfaToken, mfaCode);
      if (res.code === 0 && res.data?.token && res.data?.user) {
        setAuth(res.data.token, res.data.user);
        MessagePlugin.success('MFA 验证成功');
        navigate('/dashboard');
      } else {
        MessagePlugin.error(res.message || '验证失败');
      }
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || 'MFA 验证失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRecovery = async () => {
    if (!username || !recoveryCode) {
      MessagePlugin.warning('请输入用户名和恢复码');
      return;
    }
    setLoading(true);
    try {
      const res = await authService.mfaRecovery(username, recoveryCode);
      if (res.code === 0 && res.data?.token && res.data?.user) {
        setAuth(res.data.token, res.data.user);
        MessagePlugin.success('恢复登录成功');
        navigate('/dashboard');
      } else {
        MessagePlugin.error(res.message || '恢复失败');
      }
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '恢复失败');
    } finally {
      setLoading(false);
    }
  };

  const stepTitle =
    step === 'login' ? '欢迎回来' : step === 'mfa' ? '两步验证' : '恢复登录';

  const stepDesc =
    step === 'login'
      ? '登录以访问堡垒机控制台'
      : step === 'mfa'
        ? '请输入 Authenticator 中的 6 位验证码'
        : '使用备用恢复码登录（每个恢复码仅能使用一次）';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-blue-600/5" />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-cyan-500/5 blur-3xl animate-pulse-soft" />
        <div className="absolute -bottom-48 -left-24 w-80 h-80 rounded-full bg-blue-500/5 blur-3xl" />

        <div className="relative z-10">
          <BrandLogo size="lg" />
        </div>

        <div className="relative z-10 space-y-8 max-w-md">
          <div>
            <h2 className="text-3xl font-semibold text-slate-100 leading-snug tracking-tight">
              企业级安全
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
                远程访问平台
              </span>
            </h2>
            <p className="text-slate-400 mt-4 leading-relaxed">
              集中管理服务器与桌面资产，实现安全可控的远程运维，满足合规审计要求。
            </p>
          </div>

          <div className="space-y-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm"
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                  {f.icon}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">{f.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-600">
          © {new Date().getFullYear()} Bastion Host · Enterprise Security Platform
        </p>
      </div>

      {/* Login form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative">
        <div className="absolute inset-0 bg-gradient-radial lg:hidden" />

        <div className="w-full max-w-[420px] relative z-10 animate-fade-in">
          <div className="lg:hidden mb-8 flex justify-center">
            <BrandLogo size="lg" />
          </div>

          <div className="glass-panel p-8 shadow-panel-lg">
            <div className="mb-7">
              <div className="flex items-center gap-2 mb-2">
                <UserIcon size="18px" className="text-cyan-400" />
                <h2 className="text-xl font-semibold text-slate-100">{stepTitle}</h2>
              </div>
              <p className="text-sm text-slate-500">{stepDesc}</p>
            </div>

            {step === 'login' && (
              <Form labelAlign="top" onSubmit={handleLogin}>
                <FormItem label="用户名">
                  <Input
                    value={username}
                    onChange={setUsername}
                    placeholder="请输入用户名"
                    size="large"
                    onEnter={handleLogin}
                  />
                </FormItem>
                <FormItem label="密码">
                  <Input
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="请输入密码"
                    size="large"
                    onEnter={handleLogin}
                  />
                </FormItem>
                <Button
                  theme="primary"
                  block
                  size="large"
                  loading={loading}
                  onClick={handleLogin}
                  className="mt-2"
                >
                  登录
                </Button>
                <div className="text-center mt-4">
                  <Button variant="text" size="small" onClick={() => setStep('recovery')}>
                    使用 MFA 恢复码登录
                  </Button>
                </div>
              </Form>
            )}

            {step === 'mfa' && (
              <Form labelAlign="top" onSubmit={handleMfaVerify}>
                <FormItem label="验证码">
                  <Input
                    value={mfaCode}
                    onChange={setMfaCode}
                    placeholder="000000"
                    maxlength={6}
                    size="large"
                    onEnter={handleMfaVerify}
                  />
                </FormItem>
                <Button
                  theme="primary"
                  block
                  size="large"
                  loading={loading}
                  onClick={handleMfaVerify}
                >
                  验证
                </Button>
                <div className="text-center mt-4">
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => {
                      setStep('login');
                      setMfaCode('');
                    }}
                  >
                    返回登录
                  </Button>
                </div>
              </Form>
            )}

            {step === 'recovery' && (
              <Form labelAlign="top" onSubmit={handleRecovery}>
                <FormItem label="用户名">
                  <Input
                    value={username}
                    onChange={setUsername}
                    placeholder="请输入用户名"
                    size="large"
                  />
                </FormItem>
                <FormItem label="恢复码">
                  <Input
                    value={recoveryCode}
                    onChange={setRecoveryCode}
                    placeholder="请输入恢复码"
                    size="large"
                    onEnter={handleRecovery}
                  />
                </FormItem>
                <Button
                  theme="primary"
                  block
                  size="large"
                  loading={loading}
                  onClick={handleRecovery}
                >
                  恢复登录
                </Button>
                <div className="text-center mt-4">
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => {
                      setStep('login');
                      setRecoveryCode('');
                    }}
                  >
                    返回登录
                  </Button>
                </div>
              </Form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
