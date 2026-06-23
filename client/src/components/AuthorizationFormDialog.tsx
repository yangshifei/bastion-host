import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  Form,
  Select,
  DatePicker,
  Tag,
  Button,
  MessagePlugin,
  Alert,
} from 'tdesign-react';
import { UserIcon, ServerIcon, TimeIcon } from 'tdesign-icons-react';
import { authorizationService } from '../services/authorizationService';
import type { Authorization, SafeUser, SafeAsset } from '../types';
import { AUTHZ_STATUS_LABELS, formatDateTime } from '../utils/auditLabels';

const { FormItem } = Form;

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  auditor: '审计员',
  operator: '操作员',
};

const TIME_PRESETS = [
  { label: '7 天', days: 7, hint: '临时访问' },
  { label: '30 天', days: 30, hint: '常用' },
  { label: '90 天', days: 90, hint: '季度' },
  { label: '1 年', days: 365, hint: '长期' },
  { label: '永久', days: null, hint: '无过期' },
] as const;

type PresetKey = number | 'forever' | 'custom' | null;

const DATE_PICKER_POPUP = { attach: () => document.body };

function formatDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDatePickerValue(dt?: string): string {
  if (!dt) return '';
  return dt.slice(0, 10);
}

function toStartDateTime(date: string): string {
  return date ? `${date} 00:00:00` : '';
}

function toEndDateTime(date: string): string {
  return date ? `${date} 23:59:59` : '';
}

function formatAuthDateTime(dt?: string): string {
  if (!dt) return '';
  const datePart = dt.slice(0, 10);
  if (dt.endsWith('00:00:00') || dt.endsWith('23:59:59')) return datePart;
  return formatDateTime(dt);
}

function computePreviewStatus(start?: string, end?: string): string {
  const now = new Date();
  if (end && new Date(end) < now) return 'expired';
  if (start && new Date(start) > now) return 'pending';
  return 'active';
}

function getDurationText(start?: string, end?: string): string | null {
  if (!start && !end) return null;
  if (!end) return '永久有效';
  const startDate = start ? new Date(start) : new Date();
  const endDate = new Date(end);
  const ms = endDate.getTime() - startDate.getTime();
  if (ms <= 0) return null;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days === 1) return '1 天';
  if (days < 30) return `${days} 天`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return months === 1 ? '约 1 个月' : `约 ${months} 个月`;
  }
  const years = (days / 365).toFixed(1).replace(/\.0$/, '');
  return `约 ${years} 年`;
}

interface Props {
  visible: boolean;
  editingAuthz: Authorization | null;
  users: SafeUser[];
  assets: SafeAsset[];
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthorizationFormDialog: React.FC<Props> = ({
  visible,
  editingAuthz,
  users,
  assets,
  onClose,
  onSuccess,
}) => {
  const isEdit = !!editingAuthz;
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<number | undefined>();
  const [assetIds, setAssetIds] = useState<number[]>([]);
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [protocolFilter, setProtocolFilter] = useState<'all' | 'ssh' | 'rdp'>('all');
  const [activePreset, setActivePreset] = useState<PresetKey>(null);
  const [authorizedPairs, setAuthorizedPairs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;

    if (editingAuthz) {
      setUserId(editingAuthz.user_id);
      setAssetIds([editingAuthz.asset_id]);
      setStartTime(editingAuthz.start_time || '');
      setEndTime(editingAuthz.end_time || '');
      setActivePreset(null);
    } else {
      setUserId(undefined);
      setAssetIds([]);
      setStartTime('');
      setEndTime('');
      setActivePreset(null);
      setProtocolFilter('all');

      authorizationService.getPairs().then((res) => {
        if (res.code === 0 && res.data) {
          setAuthorizedPairs(new Set(res.data.map((p) => `${p.user_id}-${p.asset_id}`)));
        }
      });
    }
  }, [visible, editingAuthz]);

  const eligibleUsers = useMemo(
    () => users.filter((u) => u.status === 'active' && u.role !== 'admin'),
    [users]
  );

  const filteredAssets = useMemo(() => {
    if (protocolFilter === 'all') return assets;
    return assets.filter((a) => a.protocol === protocolFilter);
  }, [assets, protocolFilter]);

  const assetOptions = useMemo(
    () =>
      filteredAssets.map((a) => {
        const key = userId ? `${userId}-${a.id}` : '';
        const alreadyAuth = key && authorizedPairs.has(key);
        return {
          value: a.id,
          label: `${a.name} (${a.host}:${a.port})`,
          disabled: !!alreadyAuth,
          content: (
            <div className="flex items-center justify-between gap-2 w-full">
              <span className={alreadyAuth ? 'text-slate-500' : ''}>
                {a.name}{' '}
                <span className="text-slate-500 text-xs">{a.host}:{a.port}</span>
              </span>
              <span className="flex items-center gap-1 shrink-0">
                <Tag theme={a.protocol === 'ssh' ? 'primary' : 'warning'} variant="light" size="small">
                  {a.protocol.toUpperCase()}
                </Tag>
                {alreadyAuth && (
                  <Tag theme="default" variant="light" size="small">已授权</Tag>
                )}
              </span>
            </div>
          ),
        };
      }),
    [filteredAssets, userId, authorizedPairs]
  );

  const selectedUser = users.find((u) => u.id === userId);
  const selectedAssets = assets.filter((a) => assetIds.includes(a.id));
  const previewStatus = computePreviewStatus(startTime || undefined, endTime || undefined);
  const durationText = getDurationText(startTime || undefined, endTime || undefined);
  const hasTimeRange = !!(startTime || endTime);

  const applyPreset = (days: number | null) => {
    const now = new Date();
    if (days === null) {
      setStartTime('');
      setEndTime('');
      setActivePreset('forever');
    } else {
      const startDate = formatDateOnly(now);
      const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      setStartTime(toStartDateTime(startDate));
      setEndTime(toEndDateTime(formatDateOnly(end)));
      setActivePreset(days);
    }
  };

  const clearTimeRange = () => {
    setStartTime('');
    setEndTime('');
    setActivePreset(null);
  };

  const handleSelectAllFiltered = () => {
    const available = filteredAssets
      .filter((a) => !userId || !authorizedPairs.has(`${userId}-${a.id}`))
      .map((a) => a.id);
    setAssetIds(available);
  };

  const handleClearAssets = () => setAssetIds([]);

  const handleSave = async () => {
    if (isEdit && editingAuthz) {
      if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
        MessagePlugin.warning('生效时间必须早于过期时间');
        return;
      }
      setSaving(true);
      try {
        await authorizationService.update(editingAuthz.id, {
          start_time: startTime || null,
          end_time: endTime || null,
        });
        MessagePlugin.success('授权更新成功');
        onSuccess();
        onClose();
      } catch (err: any) {
        MessagePlugin.error(err.response?.data?.message || '更新失败');
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!userId) {
      MessagePlugin.warning('请选择用户');
      return;
    }
    if (assetIds.length === 0) {
      MessagePlugin.warning('请至少选择一个资产');
      return;
    }
    if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
      MessagePlugin.warning('生效时间必须早于过期时间');
      return;
    }

    setSaving(true);
    try {
      const res = await authorizationService.batchCreate({
        user_id: userId,
        asset_ids: assetIds,
        start_time: startTime || undefined,
        end_time: endTime || undefined,
      });
      if (res.code === 0) {
        const skipped = res.data?.skipped || 0;
        MessagePlugin.success(
          skipped > 0
            ? `成功创建 ${res.data?.created} 条授权，跳过 ${skipped} 条已存在记录`
            : `成功创建 ${res.data?.created ?? assetIds.length} 条授权`
        );
        onSuccess();
        onClose();
      } else {
        MessagePlugin.error(res.message || '创建失败');
      }
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      visible={visible}
      header={isEdit ? '编辑授权' : '添加授权'}
      width={640}
      confirmBtn={{ content: isEdit ? '保存' : '确认授权', loading: saving }}
      onClose={onClose}
      onConfirm={handleSave}
    >
      <div className="space-y-5">
        {!isEdit && (
          <Alert theme="info" message="管理员拥有全部资产访问权限，无需单独授权。支持一次为同一用户授权多个资产。" />
        )}

        {isEdit && editingAuthz ? (
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <UserIcon size="16px" className="text-cyan-400" />
              <span className="text-slate-400">用户</span>
              <span className="text-slate-200 font-medium">{editingAuthz.user_username}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ServerIcon size="16px" className="text-cyan-400" />
              <span className="text-slate-400">资产</span>
              <span className="text-slate-200 font-medium">{editingAuthz.asset_name}</span>
              <span className="text-slate-500">({editingAuthz.asset_host})</span>
            </div>
          </div>
        ) : (
          <Form labelAlign="top">
            <FormItem label="授权用户" requiredMark>
              <Select
                value={userId}
                onChange={(v) => {
                  setUserId(v as number);
                  setAssetIds([]);
                }}
                filterable
                placeholder="选择需要授权的操作员或审计员"
                options={eligibleUsers.map((u) => ({
                  value: u.id,
                  label: u.username,
                  content: (
                    <div className="flex items-center justify-between w-full">
                      <span>{u.username}</span>
                      <Tag theme="default" variant="light" size="small">
                        {ROLE_LABELS[u.role] || u.role}
                      </Tag>
                    </div>
                  ),
                }))}
              />
            </FormItem>

            <FormItem
              label={
                <div className="flex items-center justify-between w-full">
                  <span>授权资产</span>
                  <span className="text-xs text-slate-500 font-normal">
                    已选 {assetIds.length} 项
                  </span>
                </div>
              }
              requiredMark
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(['all', 'ssh', 'rdp'] as const).map((p) => (
                    <Button
                      key={p}
                      size="small"
                      variant={protocolFilter === p ? 'base' : 'outline'}
                      theme={protocolFilter === p ? 'primary' : 'default'}
                      onClick={() => setProtocolFilter(p)}
                    >
                      {p === 'all' ? '全部' : p.toUpperCase()}
                    </Button>
                  ))}
                  <div className="flex-1" />
                  <Button size="small" variant="text" onClick={handleSelectAllFiltered} disabled={!userId}>
                    全选可用
                  </Button>
                  <Button size="small" variant="text" onClick={handleClearAssets}>
                    清空
                  </Button>
                </div>

                <Select
                  value={assetIds}
                  onChange={(v) => setAssetIds(v as number[])}
                  multiple
                  filterable
                  placeholder={userId ? '选择要授权的资产（可多选）' : '请先选择用户'}
                  disabled={!userId}
                  options={assetOptions}
                  minCollapsedNum={2}
                />
              </div>
            </FormItem>
          </Form>
        )}

        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <TimeIcon size="14px" className="text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-200">授权时效</p>
                <p className="text-xs text-slate-500">设置访问生效与过期时间</p>
              </div>
            </div>
            {hasTimeRange && (
              <Button size="small" variant="text" theme="default" onClick={clearTimeRange}>
                重置
              </Button>
            )}
          </div>

          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-2.5">快捷选择</p>
              <div className="grid grid-cols-5 gap-2">
                {TIME_PRESETS.map((p) => {
                  const key = p.days === null ? 'forever' : p.days;
                  const isActive = activePreset === key;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyPreset(p.days)}
                      className={[
                        'flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-lg border transition-all duration-200',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40',
                        isActive
                          ? 'border-cyan-500/50 bg-cyan-500/10 shadow-[0_0_12px_rgba(6,182,212,0.12)]'
                          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15] hover:bg-white/[0.04]',
                      ].join(' ')}
                    >
                      <span className={`text-sm font-medium ${isActive ? 'text-cyan-300' : 'text-slate-200'}`}>
                        {p.label}
                      </span>
                      <span className="text-[10px] text-slate-500">{p.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-xs text-slate-600 shrink-0">或自定义时间</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>

            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
              <Form labelAlign="top">
                <FormItem label="生效日期">
                  <DatePicker
                    value={toDatePickerValue(startTime)}
                    onChange={(v) => {
                      setStartTime(toStartDateTime(String(v || '')));
                      setActivePreset('custom');
                    }}
                    placeholder="留空表示立即生效"
                    clearable
                    style={{ width: '100%' }}
                    popupProps={DATE_PICKER_POPUP}
                  />
                </FormItem>
                <FormItem label="过期日期">
                  <DatePicker
                    value={toDatePickerValue(endTime)}
                    onChange={(v) => {
                      setEndTime(toEndDateTime(String(v || '')));
                      setActivePreset('custom');
                    }}
                    placeholder="留空表示永不过期"
                    clearable
                    style={{ width: '100%' }}
                    popupProps={DATE_PICKER_POPUP}
                  />
                </FormItem>
              </Form>
              {(startTime || endTime) && (
                <div className="mt-1 px-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className="text-slate-400">当前范围</span>
                  <span className="text-slate-300">
                    {startTime ? formatAuthDateTime(startTime) : '立即生效'}
                  </span>
                  <span className="text-slate-600">→</span>
                  <span className="text-slate-300">
                    {endTime ? formatAuthDateTime(endTime) : '永不过期'}
                  </span>
                </div>
              )}
            </div>

            {(durationText || startTime || endTime) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                {durationText && (
                  <span className="text-xs text-slate-400">
                    授权时长：<span className="text-slate-200 font-medium">{durationText}</span>
                  </span>
                )}
                <span className="text-xs text-slate-400">
                  预计状态：
                  <Tag
                    className="ml-1.5"
                    theme={previewStatus === 'active' ? 'success' : previewStatus === 'pending' ? 'warning' : 'danger'}
                    variant="light"
                    size="small"
                  >
                    {AUTHZ_STATUS_LABELS[previewStatus]}
                  </Tag>
                </span>
                {startTime && endTime && new Date(startTime) >= new Date(endTime) && (
                  <span className="text-xs text-red-400">生效时间必须早于过期时间</span>
                )}
              </div>
            )}
          </div>
        </div>

        {(selectedUser || selectedAssets.length > 0) && !isEdit && (
          <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/15 space-y-2">
            <p className="text-xs font-medium text-cyan-400 uppercase tracking-wider">授权预览</p>
            {selectedUser && (
              <p className="text-sm text-slate-300">
                用户：<span className="text-slate-100">{selectedUser.username}</span>
                <Tag className="ml-2" theme="default" variant="light" size="small">
                  {ROLE_LABELS[selectedUser.role]}
                </Tag>
              </p>
            )}
            {selectedAssets.length > 0 && (
              <div className="text-sm text-slate-300">
                资产：
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {selectedAssets.map((a) => (
                    <Tag key={a.id} theme={a.protocol === 'ssh' ? 'primary' : 'warning'} variant="light" size="small">
                      {a.name}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm text-slate-400">
              时效：
              <span className="text-slate-200 ml-1">
                {startTime ? formatAuthDateTime(startTime) : '立即生效'}
                {' → '}
                {endTime ? formatAuthDateTime(endTime) : '永不过期'}
              </span>
              {durationText && (
                <span className="text-slate-500 ml-2">({durationText})</span>
              )}
            </p>
            <p className="text-sm text-slate-400">
              预计状态：
              <Tag
                className="ml-2"
                theme={previewStatus === 'active' ? 'success' : previewStatus === 'pending' ? 'warning' : 'danger'}
                variant="light"
                size="small"
              >
                {AUTHZ_STATUS_LABELS[previewStatus]}
              </Tag>
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
};
