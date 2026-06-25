import React, { useEffect, useState, useCallback } from 'react';
import { Form, Switch, Button, Input, Popconfirm, MessagePlugin } from 'tdesign-react';
import { AddIcon, DeleteIcon } from 'tdesign-icons-react';
import { securityService, PasswordPolicy, IpWhitelistEntry } from '../services/securityService';
import { PageHeader } from '../components/PageHeader';

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

  const update = async (key: keyof PasswordPolicy, value: any) => {
    setPolicy(p => ({ ...p, [key]: value }));
    try {
      const res = await securityService.updatePasswordPolicy({ [key]: value });
      if (res.code !== 0) {
        MessagePlugin.error(res.message || '保存失败');
        loadData();
      }
    } catch { MessagePlugin.error('保存失败'); loadData(); }
  };

  const addWl = async () => {
    if (!wlForm.network) { MessagePlugin.warning('请输入网络地址'); return; }
    try {
      const res = await securityService.addIpWhitelist({
        network: wlForm.network, mask: parseInt(wlForm.mask) || 24,
        description: wlForm.description || undefined,
      });
      if (res.code === 0) { MessagePlugin.success('已添加'); setWlForm({ network: '', mask: '24', description: '' }); loadData(); }
      else MessagePlugin.error(res.message || '添加失败');
    } catch { MessagePlugin.error('添加失败'); }
  };

  const delWl = async (id: number) => { try { await securityService.deleteIpWhitelist(id); loadData(); } catch { MessagePlugin.error('删除失败'); } };
  const toggleWl = async (id: number, en: boolean) => { try { await securityService.updateIpWhitelist(id, { enabled: !en }); loadData(); } catch { MessagePlugin.error('操作失败'); } };

  if (loading) {
    return (
      <div>
        <PageHeader title="安全策略" description="密码规则、防暴力破解与 IP 访问控制" />
        <div className="content-card flex items-center justify-center h-32">
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="安全策略" description="密码规则、防暴力破解与 IP 访问控制" />

      {/* ====== Row 1: two cards side by side ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* ─── Password Policy ─── */}
        <div className="content-card">
          <div className="section-header">
            <div>
              <h3 className="section-title">密码策略</h3>
              <p className="section-desc">复杂度要求与过期规则</p>
            </div>
          </div>
          <div className="section-body space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <FormItem label="最小长度"><Input type="number" value={String(policy.min_length)} onChange={v => { const n = parseInt(v); if (n >= 8 && n <= 64) update('min_length', n); }} /></FormItem>
              <FormItem label="过期天数"><Input type="number" value={String(policy.expire_days)} onChange={v => { const n = parseInt(v); if (n >= 0) update('expire_days', n); }} /></FormItem>
              <FormItem label="历史数量"><Input type="number" value={String(policy.history_count)} onChange={v => { const n = parseInt(v); if (n >= 0 && n <= 20) update('history_count', n); }} /></FormItem>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2.5">
              {([
                ['require_upper', '包含大写字母 (A-Z)'],
                ['require_lower', '包含小写字母 (a-z)'],
                ['require_digit', '包含数字 (0-9)'],
                ['require_special', '包含特殊字符 (!@#$)'],
                ['force_change_on_create', '新用户首次登录强制改密'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2.5 cursor-pointer select-none">
                  <Switch size="small" value={(policy as any)[k]} onChange={v => update(k, v)} />
                  <span className="text-sm text-slate-300">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Brute Force Protection ─── */}
        <div className="content-card">
          <div className="section-header">
            <div>
              <h3 className="section-title">防暴力破解</h3>
              <p className="section-desc">登录失败后的保护措施</p>
            </div>
          </div>
          <div className="section-body space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <FormItem label="触发验证码" help={`失败 ${policy.captcha_threshold} 次`}>
                <Input type="number" value={String(policy.captcha_threshold)} onChange={v => { const n = parseInt(v); if (n >= 1 && n <= 10) update('captcha_threshold', n); }} />
              </FormItem>
              <FormItem label="锁定账号" help={`失败 ${policy.lockout_threshold} 次`}>
                <Input type="number" value={String(policy.lockout_threshold)} onChange={v => { const n = parseInt(v); if (n >= 5 && n <= 20) update('lockout_threshold', n); }} />
              </FormItem>
              <FormItem label="锁定时长" help={`${policy.lockout_minutes} 分钟`}>
                <Input type="number" value={String(policy.lockout_minutes)} onChange={v => { const n = parseInt(v); if (n >= 5) update('lockout_minutes', n); }} />
              </FormItem>
            </div>
          </div>
        </div>
      </div>

      {/* ====== Row 2: IP Whitelist ====== */}
      <div className="content-card">
        <div className="section-header">
          <div>
            <h3 className="section-title">IP 白名单</h3>
            <p className="section-desc">仅允许列表中的 IP 地址登录，留空表示不限制</p>
          </div>
        </div>
        <div className="section-body space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <FormItem label="网络地址" style={{ marginBottom: 0 }}>
              <Input value={wlForm.network} onChange={v => setWlForm(p => ({ ...p, network: v }))} placeholder="如 10.0.0.0" style={{ width: 130 }} />
            </FormItem>
            <FormItem label="CIDR 掩码" style={{ marginBottom: 0 }}>
              <Input value={wlForm.mask} onChange={v => setWlForm(p => ({ ...p, mask: v }))} placeholder="24" style={{ width: 80 }} />
            </FormItem>
            <FormItem label="备注" style={{ marginBottom: 0 }}>
              <Input value={wlForm.description} onChange={v => setWlForm(p => ({ ...p, description: v }))} placeholder="可选" style={{ width: 130 }} />
            </FormItem>
            <Button theme="primary" icon={<AddIcon />} onClick={addWl} style={{ marginBottom: 0 }}>添加</Button>
          </div>

          {whitelist.length > 0 && (
            <div className="space-y-1.5">
              {whitelist.map(e => (
                <div key={e.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <code className="text-sm font-mono text-cyan-400 w-[130px] shrink-0">{e.network}/{e.mask}</code>
                  {e.description && <span className="text-xs text-slate-500 flex-1 truncate">{e.description}</span>}
                  {!e.description && <span className="flex-1" />}
                  <span className={`text-xs ${e.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>{e.enabled ? '启用' : '禁用'}</span>
                  <Button variant="text" size="small" onClick={() => toggleWl(e.id, e.enabled)}>{e.enabled ? '禁用' : '启用'}</Button>
                  <Popconfirm content="确认删除？" onConfirm={() => delWl(e.id)}>
                    <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
                  </Popconfirm>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
