import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import assetsRoutes from './routes/assets';
import authorizationsRoutes from './routes/authorizations';
import sessionsRoutes from './routes/sessions';
import auditRoutes from './routes/audit';
import securityRoutes from './routes/security';
import { errorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';
import pool from './database/connection';

const app = express();

// Trust reverse proxy (nginx) so req.ip uses X-Forwarded-For
app.set('trust proxy', 1);

// ---- Security headers ----
app.use(helmet({
  contentSecurityPolicy: false, // Allow xterm.js inline styles
}));

// ---- CORS ----
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5173', 'http://localhost:3001'],
  credentials: true,
}));

// ---- Body parsing ----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ---- Rate limiting (general API) ----
app.use('/api', apiLimiter);

// ---- Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/authorizations', authorizationsRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/security', securityRoutes);
app.use('/api', securityRoutes);  // also mount at /api for /api/notifications etc.

// ---- Dashboard stats ----
app.get('/api/dashboard/stats', async (_req, res) => {
  try {
    const [totalAssets] = await pool.query<any[]>('SELECT COUNT(*) as count FROM assets WHERE deleted_at IS NULL');
    const [onlineAssets] = await pool.query<any[]>("SELECT COUNT(*) as count FROM assets WHERE deleted_at IS NULL AND status = 'online'");
    const [totalUsers] = await pool.query<any[]>('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL');
    const [activeSessions] = await pool.query<any[]>("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'");
    const [todaySessions] = await pool.query<any[]>("SELECT COUNT(*) as count FROM sessions WHERE start_time >= CURDATE()");
    const [totalSessions] = await pool.query<any[]>('SELECT COUNT(*) as count FROM sessions');
    const [commandStats] = await pool.query<any[]>('SELECT COUNT(*) as total FROM command_logs');
    const [dangerousStats] = await pool.query<any[]>('SELECT COUNT(*) as count FROM command_logs WHERE is_dangerous = 1');
    const [recentSessions] = await pool.query<any[]>(
      `SELECT s.*, u.username, a.name as asset_name
       FROM sessions s JOIN users u ON s.user_id = u.id JOIN assets a ON s.asset_id = a.id
       ORDER BY s.start_time DESC LIMIT 5`
    );

    res.json({
      code: 0,
      message: 'ok',
      data: {
        totalAssets: totalAssets[0].count,
        onlineAssets: onlineAssets[0].count,
        offlineAssets: totalAssets[0].count - onlineAssets[0].count,
        totalUsers: totalUsers[0].count,
        activeSessions: activeSessions[0].count,
        todaySessions: todaySessions[0].count,
        totalSessions: totalSessions[0].count,
        commandStats: {
          total: commandStats[0].total,
          dangerous: dangerousStats[0].count,
        },
        recentSessions,
      },
    });
  } catch (err) {
    res.json({
      code: 0,
      message: 'ok',
      data: {
        totalAssets: 0, onlineAssets: 0, offlineAssets: 0,
        totalUsers: 0, activeSessions: 0, todaySessions: 0, totalSessions: 0,
        commandStats: { total: 0, dangerous: 0 },
        recentSessions: [],
      },
    });
  }
});

// ---- Health check ----
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', uptime: process.uptime(), db: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready', reason: 'db_not_connected' });
  }
});

// ---- Serve static files in production ----
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.resolve(__dirname, '../../client/dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, '../../client/dist/index.html'));
  });
}

// ---- Error handler (must be last) ----
app.use(errorHandler);

export default app;
