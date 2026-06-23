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
import { AddIcon, DeleteIcon, EditIcon, SearchIcon, RefreshIcon, UserIcon } from 'tdesign-icons-react';
import { userService, UserQuery } from '../services/userService';
import { PageHeader } from '../components/PageHeader';
import { FilterBar } from '../components/FilterBar';
import { EmptyState } from '../components/EmptyState';
import { usePagination } from '../hooks/usePagination';
import type { SafeUser } from '../types';

const { FormItem } = Form;

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  auditor: '审计员',
  operator: '操作员',
};

export const Users: React.FC = () => {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [search, setSearch] = useState('');
  const pag = usePagination();

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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openCreate = () => {
    setEditingUser(null);
    setFormData({ role: 'operator' });
    setDialogVisible(true);
  };

  const openEdit = (user: SafeUser) => {
    setEditingUser(user);
    setFormData({ username: user.username, role: user.role, email: user.email, phone: user.phone });
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
    { colKey: 'id', title: 'ID', width: 60 },
    { colKey: 'username', title: '用户名', width: 120 },
    {
      colKey: 'role',
      title: '角色',
      width: 100,
      cell: ({ row }: any) => (
        <Tag theme={row.role === 'admin' ? 'danger' : row.role === 'auditor' ? 'warning' : 'primary'} variant="light" size="small">
          {ROLE_LABELS[row.role] || row.role}
        </Tag>
      ),
    },
    { colKey: 'email', title: '邮箱', ellipsis: true, width: 180 },
    {
      colKey: 'mfa_enabled',
      title: 'MFA',
      width: 70,
      cell: ({ row }: any) => (
        <Tag theme={row.mfa_enabled ? 'success' : 'default'} variant="light" size="small">
          {row.mfa_enabled ? '已启用' : '未启用'}
        </Tag>
      ),
    },
    {
      colKey: 'status',
      title: '状态',
      width: 70,
      cell: ({ row }: any) => (
        <Tag theme={row.status === 'active' ? 'success' : 'danger'} variant="light" size="small">
          {row.status === 'active' ? '启用' : '禁用'}
        </Tag>
      ),
    },
    { colKey: 'last_login', title: '最后登录', width: 160 },
    {
      colKey: 'actions',
      title: '操作',
      width: 150,
      cell: ({ row }: any) => (
        <Space size="small">
          <Button variant="text" size="small" icon={<EditIcon />} onClick={() => openEdit(row)}>编辑</Button>
          <Popconfirm content="确认删除此用户？" onConfirm={() => handleDelete(row.id)}>
            <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="用户管理" description="管理系统账号、角色权限与 MFA 安全设置">
        <Space>
          <Button variant="outline" icon={<RefreshIcon />} onClick={fetchUsers}>刷新</Button>
          <Button theme="primary" icon={<AddIcon />} onClick={openCreate}>添加用户</Button>
        </Space>
      </PageHeader>

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
        header={editingUser ? '编辑用户' : '添加用户'}
        width={540}
        onClose={() => setDialogVisible(false)}
        onConfirm={handleSave}
      >
        <Form labelWidth={100} labelAlign="top">
          <FormItem label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input value={formData.username} onChange={(v) => setFormData({ ...formData, username: v })} disabled={!!editingUser} />
          </FormItem>
          {!editingUser && (
            <FormItem label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input type="password" value={formData.password || ''} onChange={(v) => setFormData({ ...formData, password: v })} placeholder="至少8位，含字母和数字" />
            </FormItem>
          )}
          {editingUser && (
            <FormItem label="新密码">
              <Input type="password" value={formData.password || ''} onChange={(v) => setFormData({ ...formData, password: v })} placeholder="留空不修改" />
            </FormItem>
          )}
          <FormItem label="角色" rules={[{ required: true }]}>
            <Select value={formData.role} onChange={(v) => setFormData({ ...formData, role: v })}
              options={[
                { value: 'operator', label: '操作员' },
                { value: 'admin', label: '管理员' },
                { value: 'auditor', label: '审计员' },
              ]} />
          </FormItem>
          <FormItem label="邮箱">
            <Input value={formData.email} onChange={(v) => setFormData({ ...formData, email: v })} />
          </FormItem>
          <FormItem label="手机">
            <Input value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />
          </FormItem>
        </Form>
      </Dialog>
    </div>
  );
};
