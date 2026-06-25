import React, { useEffect, useState, useCallback } from 'react';
import { Form, Switch, Button, Input, Tag, Space, Popconfirm, MessagePlugin, Divider } from 'tdesign-react';
import { RefreshIcon, AddIcon, DeleteIcon, SecuredIcon } from 'tdesign-icons-react';
import { securityService, PasswordPolicy, IpWhitelistEntry } from '../services/securityService';
import { PageHeader } from '../components/PageHeader';
import { SectionCard } from '../components/SectionCard';

const { FormItem } = Form;

export const SecuritySettings: React.FC = () => {
  const [policy, setPolicy] = useState<PasswordPolicy | null>(null);
  const [whitelist, setWhitelist] = useState<IpWhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wlForm, setWlForm] = useState({ network: '', mask: 24, description: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pres, wres] = await Promise.all([
        securityService.getPasswordPolicy(),
        securityService.getIpWhitelist(),
      ]);
      if (pres.code === 0 && pres.data) {
        setPolicy(pres.data);
      } else {
        setLoadError(pres.message || '获取密码策略失败');
        return;
      }
      if (wres.code === 0 && wres.data) {
        setWhitelist(wres.data);
      }
    } catch (err: any) {
      setLoadError(err?.response?.data?.message || err?.message || '请求失败，请检查服务器日志');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const savePolicy = async (key: keyof PasswordPolicy, value: any) => {
    if (!policy) return;
    const updated = { ...policy, [key]: value };
    setPolicy(updated);
    try {
      await securityService.updatePasswordPolicy({ [key]: value });
      MessagePlugin.success('策略已更新');
    } catch {
      MessagePlugin.error('更新失败');
    }
  };

  const addWhitelist = async () => {
    if (!wlForm.network) { MessagePlugin.warning('请输入网络地址'); return; }
    try {
      const res = await securityService.addIpWhitelist(wlForm);
      if (res.code === 0) {
        MessagePlugin.success('已添加');
        setWlForm({ network: '', mask: 24, description: '' });
        loadData();
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

  if (!policy) {
    return (
      <div>
        <PageHeader title="安全策略" description="配置登录安全规则、密码策略与 IP 访问控制" />
        <div className="content-card flex flex-col items-center justify-center gap-3 h-48">
          {loading ? (
            <p className="text-sm text-slate-500">加载中...</p>
          ) : loadError ? (
            <>
              <p className="text-sm text-red-400">{loadError}</p>
              <Button variant="outline" size="small" icon={<RefreshIcon />} onClick={loadData}>重试</Button>
            </>
          ) : (
            <p className="text-sm text-slate-500">暂无数据</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="安全策略" description="配置登录安全规则、密码策略与 IP 访问控制" />

      <div className="space-y-5">
        {/* ── Password Policy ── */}
        <SectionCard title="密码策略" description="配置复杂度要求、过期规则与历史记录">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormItem label="最小长度" help="8-64 位">
              <Input type="number" value={String(policy.min_length)}
                onChange={(v) => savePolicy('min_length', parseInt(v) || 8)} style={{ width: 120 }} />
            </FormItem>
            <FormItem label="密码过期天数" help="0 = 永不过期">
              <Input type="number" value={String(policy.expire_days)}
                onChange={(v) => savePolicy('expire_days', parseInt(v) || 0)} style={{ width: 120 }} />
            </FormItem>
            <FormItem label="历史记录数量" help="0 = 不限制，最多 20">
              <Input type="number" value={String(policy.history_count)}
                onChange={(v) => savePolicy('history_count', parseInt(v) || 0)} style={{ width: 120 }} />
            </FormItem>
          </div>

          <Divider className="!my-4 !border-white/[0.04]" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-300">必须包含大写字母</span>
              <Switch value={policy.require_upper} onChange={(v) => savePolicy('require_upper', v)} />
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-300">必须包含小写字母</span>
              <Switch value={policy.require_lower} onChange={(v) => savePolicy('require_lower', v)} />
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-300">必须包含数字</span>
              <Switch value={policy.require_digit} onChange={(v) => savePolicy('require_digit', v)} />
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-300">必须包含特殊字符</span>
              <Switch value={policy.require_special} onChange={(v) => savePolicy('require_special', v)} />
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-300">新建用户强制改密</span>
              <Switch value={policy.force_change_on_create} onChange={(v) => savePolicy('force_change_on_create', v)} />
            </div>
          </div>
        </SectionCard>

        {/* ── Brute Force Protection ── */}
        <SectionCard title="防暴力破解" description="CAPTCHA 触发阈值与账号锁定策略">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormItem label="CAPTCHA 触发次数" help="失败 N 次后需要验证码">
              <Input type="number" value={String(policy.captcha_threshold)}
                onChange={(v) => savePolicy('captcha_threshold', parseInt(v) || 3)} style={{ width: 120 }} />
            </FormItem>
            <FormItem label="账号锁定阈值" help="失败 N 次后锁定">
              <Input type="number" value={String(policy.lockout_threshold)}
                onChange={(v) => savePolicy('lockout_threshold', parseInt(v) || 10)} style={{ width: 120 }} />
            </FormItem>
            <FormItem label="锁定时长（分钟）" help="5-1440 分钟">
              <Input type="number" value={String(policy.lockout_minutes)}
                onChange={(v) => savePolicy('lockout_minutes', parseInt(v) || 15)} style={{ width: 120 }} />
            </FormItem>
          </div>
        </SectionCard>

        {/* ── IP Whitelist ── */}
        <SectionCard
          title="IP 白名单"
          description="仅允许列表中的 IP 地址访问登录接口。留空表示不限制。"
          extra={
            <Button variant="outline" size="small" icon={<RefreshIcon />} onClick={loadData}>刷新</Button>
          }
        >
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <FormItem label="网络地址" style={{ marginBottom: 0 }}>
              <Input value={wlForm.network} onChange={(v) => setWlForm({ ...wlForm, network: v })}
                placeholder="如 10.0.0.0" style={{ width: 140 }} />
            </FormItem>
            <FormItem label="掩码" style={{ marginBottom: 0 }}>
              <Input type="number" value={String(wlForm.mask)}
                onChange={(v) => setWlForm({ ...wlForm, mask: parseInt(v) || 24 })} style={{ width: 80 }} />
            </FormItem>
            <FormItem label="备注" style={{ marginBottom: 0 }}>
              <Input value={wlForm.description} onChange={(v) => setWlForm({ ...wlForm, description: v })}
                placeholder="办公网/VPN" style={{ width: 150 }} />
            </FormItem>
            <Button theme="primary" icon={<AddIcon />} onClick={addWhitelist}>添加</Button>
          </div>

          {whitelist.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">暂无白名单规则，所有 IP 均可登录。</p>
          ) : (
            <div className="space-y-2">
              {whitelist.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-3">
                    <code className="text-sm text-cyan-400 font-mono">{entry.network}/{entry.mask}</code>
                    {entry.description && <span className="text-xs text-slate-500">{entry.description}</span>}
                    <Tag theme={entry.enabled ? 'success' : 'default'} variant="light" size="small">
                      {entry.enabled ? '启用' : '禁用'}
                    </Tag>
                  </div>
                  <Space size="small">
                    <Button variant="text" size="small"
                      onClick={() => toggleWhitelist(entry.id, entry.enabled)}>
                      {entry.enabled ? '禁用' : '启用'}
                    </Button>
                    <Popconfirm content="确认删除？" onConfirm={() => deleteWhitelist(entry.id)}>
                      <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
                    </Popconfirm>
                  </Space>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
};
