import React, { useEffect, useState, useCallback } from 'react';
import { Form, Switch, Button, Input, Tag, Space, Popconfirm, MessagePlugin, Divider } from 'tdesign-react';
import { RefreshIcon, AddIcon, DeleteIcon } from 'tdesign-icons-react';
import { securityService, PasswordPolicy, IpWhitelistEntry } from '../services/securityService';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';

const { FormItem } = Form;

const DEFAULT_POLICY: PasswordPolicy = {
  min_length: 8, require_upper: true, require_lower: true, require_digit: true,
  require_special: false, expire_days: 90, history_count: 5,
  force_change_on_create: true, captcha_threshold: 3,
  lockout_threshold: 10, lockout_minutes: 15,
};

export const SecuritySettings: React.FC = () => {
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);
  const [whitelist, setWhitelist] = useState<IpWhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [wlForm, setWlForm] = useState({ network: '', mask: '24', description: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const pres = await securityService.getPasswordPolicy();
      if (pres.code === 0 && pres.data) setPolicy(pres.data);
    } catch { /* keep defaults */ }

    try {
      const wres = await securityService.getIpWhitelist();
      if (wres.code === 0 && wres.data) setWhitelist(wres.data);
    } catch { /* optional */ }

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const savePolicy = async (key: keyof PasswordPolicy, value: any) => {
    setSaving(true);
    setPolicy(prev => ({ ...prev, [key]: value }));
    try {
      const res = await securityService.updatePasswordPolicy({ [key]: value });
      if (res.code !== 0) {
        MessagePlugin.error(res.message || '保存失败');
        loadData(); // revert
      }
    } catch {
      MessagePlugin.error('保存失败，请重试');
      loadData(); // revert
    } finally {
      setSaving(false);
    }
  };

  const addWhitelist = async () => {
    if (!wlForm.network) { MessagePlugin.warning('请输入网络地址'); return; }
    try {
      const res = await securityService.addIpWhitelist({
        network: wlForm.network,
        mask: parseInt(wlForm.mask) || 24,
        description: wlForm.description || undefined,
      });
      if (res.code === 0) {
        MessagePlugin.success('已添加');
        setWlForm({ network: '', mask: '24', description: '' });
        loadData();
      } else {
        MessagePlugin.error(res.message || '添加失败');
      }
    } catch { MessagePlugin.error('添加失败'); }
  };

  const deleteWhitelist = async (id: number) => {
    try {
      await securityService.deleteIpWhitelist(id);
      MessagePlugin.success('已删除');
      loadData();
    } catch { MessagePlugin.error('删除失败'); }
  };

  const toggleWhitelist = async (id: number, enabled: boolean) => {
    try {
      await securityService.updateIpWhitelist(id, { enabled: !enabled });
      loadData();
    } catch { MessagePlugin.error('操作失败'); }
  };

  return (
    <div>
      <PageHeader title="安全策略" description="配置密码规则、防暴力破解与 IP 访问控制" />

      {loading ? (
        <div className="content-card flex items-center justify-center h-32">
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── Password Policy ── */}
          <SectionCard title="密码复杂度" description="用户密码必须满足以下条件">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                ['require_upper', '大写字母', 'A-Z'],
                ['require_lower', '小写字母', 'a-z'],
                ['require_digit', '数字', '0-9'],
                ['require_special', '特殊字符', '!@#$%'],
              ] as const).map(([key, label, hint]) => (
                <label key={key} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--border-default)] cursor-pointer transition-colors">
                  <Switch value={(policy as any)[key]} onChange={(v) => savePolicy(key, v)} />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{hint}</p>
                  </div>
                </label>
              ))}
            </div>

            <Divider className="!my-4" />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormItem label="最小长度" help="8-64 位">
                <Input type="number" value={String(policy.min_length)}
                  onChange={(v) => { const n = parseInt(v); if (n >= 8 && n <= 64) savePolicy('min_length', n); }}
                  style={{ width: '100%' }} />
              </FormItem>
              <FormItem label="过期天数" help="0=永不过期">
                <Input type="number" value={String(policy.expire_days)}
                  onChange={(v) => { const n = parseInt(v); if (n >= 0 && n <= 365) savePolicy('expire_days', n); }}
                  style={{ width: '100%' }} />
              </FormItem>
              <FormItem label="历史数量" help="0=不限制">
                <Input type="number" value={String(policy.history_count)}
                  onChange={(v) => { const n = parseInt(v); if (n >= 0 && n <= 20) savePolicy('history_count', n); }}
                  style={{ width: '100%' }} />
              </FormItem>
              <FormItem label="首次登录">
                <div className="flex items-center gap-2 h-8">
                  <Switch value={policy.force_change_on_create} onChange={(v) => savePolicy('force_change_on_create', v)} />
                  <span className="text-xs text-slate-500">强制修改密码</span>
                </div>
              </FormItem>
            </div>
          </SectionCard>

          {/* ── Brute Force ── */}
          <SectionCard title="防暴力破解" description="多次登录失败后的保护措施">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormItem label="触发验证码" help={`失败 ${policy.captcha_threshold} 次后需要验证码`}>
                <Input type="number" value={String(policy.captcha_threshold)}
                  onChange={(v) => { const n = parseInt(v); if (n >= 1 && n <= 10) savePolicy('captcha_threshold', n); }}
                  style={{ width: '100%' }} />
              </FormItem>
              <FormItem label="锁定账号" help={`失败 ${policy.lockout_threshold} 次后锁定`}>
                <Input type="number" value={String(policy.lockout_threshold)}
                  onChange={(v) => { const n = parseInt(v); if (n >= 5 && n <= 20) savePolicy('lockout_threshold', n); }}
                  style={{ width: '100%' }} />
              </FormItem>
              <FormItem label="锁定时长" help={`${policy.lockout_minutes} 分钟`}>
                <Input type="number" value={String(policy.lockout_minutes)}
                  onChange={(v) => { const n = parseInt(v); if (n >= 5 && n <= 1440) savePolicy('lockout_minutes', n); }}
                  style={{ width: '100%' }} />
              </FormItem>
            </div>
          </SectionCard>

          {/* ── IP Whitelist ── */}
          <SectionCard
            title="IP 白名单"
            description="留空表示不限制。仅允许列表中的 IP 访问登录接口。"
            extra={<Button variant="outline" size="small" icon={<RefreshIcon />} onClick={loadData}>刷新</Button>}
          >
            <div className="flex flex-wrap items-end gap-3 mb-5">
              <FormItem label="网络地址" style={{ marginBottom: 0 }}>
                <Input value={wlForm.network} onChange={(v) => setWlForm(p => ({ ...p, network: v }))}
                  placeholder="10.0.0.0" style={{ width: 130 }} />
              </FormItem>
              <FormItem label="掩码" style={{ marginBottom: 0 }}>
                <Input value={wlForm.mask} onChange={(v) => setWlForm(p => ({ ...p, mask: v }))}
                  placeholder="24" style={{ width: 70 }} />
              </FormItem>
              <FormItem label="备注" style={{ marginBottom: 0 }}>
                <Input value={wlForm.description} onChange={(v) => setWlForm(p => ({ ...p, description: v }))}
                  placeholder="办公网" style={{ width: 140 }} />
              </FormItem>
              <Button theme="primary" icon={<AddIcon />} onClick={addWhitelist}>添加</Button>
            </div>

            {whitelist.length === 0 ? (
              <p className="text-sm text-slate-500 py-2">暂无规则，所有 IP 均可登录。</p>
            ) : (
              <div className="space-y-1.5">
                {whitelist.map(e => (
                  <div key={e.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-[var(--border-subtle)]">
                    <code className="text-sm text-[var(--accent)] font-mono min-w-[120px]">{e.network}/{e.mask}</code>
                    {e.description && <span className="text-xs text-slate-500 flex-1">{e.description}</span>}
                    <Tag theme={e.enabled ? 'success' : 'default'} variant="light" size="small">
                      {e.enabled ? '启用' : '禁用'}
                    </Tag>
                    <Space size="small">
                      <Button variant="text" size="small" onClick={() => toggleWhitelist(e.id, e.enabled)}>
                        {e.enabled ? '禁用' : '启用'}
                      </Button>
                      <Popconfirm content="确认删除？" onConfirm={() => deleteWhitelist(e.id)}>
                        <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
                      </Popconfirm>
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
};
