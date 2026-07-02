import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { EnhancedTable, Button, Dialog, Form, Input, Select, Tag, Space, Upload, MessagePlugin, Popconfirm } from 'tdesign-react';
import {
  AddIcon,
  DeleteIcon,
  EditIcon,
  UploadIcon,
  RefreshIcon,
  SearchIcon,
  FolderOpenIcon,
  ServerIcon,
  TerminalIcon,
  DesktopIcon,
  CheckCircleIcon,
  PlayCircleIcon,
} from 'tdesign-icons-react';
import { assetService, AssetQuery } from '../services/assetService';
import api from '../services/api';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { useRequestGuard } from '../hooks/useRequestGuard';
import {
  buildAssetTree,
  countAssetsInTree,
  isAssetGroupRow,
  normalizeGroupName,
  type AssetTreeRow,
} from '../utils/assetTree';
import type { SafeAsset } from '../types';
import { RecordingSwitch } from '../components/RecordingSwitch';

const { FormItem } = Form;

const RenameGroup: React.FC<{ oldName: string; onRenamed: () => void }> = ({ oldName, onRenamed }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(oldName);

  if (!editing) {
    return (
      <span className="cursor-pointer hover:text-cyan-400 transition-colors"
        onClick={(e) => { e.stopPropagation(); setName(oldName); setEditing(true); }}
        title="点击编辑分组名称">
        {oldName}
      </span>
    );
  }

  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={async e => {
          if (e.key === 'Enter') await handleSave();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="bg-slate-700 border border-cyan-500/30 rounded px-1.5 py-0.5 text-sm text-slate-200 outline-none w-24"
        autoFocus
      />
      <Button variant="text" size="small" icon={<EditIcon />} onClick={handleSave} />
    </span>
  );

  async function handleSave() {
    if (!name.trim() || name.trim() === oldName) { setEditing(false); return; }
    try {
      const res = await assetService.renameGroup(oldName, name.trim());
      if (res.code === 0) { MessagePlugin.success(res.message); onRenamed(); }
      else MessagePlugin.error(res.message || '重命名失败');
    } catch { MessagePlugin.error('重命名失败'); }
    setEditing(false);
  }
};

export const Assets: React.FC = () => {
  const [assets, setAssets] = useState<SafeAsset[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [stats, setStats] = useState<{ total: number; ssh: number; rdp: number; online: number; offline: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingAsset, setEditingAsset] = useState<SafeAsset | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [searchInput, setSearchInput] = useState('');
  const [protocolInput, setProtocolInput] = useState('');
  const [groupInput, setGroupInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedProtocol, setAppliedProtocol] = useState('');
  const [appliedGroup, setAppliedGroup] = useState('');
  const [testing, setTesting] = useState<number | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Array<string | number>>([]);
  const { begin, isLatest } = useRequestGuard();

  const fetchGroups = useCallback(async () => {
    try {
      const res = await assetService.getGroups();
      if (res.code === 0 && res.data) {
        setGroups(res.data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await assetService.getStats();
      if (res.code === 0 && res.data) setStats(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchAssets = useCallback(async () => {
    const seq = begin();
    setLoading(true);
    try {
      const params: AssetQuery = {
        page: 1,
        pageSize: 1000,
        search: appliedSearch || undefined,
        group: appliedGroup || undefined,
      };
      if (appliedProtocol) params.protocol = appliedProtocol;

      const res = await assetService.getList(params);
      if (!isLatest(seq)) return;

      if (res.code !== 0 || !res.data) return;

      setAssets(
        res.data.list.map((a) => ({
          ...a,
          recording_enabled: Boolean(a.recording_enabled),
        }))
      );
    } catch {
      if (isLatest(seq)) {
        MessagePlugin.error('加载资产列表失败');
      }
    } finally {
      if (isLatest(seq)) setLoading(false);
    }
  }, [appliedSearch, appliedProtocol, appliedGroup, begin, isLatest]);

  const treeData = useMemo(() => buildAssetTree(assets), [assets]);
  const assetTotal = useMemo(() => countAssetsInTree(treeData), [treeData]);

  useEffect(() => {
    fetchStats();
    fetchAssets();
    fetchGroups();
  }, [fetchStats, fetchAssets, fetchGroups]);

  useEffect(() => {
    setExpandedKeys(treeData.map((node) => node.rowKey));
  }, [treeData]);

  const handleSearch = () => {
    setAppliedSearch(searchInput.trim());
    setAppliedProtocol(protocolInput);
    setAppliedGroup(groupInput);
  };

  const handleReset = () => {
    setSearchInput('');
    setProtocolInput('');
    setGroupInput('');
    setAppliedSearch('');
    setAppliedProtocol('');
    setAppliedGroup('');
  };

  const openCreate = (groupName?: string) => {
    setEditingAsset(null);
    setFormData({
      asset_type: 'host',
      protocol: 'ssh',
      port: 22,
      group_name: groupName && groupName !== '未分组' ? groupName : 'default',
      recording_enabled: true,
    });
    setDialogVisible(true);
  };

  const openEdit = (asset: SafeAsset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name,
      host: asset.host,
      port: asset.port,
      protocol: asset.protocol,
      username: asset.username,
      group_name: asset.group_name,
      description: asset.description,
      recording_enabled: asset.recording_enabled !== false && (asset as any).recording_enabled !== 0,
    });
    setDialogVisible(true);
  };

  const handleToggleRecording = async (asset: SafeAsset, enabled: boolean) => {
    setAssets((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, recording_enabled: enabled } : a))
    );
    try {
      const res = await assetService.setRecordingEnabled(asset.id, enabled);
      if (res.code !== 0) throw new Error(res.message);
      MessagePlugin.success(res.message || (enabled ? '已开启会话回放' : '已关闭会话回放'));
    } catch (err: any) {
      setAssets((prev) =>
        prev.map((a) => (a.id === asset.id ? { ...a, recording_enabled: !enabled } : a))
      );
      MessagePlugin.error(err.response?.data?.message || err.message || '更新失败');
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        port: Number(formData.port) || 22,
        protocol: String(formData.protocol || 'ssh'),
        group_name: normalizeGroupName(formData.group_name) === '未分组' ? 'default' : formData.group_name,
        recording_enabled: formData.recording_enabled !== false,
      };
      if (editingAsset) {
        await assetService.update(editingAsset.id, payload);
        MessagePlugin.success('资产更新成功');
      } else {
        await assetService.create({ ...payload, password: formData.password || '' });
        MessagePlugin.success('资产创建成功');
      }
      setDialogVisible(false);
      fetchAssets();
      fetchGroups();
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.errors?.length) {
        MessagePlugin.error(data.errors.map((e: any) => `${e.field}: ${e.message}`).join('; '));
      } else {
        MessagePlugin.error(data?.message || '操作失败');
      }
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await assetService.remove(id);
      MessagePlugin.success('资产已删除');
      fetchAssets();
      fetchGroups();
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '删除失败');
    }
  };

  const handleTest = async (id: number) => {
    setTesting(id);
    try {
      const res = await assetService.testConnection(id);
      if (res.code === 0 && res.data?.success) {
        MessagePlugin.success(`连接成功 (${res.data.latencyMs}ms)`);
      } else {
        MessagePlugin.warning(`连接失败: ${res.data?.error || '未知错误'}`);
      }
    } catch {
      MessagePlugin.error('测试失败');
    } finally {
      setTesting(null);
      fetchAssets();
    }
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await api.post('/database/0/test', {
        host: formData.host, port: formData.port, db_type: formData.db_type,
        database: formData.database_name, user: formData.username, password: formData.password,
      });
      if (res.data?.code === 0) setTestResult({ ok: true, msg: '连接成功' });
      else setTestResult({ ok: false, msg: res.data?.message || '连接失败' });
    } catch (err: any) {
      setTestResult({ ok: false, msg: err?.response?.data?.message || err.message || '测试失败' });
    } finally { setTestLoading(false); }
  };

  const handleImport = async (file: any) => {
    try {
      const res = await assetService.importCsv(file.raw);
      if (res.code === 0) {
        MessagePlugin.success(`导入: ${res.data?.imported} 成功, ${res.data?.skipped} 跳过`);
        fetchAssets();
        fetchGroups();
      }
    } catch {
      MessagePlugin.error('导入失败');
    }
    return false;
  };

  const groupOptions = useMemo(() => {
    const names = new Set(groups);
    if (formData.group_name) names.add(formData.group_name);
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b, 'zh-CN'))
      .map((g) => ({ value: g, label: g }));
  }, [groups, formData.group_name]);

  const filterGroupOptions = useMemo(
    () => groups.map((g) => ({ value: g, label: normalizeGroupName(g) })),
    [groups]
  );

  const columns = [
    {
      colKey: 'name',
      title: '名称',
      ellipsis: true,
      width: 200,
      cell: ({ row }: { row: AssetTreeRow }) => {
        if (isAssetGroupRow(row)) {
          return (
            <span className="inline-flex items-center gap-2 font-semibold text-sm text-slate-200 group">
              <span className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-500/10 text-cyan-400">
                <FolderOpenIcon size="14px" />
              </span>
              <RenameGroup oldName={row.group_name} onRenamed={() => { fetchAssets(); fetchGroups(); }} />
              <span className="text-[11px] text-slate-500 font-normal">({row.children.length})</span>
            </span>
          );
        }
        return (
          <div className="flex items-center gap-2.5">
            <span className={`flex items-center justify-center w-6 h-6 rounded-md shrink-0 ${(row as any).asset_type === 'database' ? 'bg-green-500/10 text-green-400' : row.protocol === 'ssh' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>
              {(row as any).asset_type === 'database' ? <FolderOpenIcon size="13px" /> : row.protocol === 'ssh' ? <TerminalIcon size="13px" /> : <DesktopIcon size="13px" />}
            </span>
            <div className="min-w-0">
              <span className="text-sm font-medium text-slate-200 truncate block">{row.name}</span>
              {(row as any).asset_type === 'database' && (
                <span className="text-[10px] text-green-500">{(row as any).db_type?.toUpperCase()} · {(row as any).database_name || ''}</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      colKey: 'host',
      title: '连接地址',
      width: 200,
      cell: ({ row }: { row: AssetTreeRow }) => {
        if (isAssetGroupRow(row)) return <span className="text-slate-600 text-xs">—</span>;
        return (
          <div className="text-sm">
            <span className="text-slate-300 font-mono">{row.host}</span>
            <span className="text-slate-600 mx-1">:</span>
            <span className="text-slate-400 font-mono text-xs">{row.port}</span>
          </div>
        );
      },
    },
    {
      colKey: 'protocol',
      title: '类型',
      width: 75,
      cell: ({ row }: { row: AssetTreeRow }) => {
        if (isAssetGroupRow(row)) return <span className="text-slate-600 text-xs">—</span>;
        const isDb = (row as any).asset_type === 'database';
        if (isDb) return <Tag theme="success" variant="light" size="small">{(row as any).db_type?.toUpperCase() || 'DB'}</Tag>;
        return (
          <Tag theme={row.protocol === 'ssh' ? 'primary' : 'warning'} variant="light" size="small">
            {row.protocol.toUpperCase()}
          </Tag>
        );
      },
    },
    {
      colKey: 'recording_enabled',
      title: '录像',
      width: 75,
      cell: ({ row }: { row: AssetTreeRow }) => {
        if (isAssetGroupRow(row)) return <span className="text-slate-600 text-xs">—</span>;
        const enabled = Boolean(row.recording_enabled);
        return (
          <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <RecordingSwitch size="small" value={enabled} onChange={(v) => handleToggleRecording(row, v)} />
          </div>
        );
      },
    },
    {
      colKey: 'status',
      title: '状态',
      width: 80,
      cell: ({ row }: { row: AssetTreeRow }) => {
        if (isAssetGroupRow(row)) return <span className="text-slate-600 text-xs">—</span>;
        const online = row.status === 'online';
        return (
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-400' : row.status === 'offline' ? 'bg-red-400' : 'bg-slate-500'}`} />
            <span className={`text-xs ${online ? 'text-emerald-400' : row.status === 'offline' ? 'text-red-400' : 'text-slate-500'}`}>
              {row.status === 'online' ? '在线' : row.status === 'offline' ? '离线' : '未知'}
            </span>
          </div>
        );
      },
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 160,
      cell: ({ row }: { row: AssetTreeRow }) => {
        if (isAssetGroupRow(row)) return null;
        const isDb = (row as any).asset_type === 'database';
        return (
          <Space size="small">
            <Button variant="text" size="small" icon={<EditIcon />} onClick={() => openEdit(row)} />
            {isDb ? (
              <Link to={`/database/${row.id}`}>
                <Button variant="text" size="small" theme="primary" icon={<PlayCircleIcon />} />
              </Link>
            ) : (
              <Button variant="text" size="small" icon={<RefreshIcon />} loading={testing === row.id} onClick={() => handleTest(row.id)} />
            )}
            <Popconfirm content="确认删除？" onConfirm={() => handleDelete(row.id)}>
              <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="资产管理"
        description={`按分组管理 SSH / RDP 远程访问目标，共 ${assetTotal} 个资产、${treeData.length} 个分组`}
      >
        <Space>
          <Button variant="outline" icon={<RefreshIcon />} onClick={() => { fetchStats(); fetchAssets(); fetchGroups(); }}>
            刷新
          </Button>
          <Upload action="" theme="custom" beforeUpload={handleImport} accept=".csv">
            <Button variant="outline" icon={<UploadIcon />}>
              导入 CSV
            </Button>
          </Upload>
          <Button theme="primary" icon={<AddIcon />} onClick={() => openCreate()}>
            添加资产
          </Button>
        </Space>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <StatCard title="资产总数" value={stats?.total ?? '-'} subtitle="SSH + RDP" icon={<ServerIcon size="22px" />} accent="cyan" />
        <StatCard title="SSH" value={stats?.ssh ?? '-'} subtitle="Linux / Unix" icon={<TerminalIcon size="22px" />} accent="blue" />
        <StatCard title="RDP" value={stats?.rdp ?? '-'} subtitle="Windows" icon={<DesktopIcon size="22px" />} accent="amber" />
        <StatCard title="在线" value={stats?.online ?? '-'} subtitle={`离线 ${stats?.offline ?? 0} 台`} icon={<CheckCircleIcon size="22px" />} accent="green" />
      </div>

      <div className="content-card">
        <FilterBar>
          <Input
            prefixIcon={<SearchIcon />}
            placeholder="搜索名称或主机..."
            value={searchInput}
            onChange={setSearchInput}
            onEnter={handleSearch}
            className="w-56"
            clearable
          />
          <Select
            value={groupInput}
            onChange={(v) => setGroupInput(String(v || ''))}
            placeholder="分组"
            clearable
            filterable
            options={filterGroupOptions}
            style={{ width: 140 }}
          />
          <Select
            value={protocolInput}
            onChange={(v) => setProtocolInput(String(v || ''))}
            placeholder="协议"
            clearable
            options={[
              { value: 'ssh', label: 'SSH' },
              { value: 'rdp', label: 'RDP' },
            ]}
            style={{ width: 120 }}
          />
          <Button theme="primary" onClick={handleSearch}>
            查询
          </Button>
          <Button variant="outline" onClick={handleReset}>
            重置
          </Button>
        </FilterBar>

        <EnhancedTable
          data={treeData}
          columns={columns}
          rowKey="rowKey"
          loading={loading}
          hover
          tree={{
            childrenKey: 'children',
            treeNodeColumnIndex: 0,
            defaultExpandAll: true,
            indent: 24,
          }}
          expandedTreeNodes={expandedKeys}
          onExpandedTreeNodesChange={setExpandedKeys}
          empty={<EmptyState title="暂无资产" description="点击「添加资产」添加第一个资产" />}
        />
      </div>

      <Dialog
        visible={dialogVisible}
        header={editingAsset ? '编辑资产' : '添加资产'}
        width={600}
        onClose={() => setDialogVisible(false)}
        onConfirm={handleSave}
      >
        <Form labelWidth={100}>
          <FormItem label="名称" rules={[{ required: true }]}>
            <Input value={formData.name} onChange={(v) => setFormData({ ...formData, name: v })} />
          </FormItem>

          {/* Asset type selector */}
          <FormItem label="资产类型" rules={[{ required: true }]}>
            <Select
              value={formData.asset_type || 'host'}
              onChange={(v) => setFormData({
                ...formData,
                asset_type: v,
                protocol: v === 'database' ? 'ssh' : (formData.protocol || 'ssh'),
                port: v === 'database' ? (formData.db_type === 'mssql' ? 1433 : formData.db_type === 'postgresql' ? 5432 : 3306) : (formData.port || 22),
              })}
              options={[
                { value: 'host', label: '🖥️ 主机资产 (SSH/RDP)' },
                { value: 'database', label: '🗄️ 数据库资产 (SQL Server/MySQL/PG)' },
              ]}
            />
          </FormItem>

          {/* Host-specific fields */}
          {formData.asset_type !== 'database' && (
            <FormItem label="协议" rules={[{ required: true }]}>
              <Select
                value={formData.protocol}
                onChange={(v) => setFormData({ ...formData, protocol: v, port: v === 'ssh' ? 22 : 3389 })}
                options={[
                  { value: 'ssh', label: 'SSH' },
                  { value: 'rdp', label: 'RDP' },
                ]}
              />
            </FormItem>
          )}

          {/* Database-specific fields */}
          {formData.asset_type === 'database' && (
            <>
              <FormItem label="数据库类型" rules={[{ required: true }]}>
                <Select
                  value={formData.db_type}
                  onChange={(v) => setFormData({
                    ...formData,
                    db_type: v,
                    port: v === 'mssql' ? 1433 : v === 'postgresql' ? 5432 : 3306,
                    protocol: 'ssh',
                  })}
                  options={[
                    { value: 'mysql', label: 'MySQL' },
                    { value: 'postgresql', label: 'PostgreSQL' },
                    { value: 'mssql', label: 'SQL Server' },
                  ]}
                />
              </FormItem>
              <FormItem label="数据库名">
                <Input value={formData.database_name} onChange={(v) => setFormData({ ...formData, database_name: v })} placeholder="输入数据库名称" />
              </FormItem>
              <FormItem label=" ">
                <Button variant="outline" icon={<CheckCircleIcon />} loading={testLoading} onClick={handleTestConnection}>
                  测试连接
                </Button>
                {testResult && (
                  <span className={`ml-3 text-xs ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {testResult.msg}
                  </span>
                )}
              </FormItem>
            </>
          )}

          <FormItem label="主机地址" rules={[{ required: true }]}>
            <Input value={formData.host} onChange={(v) => setFormData({ ...formData, host: v })} />
          </FormItem>
          <FormItem label="端口" rules={[{ required: true }]}>
            <Input
              value={formData.port}
              onChange={(v) => setFormData({ ...formData, port: parseInt(v) || 22 })}
              type="number"
            />
          </FormItem>
          <FormItem label="用户名">
            <Input value={formData.username} onChange={(v) => setFormData({ ...formData, username: v })} />
          </FormItem>
          <FormItem label="密码">
            <Input
              type="password"
              value={formData.password || ''}
              onChange={(v) => setFormData({ ...formData, password: v })}
              placeholder={editingAsset ? '留空则不改动' : '输入密码'}
            />
          </FormItem>
          <FormItem label="分组">
            <Select
              value={formData.group_name}
              onChange={(v) => setFormData({ ...formData, group_name: v })}
              options={groupOptions}
              filterable
              creatable
              clearable
              placeholder="选择或输入分组名"
            />
          </FormItem>

          {formData.asset_type !== 'database' && (
            <div className="t-form__item recording-form-row">
              <label className="t-form__label">会话回放</label>
              <div className="t-form__controls">
                <div className="flex items-center gap-3">
                  <RecordingSwitch
                    value={formData.recording_enabled !== false}
                    onChange={(v) => setFormData({ ...formData, recording_enabled: v })}
                  />
                  <Tag
                    theme={formData.recording_enabled !== false ? 'success' : 'default'}
                    variant="light"
                    size="small"
                    className="recording-status-tag"
                  >
                    {formData.recording_enabled !== false ? '录像已开启' : '录像已关闭'}
                  </Tag>
                </div>
                <p className="t-form__help">开启后 SSH / RDP 连接将自动录像，可在「会话回放」中查看</p>
              </div>
            </div>
          )}

          <FormItem label="描述">
            <Input value={formData.description} onChange={(v) => setFormData({ ...formData, description: v })} />
          </FormItem>
        </Form>
      </Dialog>
    </div>
  );
};
