// ---- Enums ----
export type UserRole = 'admin' | 'operator' | 'auditor';
export type UserStatus = 'active' | 'disabled';
export type AssetProtocol = 'ssh' | 'rdp';
export type AssetStatus = 'online' | 'offline' | 'unknown';
export type SessionStatus = 'active' | 'closed' | 'terminated' | 'timeout';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

// ---- API Response ----
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export interface PaginatedData<T = any> {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// ---- User ----
export interface SafeUser {
  id: number;
  username: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  mfa_enabled: boolean;
  must_change_password?: boolean;
  status: UserStatus;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Asset ----
export interface SafeAsset {
  id: number;
  name: string;
  host: string;
  port: number;
  protocol: AssetProtocol;
  username: string | null;
  group_name: string;
  description: string | null;
  recording_enabled: boolean;
  status: AssetStatus;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Authorization ----
export type AuthorizationStatus = 'active' | 'expired' | 'pending';

export interface Authorization {
  id: number;
  user_id: number;
  asset_id: number;
  start_time: string | null;
  end_time: string | null;
  granted_by: number | null;
  created_at: string;
  updated_at: string;
  user_username?: string;
  asset_name?: string;
  asset_host?: string;
  asset_protocol?: string;
  granted_by_username?: string;
  status?: AuthorizationStatus;
}

// ---- Session ----
export interface Session {
  id: number;
  user_id: number;
  asset_id: number;
  protocol: AssetProtocol;
  start_time: string;
  end_time: string | null;
  duration_sec: number | null;
  status: SessionStatus;
  command_count: number;
  recording_path: string | null;
  client_ip: string | null;
  termination_by: string | null;
  username?: string;
  asset_name?: string;
  asset_host?: string;
}

export interface ActiveSessionInfo {
  id: string;
  dbSessionId?: number;
  userId: number;
  username?: string;
  assetId: number;
  asset_name?: string;
  asset_host?: string;
  protocol: string;
  startTime: string;
  lastActivity: string;
  clientIp?: string;
}

// ---- Audit Log ----
export interface AuditLog {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  detail: Record<string, any> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

// ---- Dashboard Stats ----
export interface DashboardStats {
  totalAssets: number;
  onlineAssets: number;
  offlineAssets: number;
  totalUsers: number;
  activeSessions: number;
  todaySessions: number;
  totalSessions: number;
  commandStats: {
    total: number;
    dangerous: number;
  };
  recentSessions: Session[];
}

// ---- MFA ----
export interface MfaSetupData {
  secret: string;
  otpauth_url: string;
}

// ---- Login ----
export interface LoginResponse {
  token?: string;
  user?: SafeUser;
  requireMfa?: boolean;
  require_password_change?: boolean;
  mfaToken?: string;
}

// ---- WebSocket ----
export type WsStatus = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED' | 'RECONNECTING';

export interface WsServerMessage {
  type: 'connected' | 'output' | 'error' | 'disconnected' | 'pong' | 'alert';
  sessionId?: string;
  data?: string;
  message?: string;
  reason?: string;
  level?: 'warning' | 'error' | 'info';
  rows?: number;
  cols?: number;
}
