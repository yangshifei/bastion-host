import React, { useEffect, useState, useCallback } from 'react';
import { Switch, Button, Input, Popconfirm, MessagePlugin } from 'tdesign-react';
import { AddIcon, DeleteIcon } from 'tdesign-icons-react';
import { securityService, PasswordPolicy, IpWhitelistEntry } from '../services/securityService';
import { PageHeader } from '../components/PageHeader';

const DEFAULT_POLICY: PasswordPolicy = {
  min_length: 8, require_upper: true, require_lower: true, require_digit: true,
  require_special: false, expire_days: 90, history_count: 5,
  force_change_on_create: true, captcha_threshold: 3,
  lockout_threshold: 10, lockout_minutes: 15,
};

// ── Reusable setting row ──
const SettingRow: React.FC<{
  label: string; desc?: string; children: React.ReactNode;
}> = ({ label, desc, children }) => (
  <div className="flex items-center justify-between py-3.5 px-5 border-b border-[var(--border-subtle)] last:border-b-0 gap-4">
    <div className="min-w-0 text-sm">
      <span className="font-medium text-[var(--text-primary)]">{label}</span>
      {desc && <span className="text-[var(--text-muted)] ml-2">{desc}</span>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-page)] border-b border-[var(--border-subtle)]">
    {children}
  </div>
);

export const SecuritySettings: React.FC = () => {
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);
  const [whitelist, setWhitelist] = useState<IpWhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [wlForm, setWlForm] = useState({ network: '', mask: '24', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = await securityService.getPasswordPolicy();
      if (p.code === 0 && p.data) setPolicy(p.data);
    } catch { /* defaults */ }
    try {
      const w = await securityService.getIpWhitelist();
      if (w.code === 0 && w.data) setWhitelist(w.data);
    } catch { /* optional */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = async (k: keyof PasswordPolicy, v: any) => {
    setPolicy(p => ({ ...p, [k]: v }));
    try { await securityService.updatePasswordPolicy({ [k]: v }); }
    catch { MessagePlugin.error('保存失败'); load(); }
  };

  const addWl = async () => {
    if (!wlForm.network) { MessagePlugin.warning('请输入网络地址'); return; }
    const r = await securityService.addIpWhitelist({ network: wlForm.network, mask: parseInt(wlForm.mask) || 24, description: wlForm.description || undefined });
    if (r.code === 0) { MessagePlugin.success('已添加'); setWlForm({ network: '', mask: '24', description: '' }); load(); }
    else MessagePlugin.error(r.message || '添加失败');
  };

  const delWl = async (id: number) => { await securityService.deleteIpWhitelist(id); load(); };
  const toggleWl = async (id: number, en: boolean) => { await securityService.updateIpWhitelist(id, { enabled: !en }); load(); };

  if (loading) {
    return (
      <div>
        <PageHeader title="安全策略" description="密码规则、登录保护与 IP 访问控制" />
        <div className="content-card flex items-center justify-center h-32">
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="安全策略" description="密码规则、登录保护与 IP 访问控制" />

      <div className="content-card overflow-hidden">
        {/* ═══════ 密码复杂度 ═══════ */}
        <SectionTitle>密码复杂度</SectionTitle>
        <SettingRow label="密码最小长度" desc="8–64 位，默认 8 位">
          <Input type="number" value={String(policy.min_length)} onChange={v => { const n = parseInt(v); if (n >= 8 && n <= 64) update('min_length', n); }}
            style={{ width: 100 }} />
        </SettingRow>
        <SettingRow label="必须包含大写字母" desc="密码中至少包含一个大写英文字母 (A-Z)">
          <Switch size="small" value={policy.require_upper} onChange={v => update('require_upper', v)} />
        </SettingRow>
        <SettingRow label="必须包含小写字母" desc="密码中至少包含一个小写英文字母 (a-z)">
          <Switch size="small" value={policy.require_lower} onChange={v => update('require_lower', v)} />
        </SettingRow>
        <SettingRow label="必须包含数字" desc="密码中至少包含一个阿拉伯数字 (0-9)">
          <Switch size="small" value={policy.require_digit} onChange={v => update('require_digit', v)} />
        </SettingRow>
        <SettingRow label="必须包含特殊字符" desc="密码中至少包含一个特殊字符 (!@#$%^&* 等)">
          <Switch size="small" value={policy.require_special} onChange={v => update('require_special', v)} />
        </SettingRow>

        {/* ═══════ 密码生命周期 ═══════ */}
        <SectionTitle>密码生命周期</SectionTitle>
        <SettingRow label="密码过期时间" desc="超过此天数后强制修改密码，0 表示永不过期">
          <div className="flex items-center gap-2">
            <Input type="number" value={String(policy.expire_days)} onChange={v => { const n = parseInt(v); if (n >= 0 && n <= 365) update('expire_days', n); }}
              style={{ width: 80 }} />
            <span className="text-xs text-slate-500">天</span>
          </div>
        </SettingRow>
        <SettingRow label="密码历史记录" desc="不能使用最近 N 次使用过的密码，0 表示不限制">
          <div className="flex items-center gap-2">
            <Input type="number" value={String(policy.history_count)} onChange={v => { const n = parseInt(v); if (n >= 0 && n <= 20) update('history_count', n); }}
              style={{ width: 80 }} />
            <span className="text-xs text-slate-500">次</span>
          </div>
        </SettingRow>
        <SettingRow label="首次登录修改密码" desc="管理员创建新用户后，用户首次登录时必须修改初始密码">
          <Switch size="small" value={policy.force_change_on_create} onChange={v => update('force_change_on_create', v)} />
        </SettingRow>

        {/* ═══════ 登录保护 ═══════ */}
        <SectionTitle>登录保护</SectionTitle>
        <SettingRow label="验证码触发阈值" desc="连续登录失败达到此次数后，需要输入验证码才能继续尝试">
          <div className="flex items-center gap-2">
            <Input type="number" value={String(policy.captcha_threshold)} onChange={v => { const n = parseInt(v); if (n >= 1 && n <= 10) update('captcha_threshold', n); }}
              style={{ width: 80 }} />
            <span className="text-xs text-slate-500">次</span>
          </div>
        </SettingRow>
        <SettingRow label="账号锁定阈值" desc="累计登录失败达到此次数后，账号将被临时锁定">
          <div className="flex items-center gap-2">
            <Input type="number" value={String(policy.lockout_threshold)} onChange={v => { const n = parseInt(v); if (n >= 5 && n <= 20) update('lockout_threshold', n); }}
              style={{ width: 80 }} />
            <span className="text-xs text-slate-500">次</span>
          </div>
        </SettingRow>
        <SettingRow label="账号锁定时长" desc="账号被锁定后，需要等待的时间">
          <div className="flex items-center gap-2">
            <Input type="number" value={String(policy.lockout_minutes)} onChange={v => { const n = parseInt(v); if (n >= 5) update('lockout_minutes', n); }}
              style={{ width: 80 }} />
            <span className="text-xs text-slate-500">分钟</span>
          </div>
        </SettingRow>

        {/* ═══════ IP 访问控制 ═══════ */}
        <SectionTitle>IP 访问控制</SectionTitle>
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1.5">网络地址</div>
              <Input value={wlForm.network} onChange={v => setWlForm(p => ({ ...p, network: v }))} placeholder="如 10.0.0.0" style={{ width: 140 }} />
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1.5">CIDR 掩码</div>
              <Input value={wlForm.mask} onChange={v => setWlForm(p => ({ ...p, mask: v }))} placeholder="24" style={{ width: 80 }} />
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)] mb-1.5">备注</div>
              <Input value={wlForm.description} onChange={v => setWlForm(p => ({ ...p, description: v }))} placeholder="可选" style={{ width: 140 }} />
            </div>
            <Button theme="primary" icon={<AddIcon />} onClick={addWl} style={{ marginBottom: 0 }}>添加</Button>
          </div>
        </div>
        {whitelist.length > 0 && (
          <div className="px-5 py-2">
            {whitelist.map(e => (
              <div key={e.id} className="flex items-center gap-4 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0">
                <code className="text-sm font-mono text-[var(--accent)] w-[130px] shrink-0">{e.network}/{e.mask}</code>
                <span className="text-xs text-[var(--text-muted)] flex-1 truncate">{e.description || '—'}</span>
                <span className={`text-xs w-10 ${e.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>{e.enabled ? '启用' : '禁用'}</span>
                <div className="flex items-center gap-1">
                  <Button variant="text" size="small" onClick={() => toggleWl(e.id, e.enabled)}>{e.enabled ? '禁用' : '启用'}</Button>
                  <Popconfirm content="确认删除？" onConfirm={() => delWl(e.id)}>
                    <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
        )}
        {whitelist.length === 0 && (
          <div className="px-5 py-6 text-center text-xs text-slate-500">暂无 IP 白名单规则，所有 IP 均可登录</div>
        )}
      </div>
    </div>
  );
};
