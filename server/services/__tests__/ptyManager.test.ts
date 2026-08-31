import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('node-pty', () => ({ spawn: mocks.spawn }));
vi.mock('node:child_process', () => ({ execFileSync: mocks.execFileSync }));

import { getPty, killAllPtys, spawnPty } from '../ptyManager.js';

describe('ptyManager', () => {
  beforeEach(() => {
    killAllPtys();
    vi.clearAllMocks();
    mocks.execFileSync.mockReturnValue(Buffer.from('C:\\pwsh.exe\r\n'));
  });

  it('removes an exited PTY from the active process map', () => {
    let onExit: (() => void) | undefined;
    const ptyProcess = {
      kill: vi.fn(),
      onExit: vi.fn((callback: () => void) => {
        onExit = callback;
        return { dispose: vi.fn() };
      }),
    };
    mocks.spawn.mockReturnValue(ptyProcess);

    spawnPty('workflow-1');
    expect(getPty('workflow-1')).toBe(ptyProcess);

    onExit?.();
    expect(getPty('workflow-1')).toBeUndefined();
  });
});
