import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Popconfirm,
  MessagePlugin,
  Input,
  Select,
} from 'tdesign-react';
import { AddIcon, DeleteIcon, EditIcon, SearchIcon, RefreshIcon, LinkIcon, TerminalIcon, DesktopIcon } from 'tdesign-icons-react';
import { authorizationService } from '../services/authorizationService';
import { userService } from '../services/userService';
import { assetService } from '../services/assetService';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { AuthorizationFormDialog } from '../components/AuthorizationFormDialog';
import { usePagination } from '../hooks/usePagination';
import type { Authorization, SafeUser, SafeAsset } from '../types';
import type { AuthorizationStats } from '../services/authorizationService';
import { AUTHZ_STATUS_LABELS, AUTHZ_STATUS_THEMES, formatDateTime } from '../utils/auditLabels';

export const Authorizations: React.FC = () => {
  const [authzs, setAuthzs] = useState<Authorization[]>([]);
  const [stats, setStats] = useState<AuthorizationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingAuthz, setEditingAuthz] = useState<Authorization | null>(null);
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [assets, setAssets] = useState<SafeAsset[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [protocolFilter, setProtocolFilter] = useState('');

  const pag = usePagination();

  const fetchStats = useCallback(async () => {
    try {
      const res = await authorizationService.getStats();
      if (res.code === 0 && res.data) setStats(res.data);
    } catch {
      // ignore
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page: pag.page,
        pageSize: pag.pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (protocolFilter) params.protocol = protocolFilter;

      const [authRes, userRes, assetRes] = await Promise.all([
        authorizationService.getList(params),
        userService.getList({ pageSize: 200 }),
        assetService.getList({ pageSize: 200 }),
      ]);

      if (authRes.code === 0 && authRes.data) {
        setAuthzs(authRes.data.list);
        pag.updateTotal(authRes.data.pagination.total);
      }
      if (userRes.code === 0 && userRes.data) setUsers(userRes.data.list);
      if (assetRes.code === 0 && assetRes.data) setAssets(assetRes.data.list);
    } finally {
      setLoading(false);
    }
  }, [pag.page, pag.pageSize, search, statusFilter, protocolFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditingAuthz(null);
    setDialogVisible(true);
  };

  const openEdit = (authz: Authorization) => {
    setEditingAuthz(authz);
    setDialogVisible(true);
  };

  const handleFormSuccess = () => {
    fetchData();
    fetchStats();
  };

  const handleDelete = async (id: number) => {
    try {
      await authorizationService.remove(id);
      MessagePlugin.success('授权已删除');
      fetchData();
      fetchStats();
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '删除失败');
    }
  };

  const handleSearch = () => {
    pag.reset();
    fetchData();
  };

  const handleReset = () => {
    setSearch('');
    setStatusFilter('');
    setProtocolFilter('');
    pag.setPage(1);
    setLoading(true);
    authorizationService
      .getList({ page: 1, pageSize: pag.pageSize })
      .then((authRes) => {
        if (authRes.code === 0 && authRes.data) {
          setAuthzs(authRes.data.list);
          pag.updateTotal(authRes.data.pagination.total);
        }
      })
      .finally(() => setLoading(false));
  };

  const columns = [
    {
      colKey: 'info',
      title: '用户 / 资产',
      width: 240,
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2.5">
          <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${row.asset_protocol === 'ssh' ? 'bg-blue-500/10 text-blue-400' : 'bg-amber-500/10 text-amber-400'}`}>
            {row.asset_protocol === 'ssh' ? <TerminalIcon size="14px" /> : <DesktopIcon size="14px" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{row.user_username} → {row.asset_name}</p>
            <p className="text-[11px] text-slate-500">{row.asset_host}</p>
          </div>
        </div>
      ),
    },
    {
      colKey: 'status',
      title: '状态',
      width: 80,
      cell: ({ row }: any) => {
        const theme = AUTHZ_STATUS_THEMES[row.status] || 'default';
        const colors: Record<string, string> = { success: 'bg-emerald-400', warning: 'bg-amber-400', danger: 'bg-red-400', default: 'bg-slate-500' };
        const texts: Record<string, string> = { success: 'text-emerald-400', warning: 'text-amber-400', danger: 'text-red-400', default: 'text-slate-400' };
        return (
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${colors[theme] || colors.default}`} />
            <span className={`text-xs ${texts[theme] || texts.default}`}>
              {AUTHZ_STATUS_LABELS[row.status] || row.status}
            </span>
          </div>
        );
      },
    },
    {
      colKey: 'time',
      title: '有效期',
      width: 180,
      cell: ({ row }: any) => (
        <div className="text-xs">
          <p className="text-slate-300">{row.start_time ? formatDateTime(row.start_time) : '立即生效'}</p>
          <p className="text-slate-500">→ {row.end_time ? formatDateTime(row.end_time) : '永不过期'}</p>
        </div>
      ),
    },
    {
      colKey: 'granted_by_username',
      title: '授权人',
      width: 80,
      cell: ({ row }: any) => (
        <span className="text-xs text-slate-400">{row.granted_by_username || '-'}</span>
      ),
    },
    {
      colKey: 'actions',
      title: '',
      width: 80,
      cell: ({ row }: any) => (
        <Space size="small">
          <Button variant="text" size="small" icon={<EditIcon />} onClick={() => openEdit(row)} />
          <Popconfirm content="确认删除？" onConfirm={() => handleDelete(row.id)}>
            <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="授权管理"
        description="控制用户对资产的访问权限，支持时效授权与状态追踪"
      >
        <Space>
          <Button variant="outline" icon={<RefreshIcon />} onClick={() => { fetchData(); fetchStats(); }}>
            刷新
          </Button>
          <Button theme="primary" icon={<AddIcon />} onClick={openCreate}>
            添加授权
          </Button>
        </Space>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="授权总数"
          value={stats?.total ?? '-'}
          subtitle="全部授权记录"
          icon={<LinkIcon size="22px" />}
          accent="cyan"
        />
        <StatCard
          title="生效中"
          value={stats?.active ?? '-'}
          subtitle="当前可访问"
          icon={<LinkIcon size="22px" />}
          accent="green"
        />
        <StatCard
          title="未生效"
          value={stats?.pending ?? '-'}
          subtitle="等待生效时间"
          icon={<LinkIcon size="22px" />}
          accent="amber"
        />
        <StatCard
          title="已过期"
          value={stats?.expired ?? '-'}
          subtitle="需续期或删除"
          icon={<LinkIcon size="22px" />}
          accent="red"
        />
      </div>

      <div className="content-card">
        <FilterBar>
          <Input
            prefixIcon={<SearchIcon />}
            placeholder="搜索用户 / 资产 / 主机"
            value={search}
            onChange={setSearch}
            onEnter={handleSearch}
            className="w-56"
            clearable
          />
          <Select
            value={statusFilter}
            onChange={(v) => setStatusFilter(String(v || ''))}
            placeholder="授权状态"
            clearable
            options={[
              { value: 'active', label: '生效中' },
              { value: 'pending', label: '未生效' },
              { value: 'expired', label: '已过期' },
            ]}
            style={{ width: 130 }}
          />
          <Select
            value={protocolFilter}
            onChange={(v) => setProtocolFilter(String(v || ''))}
            placeholder="协议"
            clearable
            options={[
              { value: 'ssh', label: 'SSH' },
              { value: 'rdp', label: 'RDP' },
            ]}
            style={{ width: 120 }}
          />
          <Button theme="primary" onClick={handleSearch}>查询</Button>
          <Button variant="outline" onClick={handleReset}>重置</Button>
        </FilterBar>

        <Table
          data={authzs}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={pag.paginationProps}
          hover
          stripe
          empty={
            <EmptyState
              title="暂无授权"
              description="点击「添加授权」为用户分配资产访问权限"
              actionText="添加授权"
              onAction={openCreate}
            />
          }
        />
      </div>

      <AuthorizationFormDialog
        visible={dialogVisible}
        editingAuthz={editingAuthz}
        users={users}
        assets={assets}
        onClose={() => setDialogVisible(false)}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
};
