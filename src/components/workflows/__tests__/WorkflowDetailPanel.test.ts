import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowPhase } from '../../../types/workflows';
import { WorkflowPhaseItem } from '../WorkflowDetailPanel';

function phase(status: WorkflowPhase['status']): WorkflowPhase {
  return {
    id: 'research',
    name: 'Research',
    status,
    optional: false,
    steps: [{
      id: 'research',
      name: 'Research',
      status,
      requiresApproval: true,
      runId: status === 'running' ? 'run-1' : null,
      summary: null,
      artifacts: [],
      inputRequest: null,
      startedAt: null,
      completedAt: null,
      approvedAt: null,
      canStart: false,
      canApprove: false,
    }],
  };
}

describe('WorkflowPhaseItem', () => {
  it('exposes a running phase as an expanded disclosure with agent updates', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkflowPhaseItem, {
        phase: phase('running'),
        sessionId: 'session-1',
        isActing: false,
        startStep: vi.fn(),
        approve: vi.fn(),
      }),
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Research agent updates');
    expect(html).toContain('aria-label="Loading agent updates"');
  });

  it('keeps a pending phase collapsed', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkflowPhaseItem, {
        phase: phase('pending'),
        isActing: false,
        startStep: vi.fn(),
        approve: vi.fn(),
      }),
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Research agent updates');
  });
});
