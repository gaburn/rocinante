import * as os from 'node:os';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV !== 'production';

const ptyById = new Map<string, IPty>();

function resolveShell(shell?: string): string {
  const shellMap: Record<string, string> = {
    pwsh: 'pwsh',
    powershell: 'powershell.exe',
    cmd: 'cmd.exe',
    bash: 'bash',
  };
  const optionShell = shell?.toLowerCase();
  const configuredShell = shell
    ? (shellMap[optionShell ?? ''] || shell)
    : (os.platform() === 'win32' ? 'pwsh' : 'bash');
  const fallbackChain = ['pwsh', 'powershell.exe', 'cmd.exe', 'bash'];
  const shellCandidates = [configuredShell, ...fallbackChain].filter(
    (value, index, self) => self.indexOf(value) === index
  );

  const resolveShellPath = (shellName: string): string | null => {
    try {
      const whereResult = execSync(`where.exe ${shellName}`, { stdio: 'pipe' }).toString();
      const firstMatch = whereResult
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0);

      return firstMatch || null;
    } catch {
      return null;
    }
  };

  for (const shellCandidate of shellCandidates) {
    const resolvedPath = resolveShellPath(shellCandidate);
    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return configuredShell;
}

export function spawnPty(
  id: string,
  options?: { cwd?: string; startupCommand?: string; shell?: string }
): IPty {
  const existingPty = ptyById.get(id);
  if (existingPty) {
    return existingPty;
  }

  const cwd =
    options?.cwd && fs.existsSync(options.cwd) ? options.cwd : os.homedir();
  const resolvedShell = resolveShell(options?.shell);
  if (DEBUG) {
    console.log('[pty] Using shell:', resolvedShell);
  }
  const ptyProcess = pty.spawn(resolvedShell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env },
  });

  if (options?.startupCommand) {
    setTimeout(() => ptyProcess.write(options.startupCommand + '\r'), 500);
  }

  ptyById.set(id, ptyProcess);
  return ptyProcess;
}

export function getPty(id: string): IPty | undefined {
  return ptyById.get(id);
}

export function killPty(id: string): void {
  const ptyProcess = ptyById.get(id);
  if (!ptyProcess) {
    return;
  }

  ptyProcess.kill();
  ptyById.delete(id);
}

export function killAllPtys(): void {
  for (const [id, ptyProcess] of ptyById.entries()) {
    ptyProcess.kill();
    ptyById.delete(id);
  }
}
