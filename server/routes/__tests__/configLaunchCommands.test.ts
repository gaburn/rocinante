import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Tests for launch commands persistence in server/config.ts
 * and the PATCH /api/config endpoint for launchCommands.
 *
 * Validates:
 * - updateConfig persists launchCommands to disk
 * - loadLaunchCommandsFromDisk reads saved commands
 * - PATCH /api/config with launchCommands updates in-memory + disk
 * - GET /api/config returns updated launchCommands
 * - Malformed disk files are handled gracefully
 */

// ── File-system spy setup ────────────────────────────────────────

const LAUNCH_COMMANDS_PATH = path.join(os.homedir(), '.rocinante', 'launch-commands.json');

let diskStore: Record<string, string> = {};

const realExistsSync = fs.existsSync;
const realReadFileSync = fs.readFileSync;
const realWriteFileSync = fs.writeFileSync;
const realMkdirSync = fs.mkdirSync;
const realStatSync = fs.statSync;

beforeEach(() => {
  diskStore = {};

  vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
    const normalized = String(p);
    if (normalized === LAUNCH_COMMANDS_PATH) {
      return normalized in diskStore;
    }
    if (normalized === path.join(os.homedir(), '.rocinante')) {
      return true;
    }
    return realExistsSync(normalized);
  });

  vi.spyOn(fs, 'readFileSync').mockImplementation((p, encoding) => {
    const normalized = String(p);
    if (normalized === LAUNCH_COMMANDS_PATH && normalized in diskStore) {
      return diskStore[normalized];
    }
    return realReadFileSync(p, encoding as BufferEncoding);
  });

  vi.spyOn(fs, 'writeFileSync').mockImplementation((p, data, _encoding) => {
    const normalized = String(p);
    if (normalized === LAUNCH_COMMANDS_PATH) {
      diskStore[normalized] = String(data);
      return;
    }
    return realWriteFileSync(p, data);
  });

  vi.spyOn(fs, 'mkdirSync').mockImplementation((p, opts) => {
    const normalized = String(p);
    if (normalized === path.join(os.homedir(), '.rocinante')) {
      return undefined;
    }
    return realMkdirSync(p, opts);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────

describe('launch commands disk persistence', () => {
  it('loadLaunchCommandsFromDisk returns empty object when file does not exist', async () => {
    const { loadLaunchCommandsFromDisk } = await import('../../config.js');
    const result = loadLaunchCommandsFromDisk();
    expect(result).toEqual({});
  });

  it('loadLaunchCommandsFromDisk reads valid JSON from disk', async () => {
    diskStore[LAUNCH_COMMANDS_PATH] = JSON.stringify({
      copilot: 'agency copilot --yolo',
      claude: 'claude',
      shell: '',
    });
    // Force re-import to test the function with the mock in place
    const { loadLaunchCommandsFromDisk } = await import('../../config.js');
    const result = loadLaunchCommandsFromDisk();
    expect(result).toEqual({
      copilot: 'agency copilot --yolo',
      claude: 'claude',
      shell: '',
    });
  });

  it('loadLaunchCommandsFromDisk ignores non-string values', async () => {
    diskStore[LAUNCH_COMMANDS_PATH] = JSON.stringify({
      copilot: 123,
      claude: 'custom-claude',
      shell: null,
    });
    const { loadLaunchCommandsFromDisk } = await import('../../config.js');
    const result = loadLaunchCommandsFromDisk();
    expect(result).toEqual({ claude: 'custom-claude' });
  });

  it('loadLaunchCommandsFromDisk handles malformed JSON gracefully', async () => {
    diskStore[LAUNCH_COMMANDS_PATH] = 'not valid json!!!';
    const { loadLaunchCommandsFromDisk } = await import('../../config.js');
    const result = loadLaunchCommandsFromDisk();
    expect(result).toEqual({});
  });

  it('saveLaunchCommandsToDisk writes JSON to the correct path', async () => {
    const { saveLaunchCommandsToDisk } = await import('../../config.js');
    saveLaunchCommandsToDisk({
      copilot: 'agency copilot --yolo',
      claude: 'claude',
      shell: '',
    });
    expect(diskStore[LAUNCH_COMMANDS_PATH]).toBeDefined();
    const written = JSON.parse(diskStore[LAUNCH_COMMANDS_PATH]);
    expect(written.copilot).toBe('agency copilot --yolo');
    expect(written.claude).toBe('claude');
    expect(written.shell).toBe('');
  });
});

describe('updateConfig persists launchCommands', () => {
  it('updateConfig saves launchCommands to disk when they change', async () => {
    const { updateConfig } = await import('../../config.js');
    const updated = updateConfig({
      launchCommands: {
        copilot: 'agency copilot --yolo',
        claude: 'claude',
        shell: '',
      },
    });
    expect(updated.launchCommands.copilot).toBe('agency copilot --yolo');
    // Verify disk write happened
    expect(diskStore[LAUNCH_COMMANDS_PATH]).toBeDefined();
    const onDisk = JSON.parse(diskStore[LAUNCH_COMMANDS_PATH]);
    expect(onDisk.copilot).toBe('agency copilot --yolo');
  });

  it('updateConfig does NOT write launchCommands to disk when other fields change', async () => {
    const { updateConfig } = await import('../../config.js');
    updateConfig({ tailBytes: 1048576 });
    expect(diskStore[LAUNCH_COMMANDS_PATH]).toBeUndefined();
  });

  it('getConfig returns updated launchCommands after updateConfig', async () => {
    const { updateConfig, getConfig } = await import('../../config.js');
    updateConfig({
      launchCommands: {
        copilot: 'copilot --verbose',
        claude: 'claude --debug',
        shell: 'bash',
      },
    });
    const config = getConfig();
    expect(config.launchCommands.copilot).toBe('copilot --verbose');
    expect(config.launchCommands.claude).toBe('claude --debug');
    expect(config.launchCommands.shell).toBe('bash');
  });
});

describe('PATCH /api/config with launchCommands', () => {
  it('PATCH updates launchCommands and persists to disk', async () => {
    const { default: configRouter } = await import('../config.js');
    const { getConfig } = await import('../../config.js');

    // Find the PATCH handler
    type RouteLayer = {
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (...args: unknown[]) => unknown }>;
      };
    };

    const layers = (configRouter as unknown as { stack: RouteLayer[] }).stack;
    const patchLayer = layers.find(
      (l) => l.route?.path === '/config' && l.route?.methods?.patch
    );
    expect(patchLayer).toBeDefined();

    const handler = patchLayer!.route!.stack[0].handle;

    // Simulate PATCH request
    const req = {
      body: {
        launchCommands: {
          copilot: 'agency copilot --yolo',
        },
      },
    };

    let responseStatus = 0;
    let responseBody: unknown = null;
    const res = {
      status: (code: number) => {
        responseStatus = code;
        return res;
      },
      json: (body: unknown) => {
        responseBody = body;
      },
    };

    handler(req, res);

    // Verify response includes updated launch commands
    expect(responseStatus).not.toBe(400);
    expect(responseBody).toBeDefined();
    const body = responseBody as { launchCommands: { copilot: string; claude: string; shell: string } };
    expect(body.launchCommands.copilot).toBe('agency copilot --yolo');

    // Verify in-memory config updated
    const config = getConfig();
    expect(config.launchCommands.copilot).toBe('agency copilot --yolo');

    // Verify disk write happened
    expect(diskStore[LAUNCH_COMMANDS_PATH]).toBeDefined();
    const onDisk = JSON.parse(diskStore[LAUNCH_COMMANDS_PATH]);
    expect(onDisk.copilot).toBe('agency copilot --yolo');
  });
});
