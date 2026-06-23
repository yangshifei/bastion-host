export const ACTION_LABELS: Record<string, string> = {
  login: '登录',
  logout: '登出',
  create: '创建',
  update: '更新',
  delete: '删除',
  connect: '连接',
  disconnect: '断开',
};

export const ACTION_THEMES: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger'> = {
  login: 'success',
  logout: 'default',
  create: 'primary',
  update: 'warning',
  delete: 'danger',
  connect: 'primary',
  disconnect: 'default',
};

export const TARGET_TYPE_LABELS: Record<string, string> = {
  user: '用户',
  asset: '资产',
  authorization: '授权',
  session: '会话',
};

export const AUTHZ_STATUS_LABELS: Record<string, string> = {
  active: '生效中',
  expired: '已过期',
  pending: '未生效',
};

export const AUTHZ_STATUS_THEMES: Record<string, 'success' | 'warning' | 'default' | 'danger'> = {
  active: 'success',
  expired: 'danger',
  pending: 'warning',
};

export const RISK_LEVEL_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
};

export const RISK_LEVEL_THEMES: Record<string, 'default' | 'warning' | 'danger'> = {
  low: 'default',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return value.replace('T', ' ').slice(0, 19);
}
