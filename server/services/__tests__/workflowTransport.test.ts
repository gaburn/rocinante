import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  getPty: vi.fn(),
  killPty: vi.fn(),
  spawnPty: vi.fn(),
  write: vi.fn(),
}));

vi.mock('../../config.js', () => ({
  getConfig: mocks.getConfig,
}));

vi.mock('../ptyManager.js', () => ({
  getPty: mocks.getPty,
  killPty: mocks.killPty,
  spawnPty: mocks.spawnPty,
}));

import { CopilotPtyWorkflowTransport } from '../workflowTransport.js';

const baseRequest = {
  workflowId: 'workflow-1',
  runId: 'run-1',
  phaseId: 'research',
  stepId: 'research',
  phaseName: 'Research',
  stepName: 'Research',
  mode: 'simple' as const,
  goal: 'Prove durable workflows',
  repositoryTarget: 'C:\\repo',
};

describe('CopilotPtyWorkflowTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfig.mockReturnValue({
      apiPort: 3001,
      launchCommands: { copilot: 'copilot-custom' },
    });

    mocks.getPty.mockReturnValue(undefined);
    mocks.spawnPty.mockReturnValue({ write: mocks.write });
  });

  it('reports whether the server-owned workflow PTY is active', () => {
    const transport = new CopilotPtyWorkflowTransport();
    expect(transport.isActive('workflow-1')).toBe(false);
    mocks.getPty.mockReturnValue({ write: mocks.write });
    expect(transport.isActive('workflow-1')).toBe(true);
  });

  it('assigns the generated workflow session ID when starting a new Copilot session', async () => {
    const transport = new CopilotPtyWorkflowTransport();

    const result = await transport.startStep({
      ...baseRequest,
      workflowSessionId: null,
    });

    expect(result.workflowSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(mocks.spawnPty).toHaveBeenCalledWith('workflow-workflow-1', {
      cwd: 'C:\\repo',
      startupCommand: `copilot-custom --session-id=${result.workflowSessionId}`,
    });
  });

  it('resumes the persisted workflow session after a server restart', async () => {
    const transport = new CopilotPtyWorkflowTransport();

    const result = await transport.startStep({
      ...baseRequest,
      workflowSessionId: '38ba614d-3927-472c-8b59-a2b6085bd347',
    });

    expect(result.workflowSessionId).toBe('38ba614d-3927-472c-8b59-a2b6085bd347');
    expect(mocks.spawnPty).toHaveBeenCalledWith('workflow-workflow-1', {
      cwd: 'C:\\repo',
      startupCommand: 'copilot-custom --resume=38ba614d-3927-472c-8b59-a2b6085bd347',
    });
  });

  it('reuses the active server-owned PTY without spawning another process', async () => {
    mocks.getPty.mockReturnValue({ write: mocks.write });
    const transport = new CopilotPtyWorkflowTransport();

    await transport.startStep({
      ...baseRequest,
      workflowSessionId: '38ba614d-3927-472c-8b59-a2b6085bd347',
    });

    expect(mocks.spawnPty).not.toHaveBeenCalled();
    expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining(
      'POST http://localhost:3001/api/workflows/workflow-1/register-output',
    ));
    expect(mocks.write).toHaveBeenCalledWith(expect.stringContaining(
      '"phaseId":"research","stepId":"research","runId":"run-1"',
    ));
  });
});
