import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Form, Input, Button, MessagePlugin, Divider, Alert } from 'tdesign-react';
import { UserCircleIcon, LockOnIcon, MailIcon, CallIcon, TimeIcon, CheckCircleIcon } from 'tdesign-icons-react';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { authService } from '../services/authService';
import { MfaSetup } from '../components/MfaSetup';

const { FormItem } = Form;

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  auditor: '审计员',
  operator: '操作员',
};

const ROLE_GRADIENT: Record<string, string> = {
  admin: 'from-rose-500/20 to-rose-500/5 border-rose-500/20',
  auditor: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
  operator: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20',
};

const ROLE_ICON_COLOR: Record<string, string> = {
  admin: 'text-rose-400',
  auditor: 'text-amber-400',
  operator: 'text-cyan-400',
};

const DisableMfaForm: React.FC<{ onDisabled: () => void }> = ({ onDisabled }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  if (!show) {
    return (
      <Button variant="outline" theme="danger" onClick={() => setShow(true)}>
        禁用 MFA
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
      <Input
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="输入密码确认"
        prefixIcon={<LockOnIcon />}
        style={{ width: 200 }}
        onEnter={() => handleDisable()}
      />
      <Button theme="danger" loading={loading} onClick={handleDisable}>确认禁用</Button>
      <Button variant="text" onClick={() => { setShow(false); setPassword(''); }}>取消</Button>
    </div>
  );

  async function handleDisable() {
    if (!password) { MessagePlugin.warning('请输入密码'); return; }
    setLoading(true);
    try {
      const res = await authService.mfaDisable(password);
      if (res.code === 0) { MessagePlugin.success('MFA 已禁用'); onDisabled(); }
      else MessagePlugin.error(res.message || '禁用失败');
    } catch { MessagePlugin.error('禁用失败'); }
    finally { setLoading(false); setShow(false); setPassword(''); }
  }
};

const RecoveryCodeViewer: React.FC = () => {
  const [password, setPassword] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [show, setShow] = useState(false);

  if (!show) {
    return <Button variant="outline" size="small" onClick={() => setShow(true)}>恢复码</Button>;
  }

  // Show newly generated codes
  if (newCodes) {
    return (
      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-3">
        <p className="text-xs text-amber-400 font-medium">新恢复码已生成，请立即保存。关闭后无法再次查看：</p>
        <div className="grid grid-cols-2 gap-2">
          {newCodes.map((c, i) => <code key={i} className="text-xs text-cyan-400 bg-black/30 px-2 py-1 rounded">{c}</code>)}
        </div>
        <Button size="small" onClick={() => { setShow(false); setNewCodes(null); setPassword(''); }}>我已保存，关闭</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex-wrap">
      {remaining === null ? (
        <>
          <Input type="password" value={password} onChange={setPassword}
            placeholder="输入密码确认" prefixIcon={<LockOnIcon />} style={{ width: 160 }}
            onEnter={handleView} />
          <Button size="small" loading={loading} onClick={handleView}>确认</Button>
          <Button variant="text" size="small" onClick={() => { setShow(false); setPassword(''); }}>取消</Button>
        </>
      ) : (
        <>
          <span className="text-sm text-slate-300">
            剩余 <b className="text-cyan-400">{remaining}</b> 个恢复码
            {remaining < 4 && <span className="text-amber-400 ml-2 text-xs">建议重新生成</span>}
          </span>
          <Button size="small" variant="outline" theme="warning" loading={regenerating} onClick={handleRegenerate}>重新生成</Button>
          <Button variant="text" size="small" onClick={() => { setShow(false); setRemaining(null); setPassword(''); }}>关闭</Button>
        </>
      )}
    </div>
  );

  async function handleView() {
    if (!password) { MessagePlugin.warning('请输入密码'); return; }
    setLoading(true);
    try {
      const res = await authService.mfaRecoveryView(password);
      if (res.code === 0) setRemaining(res.data?.remaining ?? 0);
      else MessagePlugin.error(res.message || '验证失败');
    } catch { MessagePlugin.error('验证失败'); }
    finally { setLoading(false); setPassword(''); }
  }

  async function handleRegenerate() {
    if (!password) { MessagePlugin.warning('请输入密码'); return; }
    setRegenerating(true);
    try {
      const res = await authService.mfaRecoveryRegenerate(password);
      if (res.code === 0 && res.data?.recoveryCodes) {
        setNewCodes(res.data.recoveryCodes);
        setRemaining(res.data.recoveryCodes.length);
      } else MessagePlugin.error(res.message || '生成失败');
    } catch (err: any) { MessagePlugin.error(err?.response?.data?.message || '生成失败'); }
    finally { setRegenerating(false); }
  }
};

export const Profile: React.FC = () => {
  const [searchParams] = useSearchParams();
  const setupMfa = searchParams.get('setupMfa') === '1';
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);

  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await authService.getMe();
      if (res.code === 0 && res.data) {
        setUser(res.data);
        setMfaEnabled(!!res.data.mfa_enabled);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (pwdForm.newPassword !== pwdForm.confirm) {
      MessagePlugin.error('两次输入的新密码不一致');
      return;
    }
    if (pwdForm.newPassword.length < 8) {
      MessagePlugin.error('新密码至少8位');
      return;
    }
    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(pwdForm.newPassword)) {
      MessagePlugin.error('密码必须包含字母和数字');
      return;
    }
    setPwdLoading(true);
    try {
      const res = await authService.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
      if (res.code === 0) {
        MessagePlugin.success('密码修改成功');
        setPwdForm({ oldPassword: '', newPassword: '', confirm: '' });
      } else {
        MessagePlugin.error(res.message || '修改失败');
      }
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '修改失败');
    } finally {
      setPwdLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  const role = user?.role || 'operator';
  const gradient = ROLE_GRADIENT[role] || ROLE_GRADIENT.operator;
  const iconColor = ROLE_ICON_COLOR[role] || ROLE_ICON_COLOR.operator;

  return (
    <div className="max-w-3xl">
      <PageHeader title="个人设置" description="管理账号信息与登录安全" />

      <div className="space-y-5">
        {/* ── Profile Card ── */}
        <div className="content-card overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-5">
            <div className={`flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} shrink-0`}>
              <UserCircleIcon size="32px" className={iconColor} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="text-xl font-semibold text-slate-100">{user?.username}</h3>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-${role === 'admin' ? 'rose' : role === 'auditor' ? 'amber' : 'cyan'}-500/10 border border-${role === 'admin' ? 'rose' : role === 'auditor' ? 'amber' : 'cyan'}-500/20 ${iconColor}`}>
                  {ROLE_LABELS[role]}
                </span>
                {mfaEnabled && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircleIcon size="12px" /> MFA
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-500">
                {user?.email && (
                  <span className="flex items-center gap-1.5">
                    <MailIcon size="13px" /> {user.email}
                  </span>
                )}
                {user?.phone && (
                  <span className="flex items-center gap-1.5">
                    <CallIcon size="13px" /> {user.phone}
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <TimeIcon size="13px" /> {user?.last_login ? `最近登录: ${user.last_login}` : '首次登录'}
                </span>
              </div>
            </div>
          </div>

          <Divider className="!my-0 !border-white/[0.04]" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/[0.03]">
            <div className="info-field !border-0 !rounded-none !bg-transparent">
              <p className="info-label">账号状态</p>
              <p className="info-value flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${user?.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {user?.status === 'active' ? '启用' : '禁用'}
              </p>
            </div>
            <div className="info-field !border-0 !rounded-none !bg-transparent">
              <p className="info-label">MFA 认证</p>
              <p className={`info-value ${mfaEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                {mfaEnabled ? '已启用' : '未启用'}
              </p>
            </div>
            <div className="info-field !border-0 !rounded-none !bg-transparent">
              <p className="info-label">创建时间</p>
              <p className="info-value">{user?.created_at?.slice(0, 10) || '—'}</p>
            </div>
            <div className="info-field !border-0 !rounded-none !bg-transparent">
              <p className="info-label">登录次数</p>
              <p className="info-value">{user?.login_count ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* ── MFA ── */}
        <SectionCard
          title="多因素认证 (MFA)"
          description="增强账号安全 — 启用后登录需输入动态验证码"
        >
          {setupMfa && !mfaEnabled && (
            <Alert
              theme="warning"
              message="系统安全策略要求启用 MFA，请完成下方设置后再使用其他功能"
              className="mb-4"
            />
          )}

          {mfaEnabled ? (
            <div>
              <p className="text-sm text-slate-300 mb-3">
                MFA 已启用 · {user?.mfa_method === 'email' ? '邮箱验证码' : 'TOTP 验证器应用'}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <DisableMfaForm onDisabled={() => { setMfaEnabled(false); loadProfile(); }} />
                <RecoveryCodeViewer />
              </div>
            </div>
          ) : (
            <MfaSetup autoOpen={setupMfa} onEnabled={() => { setMfaEnabled(true); loadProfile(); }} />
          )}
        </SectionCard>

        {/* ── Change Password ── */}
        <SectionCard title="修改密码" description="定期更换密码以保障账号安全">
          <Form labelAlign="top" className="max-w-md">
            <FormItem label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
              <Input
                type="password"
                value={pwdForm.oldPassword}
                onChange={(v) => setPwdForm({ ...pwdForm, oldPassword: v })}
                placeholder="输入当前密码"
                prefixIcon={<LockOnIcon />}
              />
            </FormItem>
            <FormItem label="新密码" rules={[{ required: true, message: '请输入新密码' }]}>
              <Input
                type="password"
                value={pwdForm.newPassword}
                onChange={(v) => setPwdForm({ ...pwdForm, newPassword: v })}
                placeholder="至少8位，含字母和数字"
                prefixIcon={<LockOnIcon />}
              />
            </FormItem>
            <FormItem label="确认新密码" rules={[{ required: true, message: '请再次输入新密码' }]}>
              <Input
                type="password"
                value={pwdForm.confirm}
                onChange={(v) => setPwdForm({ ...pwdForm, confirm: v })}
                placeholder="再次输入新密码确认"
                prefixIcon={<LockOnIcon />}
              />
            </FormItem>
            <FormItem>
              <Button theme="primary" loading={pwdLoading} onClick={handleChangePassword} icon={<LockOnIcon />}>
                修改密码
              </Button>
            </FormItem>
          </Form>
        </SectionCard>
      </div>
    </div>
  );
};
