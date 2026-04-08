import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawnPty, killPty, getPty } from '../services/ptyManager.js';
import { sanitizeSessionId } from '../utils/sanitize.js';

type TerminalInputMessage = {
  type: 'input';
  data: string;
};

type TerminalResizeMessage = {
  type: 'resize';
  cols: number;
  rows: number;
};

type TerminalMessage = TerminalInputMessage | TerminalResizeMessage;

function isValidInputMessage(message: unknown): message is TerminalInputMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const parsed = message as Partial<TerminalInputMessage>;
  return parsed.type === 'input' && typeof parsed.data === 'string';
}

function isValidResizeMessage(message: unknown): message is TerminalResizeMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const parsed = message as Partial<TerminalResizeMessage>;
  return (
    parsed.type === 'resize'
    && typeof parsed.cols === 'number'
    && Number.isFinite(parsed.cols)
    && parsed.cols > 0
    && typeof parsed.rows === 'number'
    && Number.isFinite(parsed.rows)
    && parsed.rows > 0
  );
}

function parseTerminalMessage(data: WebSocket.RawData): TerminalMessage | null {
  const rawText = typeof data === 'string' ? data : data.toString();

  try {
    const parsed = JSON.parse(rawText) as unknown;

    if (isValidInputMessage(parsed)) {
      return parsed;
    }

    if (isValidResizeMessage(parsed)) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function attachTerminalWebSocket(server: HttpServer): void {
  const terminalWss = new WebSocketServer({ server, path: '/ws/terminal' });

  terminalWss.on('connection', (ws, req: IncomingMessage) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const rawSessionId = url.searchParams.get('sessionId');
    const cwd = url.searchParams.get('cwd');
    const shell = url.searchParams.get('shell');

    // Validate sessionId before using it in paths or command strings
    let sessionId: string | null = null;
    if (rawSessionId) {
      try {
        sessionId = sanitizeSessionId(rawSessionId);
      } catch (err) {
        const error = err as Error;
        ws.send(JSON.stringify({ type: 'error', message: `Invalid session ID: ${error.message}` }));
        ws.close();
        return;
      }
    }

    const id = sessionId ?? randomUUID();

    // Reject duplicate connections for the same session
    if (sessionId && getPty(id)) {
      ws.send(JSON.stringify({ type: 'error', message: `Terminal already open for session ${sessionId}` }));
      ws.close();
      return;
    }

    const startupCommand = sessionId !== null ? `copilot --resume=${sessionId}` : undefined;
    let ptyProcess: ReturnType<typeof spawnPty>;
    try {
      ptyProcess = spawnPty(id, {
        cwd: cwd || undefined,
        startupCommand,
        shell: shell || undefined,
      });
    } catch (err) {
      const error = err as Error;
      ws.send(JSON.stringify({ type: 'error', message: `Failed to spawn terminal: ${error.message}` }));
      ws.close();
      return;
    }
    let isClosed = false;

    const disposeConnection = (): void => {
      if (isClosed) {
        return;
      }

      isClosed = true;
      killPty(id);
    };

    ws.on('error', (error) => {
      console.error(`[terminal] WebSocket error (${id}):`, error);
      disposeConnection();
    });

    const ptyDataDisposable = ptyProcess.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    const ptyExitDisposable = ptyProcess.onExit(({ exitCode }) => {
      const exitPayload = JSON.stringify({ type: 'exit', code: exitCode });
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(exitPayload);
      }

      ws.close();
      disposeConnection();
    });

    ws.on('message', (data) => {
      const message = parseTerminalMessage(data);
      if (!message) {
        return;
      }

      if (message.type === 'input') {
        ptyProcess.write(message.data);
        return;
      }

      ptyProcess.resize(message.cols, message.rows);
    });

    ws.on('close', () => {
      ptyDataDisposable.dispose();
      ptyExitDisposable.dispose();
      disposeConnection();
    });
  });

  terminalWss.on('error', (error) => {
    console.error('[terminal] WebSocket server error:', error);
  });
}
