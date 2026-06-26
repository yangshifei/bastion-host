import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Button, Input, Popconfirm, MessagePlugin, Table, Tag } from 'tdesign-react';
import {
  AddIcon,
  DeleteIcon,
  RefreshIcon,
  SecuredIcon,
  LockOnIcon,
  InternetIcon,
  MailIcon,
  TimeIcon,
} from 'tdesign-icons-react';
import { securityService, PasswordPolicy, IpWhitelistEntry } from '../services/securityService';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { EmptyState } from '../components/EmptyState';
import { RecordingSwitch } from '../components/RecordingSwitch';

const DEFAULT_POLICY: PasswordPolicy = {
  min_length: 8,
  require_upper: true,
  require_lower: true,
  require_digit: true,
  require_special: false,
  expire_days: 90,
  history_count: 5,
  force_change_on_create: true,
  captcha_threshold: 3,
  lockout_threshold: 10,
  lockout_minutes: 15,
  require_mfa: false,
};

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

function buildPolicySummary(policy: PasswordPolicy): string[] {
  const parts = [`至少 ${policy.min_length} 位`];
  if (policy.require_upper) parts.push('大写字母');
  if (policy.require_lower) parts.push('小写字母');
  if (policy.require_digit) parts.push('数字');
  if (policy.require_special) parts.push('特殊字符');
  return parts;
}

function policyStrengthScore(policy: PasswordPolicy): number {
  let score = 0;
  if (policy.min_length >= 12) score += 25;
  else if (policy.min_length >= 10) score += 15;
  else score += 8;
  if (policy.require_upper) score += 15;
  if (policy.require_lower) score += 15;
  if (policy.require_digit) score += 15;
  if (policy.require_special) score += 20;
  if (policy.expire_days > 0 && policy.expire_days <= 90) score += 10;
  if (policy.history_count >= 3) score += 10;
  return Math.min(score, 100);
}

function strengthLabel(score: number): { text: string; accent: 'green' | 'amber' | 'red' | 'cyan' } {
  if (score >= 80) return { text: '强', accent: 'green' };
  if (score >= 55) return { text: '中', accent: 'amber' };
  return { text: '弱', accent: 'red' };
}

const SettingRow: React.FC<{
  label: string;
  desc?: string;
  children: React.ReactNode;
}> = ({ label, desc, children }) => (
  <div className="security-setting-row">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
      {desc && <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{desc}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const NumberInput: React.FC<{
  value: number;
  min: number;
  max: number;
  width?: number;
  onCommit: (value: number) => void;
}> = ({ value, min, max, width = 80, onCommit }) => {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isNaN(n) || n < min || n > max) {
      setDraft(String(value));
      MessagePlugin.warning(`请输入 ${min}–${max} 之间的数值`);
      return;
    }
    if (n !== value) {
      onCommit(n);
    }
  };

  return (
    <Input
      type="number"
      value={draft}
      onChange={(v) => setDraft(v)}
      onBlur={commit}
      onEnter={commit}
      style={{ width }}
    />
  );
};

const PanelHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  desc?: string;
}> = ({ icon, title, desc }) => (
  <div className="section-header">
    <div className="flex items-center gap-3 min-w-0">
      <div className="quick-action-icon !w-9 !h-9">{icon}</div>
      <div className="min-w-0">
        <div className="section-title">{title}</div>
        {desc && <div className="section-desc">{desc}</div>}
      </div>
    </div>
  </div>
);

export const SecuritySettings: React.FC = () => {
  const [policy, setPolicy] = useState<PasswordPolicy>(DEFAULT_POLICY);
  const [whitelist, setWhitelist] = useState<IpWhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [wlForm, setWlForm] = useState({ network: '', mask: '24', description: '' });
  const [addingWl, setAddingWl] = useState(false);
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, user: '', password: '', from_address: '' });
  const [smtpSaving, setSmtpSaving] = useState(false);

  const loadSmtp = useCallback(async () => {
    try {
      const res = await securityService.getSmtpConfig();
      if (res.code === 0 && res.data) setSmtpForm({ ...smtpForm, ...res.data, password: '' });
    } catch { /* ignore */ }
  }, []);

  const saveSmtp = async () => {
    if (!smtpForm.host) { MessagePlugin.warning('请输入 SMTP 服务器'); return; }
    setSmtpSaving(true);
    try {
      const res = await securityService.updateSmtpConfig(smtpForm);
      if (res.code === 0) { MessagePlugin.success('SMTP 配置已保存'); setSmtpForm(p => ({ ...p, password: '' })); }
      else MessagePlugin.error(res.message || '保存失败');
    } catch { MessagePlugin.error('保存失败'); }
    finally { setSmtpSaving(false); }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const p = await securityService.getPasswordPolicy();
      if (p.code === 0 && p.data) setPolicy(p.data);
    } catch {
      /* defaults */
    }
    try {
      const w = await securityService.getIpWhitelist();
      if (w.code === 0 && w.data) setWhitelist(w.data);
    } catch {
      /* optional */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadSmtp();
  }, [load, loadSmtp]);

  const update = async (k: keyof PasswordPolicy, v: boolean | number) => {
    if (policy[k] === v) return;
    setPolicy((p) => ({ ...p, [k]: v }));
    setSavingKey(String(k));
    try {
      const res = await securityService.updatePasswordPolicy({ [k]: v });
      if (res.code === 0) {
        MessagePlugin.success('已保存');
      } else {
        throw new Error(res.message);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : '保存失败');
      MessagePlugin.error(msg);
      load(true);
    } finally {
      setSavingKey(null);
    }
  };

  const addWl = async () => {
    const network = wlForm.network.trim();
    const mask = parseInt(wlForm.mask, 10);
    if (!network) {
      MessagePlugin.warning('请输入网络地址');
      return;
    }
    if (!CIDR_RE.test(network)) {
      MessagePlugin.warning('网络地址格式不正确，如 10.0.0.0');
      return;
    }
    if (Number.isNaN(mask) || mask < 0 || mask > 32) {
      MessagePlugin.warning('CIDR 掩码应为 0–32');
      return;
    }

    setAddingWl(true);
    try {
      const r = await securityService.addIpWhitelist({
        network,
        mask,
        description: wlForm.description.trim() || undefined,
      });
      if (r.code === 0) {
        MessagePlugin.success('已添加');
        setWlForm({ network: '', mask: '24', description: '' });
        load(true);
      } else {
        MessagePlugin.error(r.message || '添加失败');
      }
    } catch {
      MessagePlugin.error('添加失败');
    } finally {
      setAddingWl(false);
    }
  };

  const delWl = async (id: number) => {
    try {
      await securityService.deleteIpWhitelist(id);
      MessagePlugin.success('已删除');
      load(true);
    } catch {
      MessagePlugin.error('删除失败');
    }
  };

  const toggleWl = async (id: number, en: boolean) => {
    try {
      const r = await securityService.updateIpWhitelist(id, { enabled: !en });
      if (r.code === 0) {
        MessagePlugin.success(en ? '已禁用' : '已启用');
        load(true);
      }
    } catch {
      MessagePlugin.error('操作失败');
    }
  };

  const policySummary = useMemo(() => buildPolicySummary(policy), [policy]);
  const strength = useMemo(() => policyStrengthScore(policy), [policy]);
  const strengthInfo = strengthLabel(strength);
  const enabledWlCount = whitelist.filter((e) => e.enabled).length;

  const wlColumns = [
    {
      colKey: 'network',
      title: '网段',
      width: 160,
      cell: ({ row }: { row: IpWhitelistEntry }) => (
        <code className="mono text-sm text-cyan-400">
          {row.network}/{row.mask}
        </code>
      ),
    },
    {
      colKey: 'description',
      title: '备注',
      ellipsis: true,
      cell: ({ row }: { row: IpWhitelistEntry }) => (
        <span className="text-[var(--text-secondary)]">{row.description || '—'}</span>
      ),
    },
    {
      colKey: 'enabled',
      title: '状态',
      width: 90,
      cell: ({ row }: { row: IpWhitelistEntry }) => (
        <Tag theme={row.enabled ? 'success' : 'default'} variant="light" size="small">
          {row.enabled ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 120,
      cell: ({ row }: { row: IpWhitelistEntry }) => (
        <div className="flex items-center gap-1">
          <Button variant="text" size="small" onClick={() => toggleWl(row.id, row.enabled)}>
            {row.enabled ? '禁用' : '启用'}
          </Button>
          <Popconfirm content="确认删除此规则？" onConfirm={() => delWl(row.id)}>
            <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
          </Popconfirm>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="page-content">
        <PageHeader title="安全策略" description="密码规则、登录保护与 IP 访问控制" />
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="page-content">
      <PageHeader title="安全策略" description="密码规则、登录保护与 IP 访问控制">
        <Button
          variant="outline"
          icon={<RefreshIcon className={refreshing ? 'animate-spin' : ''} />}
          loading={refreshing}
          onClick={() => load(true)}
        >
          刷新
        </Button>
      </PageHeader>

      {/* Overview stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <StatCard
          title="密码强度"
          value={strengthInfo.text}
          subtitle={`策略评分 ${strength}/100 · ${policySummary.join('、')}`}
          icon={<SecuredIcon size="20px" />}
          accent={strengthInfo.accent}
        />
        <StatCard
          title="登录保护"
          value={`${policy.captcha_threshold} / ${policy.lockout_threshold}`}
          subtitle={`验证码 ${policy.captcha_threshold} 次 · 锁定 ${policy.lockout_threshold} 次 / ${policy.lockout_minutes} 分钟`}
          icon={<LockOnIcon size="20px" />}
          accent="amber"
        />
        <StatCard
          title="IP 白名单"
          value={whitelist.length === 0 ? '未限制' : `${enabledWlCount}/${whitelist.length}`}
          subtitle={
            whitelist.length === 0
              ? '当前所有 IP 均可登录'
              : `${enabledWlCount} 条规则生效中`
          }
          icon={<InternetIcon size="20px" />}
          accent={whitelist.length === 0 ? 'blue' : 'green'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Password complexity */}
        <div className="content-card overflow-hidden">
          <PanelHeader
            icon={<SecuredIcon size="18px" />}
            title="密码复杂度"
            desc="控制用户密码的组成要求"
          />
          <div className="security-policy-preview">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {policySummary.map((item) => (
                <Tag key={item} theme="primary" variant="light" size="small">
                  {item}
                </Tag>
              ))}
            </div>
            <div className="security-strength-bar">
              <div className="security-strength-fill" style={{ width: `${strength}%` }} />
            </div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1.5">
              策略强度 {strength}/100
              {savingKey && <span className="ml-2 text-cyan-400">保存中...</span>}
            </div>
          </div>
          <SettingRow label="密码最小长度" desc="8–64 位，建议 12 位以上">
            <NumberInput
              value={policy.min_length}
              min={8}
              max={64}
              width={96}
              onCommit={(n) => update('min_length', n)}
            />
          </SettingRow>
          <SettingRow label="必须包含大写字母" desc="至少一个大写英文字母 (A-Z)">
            <RecordingSwitch
              size="small"
              value={policy.require_upper}
              onChange={(v) => update('require_upper', v)}
            />
          </SettingRow>
          <SettingRow label="必须包含小写字母" desc="至少一个小写英文字母 (a-z)">
            <RecordingSwitch
              size="small"
              value={policy.require_lower}
              onChange={(v) => update('require_lower', v)}
            />
          </SettingRow>
          <SettingRow label="必须包含数字" desc="至少一个阿拉伯数字 (0-9)">
            <RecordingSwitch
              size="small"
              value={policy.require_digit}
              onChange={(v) => update('require_digit', v)}
            />
          </SettingRow>
          <SettingRow label="必须包含特殊字符" desc="如 !@#$%^&* 等符号">
            <RecordingSwitch
              size="small"
              value={policy.require_special}
              onChange={(v) => update('require_special', v)}
            />
          </SettingRow>
        </div>

        {/* Password lifecycle + login protection */}
        <div className="flex flex-col gap-5">
          <div className="content-card overflow-hidden">
            <PanelHeader
              icon={<TimeIcon size="18px" />}
              title="密码生命周期"
              desc="过期与历史密码限制"
            />
            <SettingRow label="密码过期时间" desc="0 表示永不过期">
              <div className="flex items-center gap-2">
                <NumberInput
                  value={policy.expire_days}
                  min={0}
                  max={365}
                  onCommit={(n) => update('expire_days', n)}
                />
                <span className="text-xs text-[var(--text-muted)]">天</span>
              </div>
            </SettingRow>
            <SettingRow label="密码历史记录" desc="不可重复使用最近 N 次密码，0 为不限制">
              <div className="flex items-center gap-2">
                <NumberInput
                  value={policy.history_count}
                  min={0}
                  max={20}
                  onCommit={(n) => update('history_count', n)}
                />
                <span className="text-xs text-[var(--text-muted)]">次</span>
              </div>
            </SettingRow>
            <SettingRow label="首次登录修改密码" desc="新用户首次登录必须修改初始密码">
              <RecordingSwitch
                size="small"
                value={policy.force_change_on_create}
                onChange={(v) => update('force_change_on_create', v)}
              />
            </SettingRow>
            <SettingRow label="强制 MFA 认证" desc="用户必须绑定多因素认证后才能使用系统功能">
              <RecordingSwitch
                size="small"
                value={policy.require_mfa}
                onChange={(v) => update('require_mfa', v)}
              />
            </SettingRow>
          </div>

          <div className="content-card overflow-hidden">
            <PanelHeader
              icon={<LockOnIcon size="18px" />}
              title="登录保护"
              desc="防暴力破解与账号锁定"
            />
            <SettingRow label="验证码触发阈值" desc="连续失败后需输入验证码（1–10 次）">
              <div className="flex items-center gap-2">
                <NumberInput
                  value={policy.captcha_threshold}
                  min={1}
                  max={10}
                  onCommit={(n) => update('captcha_threshold', n)}
                />
                <span className="text-xs text-[var(--text-muted)]">次</span>
              </div>
            </SettingRow>
            <SettingRow label="账号锁定阈值" desc="累计失败达到此次数后锁定账号">
              <div className="flex items-center gap-2">
                <NumberInput
                  value={policy.lockout_threshold}
                  min={5}
                  max={20}
                  onCommit={(n) => update('lockout_threshold', n)}
                />
                <span className="text-xs text-[var(--text-muted)]">次</span>
              </div>
            </SettingRow>
            <SettingRow label="账号锁定时长" desc="锁定后需等待的时间">
              <div className="flex items-center gap-2">
                <NumberInput
                  value={policy.lockout_minutes}
                  min={5}
                  max={1440}
                  onCommit={(n) => update('lockout_minutes', n)}
                />
                <span className="text-xs text-[var(--text-muted)]">分钟</span>
              </div>
            </SettingRow>
          </div>
        </div>
      </div>

      {/* MFA policy */}
      <div className="content-card overflow-hidden mt-5">
        <PanelHeader
          icon={<SecuredIcon size="18px" />}
          title="MFA 策略"
          desc="全局多因素认证要求（用户绑定 MFA 仍在个人中心完成）"
        />
        <SettingRow
          label="强制全员启用 MFA"
          desc="开启后，未绑定 MFA 的用户登录后须先完成 MFA 设置才能使用系统"
        >
          <RecordingSwitch
            size="small"
            value={policy.require_mfa}
            onChange={(v) => update('require_mfa', v)}
          />
        </SettingRow>
      </div>

      {/* SMTP config */}
      <div className="content-card overflow-hidden mt-5">
        <PanelHeader
          icon={<MailIcon size="18px" />}
          title="邮件服务 (SMTP)"
          desc="配置后可使用邮箱验证码 MFA。留空则不启用。"
        />
        <div className="section-body border-b border-[var(--border-subtle)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <div className="info-label mb-1.5">SMTP 服务器</div>
              <Input value={smtpForm.host} onChange={v => setSmtpForm(p => ({ ...p, host: v }))} placeholder="smtp.qq.com" />
            </div>
            <div>
              <div className="info-label mb-1.5">端口</div>
              <Input value={String(smtpForm.port)} onChange={v => setSmtpForm(p => ({ ...p, port: parseInt(v) || 587 }))} placeholder="587" style={{ width: 100 }} />
            </div>
            <div>
              <div className="info-label mb-1.5">发件邮箱 (也是登录账号)</div>
              <Input value={smtpForm.from_address} onChange={v => setSmtpForm(p => ({ ...p, from_address: v, user: v }))} placeholder="bastion@qq.com" />
            </div>
            <div>
              <div className="info-label mb-1.5">授权码</div>
              <Input type="password" value={smtpForm.password} onChange={v => setSmtpForm(p => ({ ...p, password: v }))} placeholder="QQ邮箱需填授权码" />
            </div>
            <div>
              <Button theme="primary" loading={smtpSaving} onClick={saveSmtp}>保存</Button>
            </div>
          </div>
        </div>
      </div>

      {/* IP whitelist */}
      <div className="content-card overflow-hidden mt-5">
        <PanelHeader
          icon={<InternetIcon size="18px" />}
          title="IP 访问控制"
          desc="仅允许白名单网段登录，留空则不限制"
        />
        <div className="section-body border-b border-[var(--border-subtle)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div>
              <div className="info-label mb-1.5">网络地址</div>
              <Input
                value={wlForm.network}
                onChange={(v) => setWlForm((p) => ({ ...p, network: v }))}
                placeholder="10.0.0.0"
                onEnter={addWl}
              />
            </div>
            <div>
              <div className="info-label mb-1.5">CIDR 掩码</div>
              <Input
                value={wlForm.mask}
                onChange={(v) => setWlForm((p) => ({ ...p, mask: v }))}
                placeholder="24"
                onEnter={addWl}
              />
            </div>
            <div>
              <div className="info-label mb-1.5">备注</div>
              <Input
                value={wlForm.description}
                onChange={(v) => setWlForm((p) => ({ ...p, description: v }))}
                placeholder="如：办公网段"
                onEnter={addWl}
              />
            </div>
            <Button theme="primary" icon={<AddIcon />} loading={addingWl} onClick={addWl}>
              添加规则
            </Button>
          </div>
        </div>
        {whitelist.length > 0 ? (
          <Table
            data={whitelist}
            columns={wlColumns}
            rowKey="id"
            hover
            stripe
            size="small"
          />
        ) : (
          <EmptyState
            icon={<InternetIcon size="22px" className="text-slate-500" />}
            title="暂无 IP 白名单"
            description="未配置时所有 IP 均可登录。添加规则后将仅允许指定网段访问。"
          />
        )}
      </div>
    </div>
  );
};
