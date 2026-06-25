import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, MessagePlugin } from 'tdesign-react';
import { LockOnIcon, SecuredIcon } from 'tdesign-icons-react';
import { authService } from '../services/authService';
import { securityService, PasswordPolicy } from '../services/securityService';
import { useAuth } from '../hooks/useAuth';

const { FormItem } = Form;

export const ForcePasswordChange: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
  const [form, setForm] = useState({ newPassword: '', confirm: '' });

  useEffect(() => {
    securityService.getPasswordPolicy().then(res => {
      if (res.code === 0 && res.data) setPolicy(res.data);
    });
  }, []);

  const handleSubmit = async () => {
    if (form.newPassword !== form.confirm) {
      MessagePlugin.warning('两次输入的密码不一致');
      return;
    }
    if (policy) {
      if (form.newPassword.length < policy.min_length) {
        MessagePlugin.warning(`密码长度至少 ${policy.min_length} 位`);
        return;
      }
    }
    setLoading(true);
    try {
      // Use the change-password endpoint with the current password flow
      // For forced change, we allow changing without old password by calling a special flow
      const res = await authService.changePassword('', form.newPassword);
      if (res.code === 0) {
        MessagePlugin.success('密码修改成功');
        navigate('/', { replace: true });
      } else {
        MessagePlugin.error(res.message || '修改失败');
      }
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '修改失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-page)]">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/20">
            <SecuredIcon size="32px" className="text-cyan-400" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-4">修改密码</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {user?.must_change_password ? '首次登录需要修改初始密码' : '密码已过期，请设置新密码'}
          </p>
        </div>

        <div className="content-card p-6">
          {policy && (
            <div className="mb-5 p-3 rounded-lg bg-[var(--bg-page)] border border-[var(--border-subtle)]">
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">密码要求：</p>
              <ul className="text-xs text-[var(--text-muted)] space-y-1">
                <li>• 至少 {policy.min_length} 位字符</li>
                {policy.require_upper && <li>• 必须包含大写字母</li>}
                {policy.require_lower && <li>• 必须包含小写字母</li>}
                {policy.require_digit && <li>• 必须包含数字</li>}
                {policy.require_special && <li>• 必须包含特殊字符</li>}
              </ul>
            </div>
          )}

          <Form labelAlign="top">
            <FormItem label="新密码" rules={[{ required: true, message: '请输入新密码' }]}>
              <Input
                type="password"
                value={form.newPassword}
                onChange={(v) => setForm({ ...form, newPassword: v })}
                placeholder={`至少 ${policy?.min_length || 8} 位`}
                prefixIcon={<LockOnIcon />}
              />
            </FormItem>
            <FormItem label="确认密码" rules={[{ required: true, message: '请再次输入新密码' }]}>
              <Input
                type="password"
                value={form.confirm}
                onChange={(v) => setForm({ ...form, confirm: v })}
                placeholder="再次输入新密码"
                prefixIcon={<LockOnIcon />}
              />
            </FormItem>
            <FormItem>
              <Button theme="primary" block loading={loading} onClick={handleSubmit}>
                确认修改
              </Button>
            </FormItem>
          </Form>
        </div>
      </div>
    </div>
  );
};
