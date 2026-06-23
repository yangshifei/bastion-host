import dotenv from 'dotenv';
import path from 'path';

// Load .env from server directory (and parent as fallback)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production-min-32-bytes',
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  },

  encryption: {
    secret: process.env.ENCRYPTION_SECRET || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', // 32 hex bytes
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'bastion',
    password: process.env.DB_PASSWORD || 'bastion123',
    database: process.env.DB_NAME || 'bastion_host',
  },

  guacd: {
    host: process.env.GUACD_HOST || 'localhost',
    port: parseInt(process.env.GUACD_PORT || '4822', 10),
  },

  log: {
    level: process.env.LOG_LEVEL || 'debug',
  },

  session: {
    idleTimeout: parseInt(process.env.SESSION_IDLE_TIMEOUT || '900', 10),
    maxDuration: parseInt(process.env.SESSION_MAX_DURATION || '28800', 10),
    maxPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || '5', 10),
  },

  security: {
    loginMaxFails: parseInt(process.env.LOGIN_MAX_FAILS || '5', 10),
    loginLockMinutes: parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10),
    passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
    passwordExpireDays: parseInt(process.env.PASSWORD_EXPIRE_DAYS || '90', 10),
  },

  rateLimit: {
    loginMax: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '20', 10),
    loginWindowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS || '60000', 10),
    apiMax: parseInt(process.env.RATE_LIMIT_API_MAX || '200', 10),
    apiWindowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || '60000', 10),
  },

  retention: {
    commandLogDays: parseInt(process.env.COMMAND_LOG_RETENTION_DAYS || '90', 10),
    auditLogDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365', 10),
    sessionDays: parseInt(process.env.SESSION_RETENTION_DAYS || '90', 10),
  },
};

export default config;
