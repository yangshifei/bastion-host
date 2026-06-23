import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import url from 'url';
import app from './app';
import config from './config';
import logger from './utils/logger';
import { initPool } from './database/connection';
import { sessionManager } from './terminal/sessionManager';
import { handleSSHConnection } from './terminal/sshHandler';
import { handleRDPConnection } from './terminal/rdpHandler';
import { setSessionManager } from './routes/sessions';
import { startCleanupService } from './services/cleanupService';

async function main() {
  // Initialize database
  await initPool();

  // Initialize recordings directory
  const fs = await import('fs');
  const path = await import('path');
  const recordingsDir = path.resolve(process.cwd(), 'recordings');
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
    logger.info({ path: recordingsDir }, 'Created recordings directory');
  }

  // Create HTTP server
  const server = http.createServer(app);

  // WebSocket server (noServer mode — manual upgrade)
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols, request) => {
      const pathname = request.url ? url.parse(request.url).pathname : '';
      if (pathname === '/ws/rdp' && protocols.has('guacamole')) {
        return 'guacamole';
      }
      return false;
    },
  });

  // Set session manager reference for routes
  setSessionManager(sessionManager);

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? url.parse(request.url).pathname : '';

    if (pathname === '/ws/ssh') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        handleSSHConnection(ws, request, sessionManager);
      });
    } else if (pathname === '/ws/rdp') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        handleRDPConnection(ws, request, sessionManager);
      });
    } else {
      socket.destroy();
    }
  });

  // Start listening
  server.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'Server started');
  });

  // Start data retention cleanup service
  startCleanupService();

  // ---- Graceful shutdown ----
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    // Step 1: Stop accepting new connections
    server.close();
    logger.info('HTTP server closed');

    // Step 2: Notify and drain active sessions
    try {
      await sessionManager.drain(10000);
    } catch (err) {
      logger.error({ err }, 'Error draining sessions');
    }

    // Step 3: Close database pool
    try {
      const { pool } = await import('./database/connection');
      await pool.end();
      logger.info('Database pool closed');
    } catch (err) {
      logger.error({ err }, 'Error closing database pool');
    }

    // Step 4: Exit
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
