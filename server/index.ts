import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { getConfig } from './config.js';
import { initDatabase, closeDatabase } from './services/sqliteReader.js';
import { initArchiveStore } from './services/archiveStore.js';
import { killAllPtys } from './services/ptyManager.js';
import { shutdownMcpClient, warmupMcpSdk } from './services/adoMcpClient.js';
import sessionsRouter from './routes/sessions.js';
import configRouter from './routes/config.js';
import adoRouter from './routes/ado.js';
import telemetryRouter from './routes/telemetry.js';
import { attachTerminalWebSocket } from './routes/terminal.js';

const app = express();
const config = getConfig();
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV !== 'production';
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001'
)
  .split(',')
  .map((s) => s.trim());

app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests without origin (curl, server-to-server)
    res.header('Access-Control-Allow-Origin', allowedOrigins[0]);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use('/api', sessionsRouter);
app.use('/api', configRouter);
app.use('/api', adoRouter);
app.use('/api', telemetryRouter);

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(import.meta.dirname ?? '.', '..', 'dist');
  app.use(express.static(distPath));
  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

initDatabase();
initArchiveStore();

// Pre-load MCP SDK while event loop is free (before accepting requests)
await warmupMcpSdk();

const server = app.listen(config.apiPort, () => {
  if (DEBUG) console.log(`[server] API listening on port ${config.apiPort}`);
  if (DEBUG) console.log(`[server] Session state directory: ${config.sessionStateDir}`);
  if (DEBUG) console.log(`[server] SQLite database path: ${config.sqliteDbPath}`);
  if (DEBUG) console.log('[server] Terminal WebSocket at /ws/terminal');
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[server] Port ${config.apiPort} is already in use. Kill the existing process and try again.`,
    );
    console.error(
      `[server] Run: taskkill /F /IM node.exe  (or find the PID with: netstat -ano | findstr :${config.apiPort})`,
    );
    process.exit(1);
  }

  throw err;
});

attachTerminalWebSocket(server);

let isShuttingDown = false;

function shutdown(signal: 'SIGINT' | 'SIGTERM'): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  if (DEBUG) console.log(`[server] Received ${signal}. Shutting down...`);
  killAllPtys();
  shutdownMcpClient().catch(() => {});
  closeDatabase();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));



