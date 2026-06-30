import React, { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Dialog,
  Form,
  Input,
  Select,
  Tag,
  Space,
  Popconfirm,
  MessagePlugin,
} from 'tdesign-react';
import { AddIcon, DeleteIcon, EditIcon, SearchIcon, RefreshIcon, UserIcon, SecuredIcon, LockOnIcon, MailIcon, CallIcon } from 'tdesign-icons-react';
import { userService, UserQuery } from '../services/userService';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { EmptyState } from '../components/EmptyState';
import { usePagination } from '../hooks/usePagination';
import type { SafeUser } from '../types';

const { FormItem } = Form;

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  auditor: '审计员',
  operator: '操作员',
};

const ROLE_THEME: Record<string, 'danger' | 'warning' | 'primary'> = {
  admin: 'danger',
  auditor: 'warning',
  operator: 'primary',
};

const ROLE_GRADIENT: Record<string, string> = {
  admin: 'from-rose-500/20 to-rose-500/5 border-rose-500/20',
  auditor: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
  operator: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20',
};

const ROLE_ICON_COLOR: Record<string, string> = {
  admin: 'text-rose-400',
  auditor: 'text-amber-400',
  operator: 'text-cyan-400',
};

function initials(name: string): string {
  return name?.slice(0, 2).toUpperCase() || '?';
}

function relativeTime(iso: string): string {
  if (!iso) return '从未登录';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return iso.slice(0, 10);
}

export const Users: React.FC = () => {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [userStats, setUserStats] = useState<{ total: number; admins: number; operators: number; auditors: number; active: number; disabled: number; mfa_enabled: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [search, setSearch] = useState('');
  const pag = usePagination();

  const fetchStats = useCallback(async () => {
    try {
      const res = await userService.getStats();
      if (res.code === 0 && res.data) setUserStats(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: UserQuery = { page: pag.page, pageSize: pag.pageSize, search };
      const res = await userService.getList(params);
      if (res.code === 0 && res.data) {
        setUsers(res.data.list);
        pag.updateTotal(res.data.pagination.total);
      }
    } finally {
      setLoading(false);
    }
  }, [pag.page, pag.pageSize, search]);

  useEffect(() => { fetchStats(); fetchUsers(); }, [fetchStats, fetchUsers]);

  const openCreate = () => {
    setEditingUser(null);
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const all = letters + digits;
    let pwd = '';
    for (let i = 0; i < 6; i++) pwd += all.charAt(Math.floor(Math.random() * all.length));
    // Ensure at least one letter and one digit
    pwd += letters.charAt(Math.floor(Math.random() * letters.length));
    pwd += digits.charAt(Math.floor(Math.random() * digits.length));
    // Shuffle
    pwd = pwd.split('').sort(() => Math.random() - 0.5).join('');
    setFormData({ role: 'operator', status: 'active', password: pwd });
    setDialogVisible(true);
  };

  const openEdit = (user: SafeUser) => {
    setEditingUser(user);
    setFormData({ username: user.username, role: user.role, email: user.email, phone: user.phone, status: user.status || 'active' });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    try {
      if (editingUser) {
        await userService.update(editingUser.id, formData);
        MessagePlugin.success('用户更新成功');
      } else {
        if (!formData.password) {
          MessagePlugin.warning('请输入密码');
          return;
        }
        await userService.create(formData);
        MessagePlugin.success('用户创建成功');
      }
      setDialogVisible(false);
      fetchUsers();
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '操作失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await userService.remove(id);
      MessagePlugin.success('用户已删除');
      fetchUsers();
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '删除失败');
    }
  };

  const handleSearch = () => {
    pag.setPage(1);
    fetchUsers();
  };

  const handleReset = () => {
    setSearch('');
    pag.setPage(1);
  };

  const columns = [
    { colKey: 'id', title: '#', width: 55 },
    {
      colKey: 'username',
      title: '用户',
      width: 200,
      cell: ({ row }: any) => (
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${ROLE_GRADIENT[row.role] || ROLE_GRADIENT.operator}`}>
            <span className={`text-xs font-semibold ${ROLE_ICON_COLOR[row.role] || ROLE_ICON_COLOR.operator}`}>
              {initials(row.username)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-100 truncate">{row.username}</p>
            <p className="text-[11px] text-slate-500">{row.email || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      colKey: 'role',
      title: '角色',
      width: 90,
      cell: ({ row }: any) => (
        <Tag theme={ROLE_THEME[row.role] || 'default'} variant="light" size="small">
          {ROLE_LABELS[row.role] || row.role}
        </Tag>
      ),
    },
    {
      colKey: 'status',
      title: '状态',
      width: 80,
      cell: ({ row }: any) => (
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${row.status === 'active' ? 'bg-emerald-400' : 'bg-slate-500'}`} />
          <span className={`text-xs ${row.status === 'active' ? 'text-emerald-400' : 'text-slate-500'}`}>
            {row.status === 'active' ? '启用' : '禁用'}
          </span>
        </div>
      ),
    },
    {
      colKey: 'mfa_enabled',
      title: 'MFA',
      width: 75,
      cell: ({ row }: any) => (
        <div className="flex items-center gap-1">
          <SecuredIcon size="14px" className={row.mfa_enabled ? 'text-emerald-400' : 'text-slate-600'} />
          <span className={`text-xs ${row.mfa_enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
            {row.mfa_enabled ? '已启用' : '未启用'}
          </span>
        </div>
      ),
    },
    {
      colKey: 'last_login',
      title: '最近登录',
      width: 130,
      cell: ({ row }: any) => (
        <span className="text-xs text-slate-400" title={row.last_login}>
          {relativeTime(row.last_login)}
        </span>
      ),
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 130,
      cell: ({ row }: any) => (
        <Space size="small">
          <Button variant="text" size="small" icon={<EditIcon />} onClick={() => openEdit(row)} />
          <Popconfirm content="确认删除此用户？" onConfirm={() => handleDelete(row.id)}>
            <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="用户管理" description="管理系统账号、角色权限与 MFA 安全设置">
        <Space>
          <Button variant="outline" icon={<RefreshIcon />} onClick={() => { fetchStats(); fetchUsers(); }}>刷新</Button>
          <Button theme="primary" icon={<AddIcon />} onClick={openCreate}>添加用户</Button>
        </Space>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <StatCard title="用户总数" value={userStats?.total ?? '-'} subtitle={`启用 ${userStats?.active ?? 0} · 禁用 ${userStats?.disabled ?? 0}`} icon={<UserIcon size="22px" />} accent="cyan" />
        <StatCard title="管理员" value={userStats?.admins ?? '-'} subtitle="系统完全控制" icon={<SecuredIcon size="22px" />} accent="red" />
        <StatCard title="操作员" value={userStats?.operators ?? '-'} subtitle="远程连接资产" icon={<UserIcon size="22px" />} accent="blue" />
        <StatCard title="MFA 启用" value={userStats?.mfa_enabled ?? '-'} subtitle={`${userStats?.total ? Math.round(userStats.mfa_enabled / userStats.total * 100) : 0}% 覆盖率`} icon={<SecuredIcon size="22px" />} accent="green" />
      </div>

      <div className="content-card">
        <FilterBar>
          <Input
            prefixIcon={<SearchIcon />}
            placeholder="搜索用户名..."
            value={search}
            onChange={setSearch}
            onEnter={handleSearch}
            className="w-56"
            clearable
          />
          <Button theme="primary" onClick={handleSearch}>查询</Button>
          <Button variant="outline" onClick={handleReset}>重置</Button>
        </FilterBar>

        <Table
          data={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={pag.paginationProps}
          hover
          stripe
          empty={
            <EmptyState
              icon={<UserIcon size="24px" className="text-slate-500" />}
              title="暂无用户"
              description="点击「添加用户」创建第一个系统账号"
              actionText="添加用户"
              onAction={openCreate}
            />
          }
        />
      </div>

      <Dialog
        visible={dialogVisible}
        header={
          <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${editingUser ? ROLE_GRADIENT[editingUser.role] || ROLE_GRADIENT.operator : ROLE_GRADIENT.operator}`}>
              <UserIcon size="18px" className={editingUser ? ROLE_ICON_COLOR[editingUser.role] || ROLE_ICON_COLOR.operator : ROLE_ICON_COLOR.operator} />
            </div>
            <div>
              <p className="text-base font-semibold">{editingUser ? '编辑用户' : '添加用户'}</p>
              <p className="text-xs text-slate-500">{editingUser ? `修改 ${editingUser.username} 的信息` : '创建新的系统账号'}</p>
            </div>
          </div>
        }
        width={520}
        onClose={() => setDialogVisible(false)}
        onConfirm={handleSave}
      >
        <Form labelWidth={80} labelAlign="top">
          <FormItem label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              value={formData.username}
              onChange={(v) => setFormData({ ...formData, username: v })}
              prefixIcon={<UserIcon />}
              placeholder="字母开头，3-32位"
            />
          </FormItem>
          {!editingUser && (
            <FormItem label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input
                type="password"
                value={formData.password || ''}
                onChange={(v) => setFormData({ ...formData, password: v })}
                placeholder="至少8位，含字母和数字"
                prefixIcon={<LockOnIcon />}
                key={`pwd-${formData.password || ''}`}
              />
            </FormItem>
          )}
          {editingUser && (
            <FormItem label="新密码">
              <Input
                type="password"
                value={formData.password || ''}
                onChange={(v) => setFormData({ ...formData, password: v })}
                placeholder="留空则不修改密码"
                prefixIcon={<LockOnIcon />}
              />
            </FormItem>
          )}
          <FormItem label="角色" rules={[{ required: true }]}>
            <Select
              value={formData.role}
              onChange={(v) => setFormData({ ...formData, role: v })}
              options={[
                { value: 'operator', label: '🔧 操作员 — 远程连接已授权资产' },
                { value: 'admin', label: '🛡️ 管理员 — 系统完全控制权限' },
                { value: 'auditor', label: '📋 审计员 — 只读审计与回放' },
              ]}
            />
          </FormItem>
          <FormItem label="邮箱">
            <Input
              value={formData.email}
              onChange={(v) => setFormData({ ...formData, email: v })}
              placeholder="user@company.com"
              prefixIcon={<MailIcon />}
            />
          </FormItem>
          <FormItem label="手机号">
            <Input
              value={formData.phone}
              onChange={(v) => setFormData({ ...formData, phone: v })}
              placeholder="138xxxx8888"
              prefixIcon={<CallIcon />}
            />
          </FormItem>
          <FormItem label="账号状态">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, status: formData.status === 'active' ? 'disabled' : 'active' })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 ${
                  formData.status === 'active' ? 'bg-cyan-500' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    formData.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-xs font-medium ${formData.status === 'active' ? 'text-emerald-400' : 'text-slate-500'}`}>
                {formData.status === 'active' ? '启用 — 允许登录' : '禁用 — 阻止登录'}
              </span>
            </div>
          </FormItem>
        </Form>
      </Dialog>
    </div>
  );
};
