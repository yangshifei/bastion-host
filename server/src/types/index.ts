import { Request } from 'express';

// ---- Enums ----
export type UserRole = 'admin' | 'operator' | 'auditor';
export type UserStatus = 'active' | 'disabled';
export type AssetProtocol = 'ssh' | 'rdp';
export type AssetStatus = 'online' | 'offline' | 'unknown';
export type SessionStatus = 'active' | 'closed' | 'terminated' | 'timeout';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type LoginResult = 'success' | 'fail_wrong_password' | 'fail_no_user' | 'fail_locked' | 'fail_mfa';

// ---- Express Extension ----
export interface AuthUser {
  userId: number;
  username: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// ---- DB Row Types ----
export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  totp_secret: string | null;
  mfa_enabled: number; // TINYINT(1)
  mfa_recovery: string | null; // JSON
  status: UserStatus;
  last_login: string | null;
  login_fails: number;
  locked_until: string | null;
  password_changed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AssetRow {
  id: number;
  name: string;
  host: string;
  port: number;
  protocol: AssetProtocol;
  username: string | null;
  password_encrypted: string | null;
  private_key_encrypted: string | null;
  group_name: string;
  description: string | null;
  status: AssetStatus;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuthorizationRow {
  id: number;
  user_id: number;
  asset_id: number;
  start_time: string | null;
  end_time: string | null;
  granted_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
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
}

export interface CommandLogRow {
  id: number;
  session_id: number;
  timestamp: string;
  command: string;
  is_dangerous: number;
  is_blocked: number;
  risk_level: RiskLevel | null;
}

export interface AuditLogRow {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  detail: string | null; // JSON
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface LoginLogRow {
  id: number;
  user_id: number | null;
  username: string;
  ip: string | null;
  user_agent: string | null;
  result: LoginResult;
  mfa_used: number;
  created_at: string;
}

// ---- API Types ----
export interface SafeUser {
  id: number;
  username: string;
  role: UserRole;
  email: string | null;
  phone: string | null;
  mfa_enabled: boolean;
  status: UserStatus;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeAsset {
  id: number;
  name: string;
  host: string;
  port: number;
  protocol: AssetProtocol;
  username: string | null;
  group_name: string;
  description: string | null;
  status: AssetStatus;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---- WebSocket Message Types ----
export interface WsClientMessage {
  type: 'connect' | 'input' | 'resize' | 'disconnect' | 'ping';
  assetId?: number;
  data?: string;
  cols?: number;
  rows?: number;
}

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
