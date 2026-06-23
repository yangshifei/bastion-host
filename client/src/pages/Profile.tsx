import React, { useState, useEffect } from 'react';
import { Form, Input, Button, MessagePlugin, Tag } from 'tdesign-react';
import { UserCircleIcon, LockOnIcon, SecuredIcon } from 'tdesign-icons-react';
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

export const Profile: React.FC = () => {
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

  return (
    <div className="max-w-3xl">
      <PageHeader title="个人设置" description="管理账号信息与登录安全" />

      <div className="space-y-5">
        <SectionCard
          title="基本信息"
          description="当前登录账号的只读信息"
        >
          <div className="flex items-center gap-4 mb-5 pb-5 border-b border-white/[0.06]">
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20">
              <UserCircleIcon size="28px" className="text-cyan-400" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-100">{user?.username}</p>
              <Tag theme="default" variant="light" size="small" className="mt-1">
                {ROLE_LABELS[user?.role] || user?.role}
              </Tag>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="info-field">
              <p className="info-label">用户名</p>
              <p className="info-value">{user?.username}</p>
            </div>
            <div className="info-field">
              <p className="info-label">角色</p>
              <p className="info-value">{ROLE_LABELS[user?.role] || user?.role}</p>
            </div>
            <div className="info-field">
              <p className="info-label">邮箱</p>
              <p className="info-value">{user?.email || '未设置'}</p>
            </div>
            <div className="info-field">
              <p className="info-label">最后登录</p>
              <p className="info-value">{user?.last_login || '首次登录'}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="多因素认证 (MFA)"
          description="增强账号安全，防止未授权访问"
          extra={
            <Tag theme={mfaEnabled ? 'success' : 'default'} variant="light" size="small">
              {mfaEnabled ? '已启用' : '未启用'}
            </Tag>
          }
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="quick-action-icon">
              <SecuredIcon size="18px" />
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              启用 MFA 后，登录时需要输入 Authenticator 应用中的动态验证码，建议所有管理员账号开启。
            </p>
          </div>
          <MfaSetup />
        </SectionCard>

        <SectionCard title="修改密码" description="定期更换密码以保障账号安全">
          <Form labelAlign="top" className="max-w-md">
            <FormItem label="当前密码" rules={[{ required: true }]}>
              <Input
                type="password"
                value={pwdForm.oldPassword}
                onChange={(v) => setPwdForm({ ...pwdForm, oldPassword: v })}
                placeholder="输入当前密码"
                prefixIcon={<LockOnIcon />}
              />
            </FormItem>
            <FormItem label="新密码" rules={[{ required: true }]}>
              <Input
                type="password"
                value={pwdForm.newPassword}
                onChange={(v) => setPwdForm({ ...pwdForm, newPassword: v })}
                placeholder="至少8位，含字母和数字"
              />
            </FormItem>
            <FormItem label="确认密码" rules={[{ required: true }]}>
              <Input
                type="password"
                value={pwdForm.confirm}
                onChange={(v) => setPwdForm({ ...pwdForm, confirm: v })}
                placeholder="再次输入新密码"
              />
            </FormItem>
            <FormItem>
              <Button theme="primary" loading={pwdLoading} onClick={handleChangePassword}>
                修改密码
              </Button>
            </FormItem>
          </Form>
        </SectionCard>
      </div>
    </div>
  );
};
