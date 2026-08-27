import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import { getPty, killPty, spawnPty } from './ptyManager.js';
import type { WorkflowMode } from './workflowCatalog.js';

export interface StartWorkflowStepRequest {
  workflowId: string;
  workflowSessionId: string | null;
  runId: string;
  phaseId: string;
  stepId: string;
  phaseName: string;
  stepName: string;
  mode: WorkflowMode;
  goal: string;
  repositoryTarget: string;
}

export interface StartWorkflowStepResult {
  workflowSessionId: string;
  transport: string;
}

export interface RespondToWorkflowInputRequest {
  workflowId: string;
  workflowSessionId: string;
  runId: string;
  requestId: string;
  answer: string;
}

export interface CloseWorkflowSessionRequest {
  workflowId: string;
  workflowSessionId: string;
}

export interface WorkflowSessionTransport {
  startStep(request: StartWorkflowStepRequest): Promise<StartWorkflowStepResult>;
  respondToInput(request: RespondToWorkflowInputRequest): Promise<void>;
  closeWorkflow(request: CloseWorkflowSessionRequest): Promise<void>;
}

/**
 * Keeps the workflow PTY under server ownership. It deliberately does not
 * report successful work: output is accepted only through the guarded API.
 */
export class CopilotPtyWorkflowTransport implements WorkflowSessionTransport {
  async startStep(request: StartWorkflowStepRequest): Promise<StartWorkflowStepResult> {
    const workflowSessionId = request.workflowSessionId ?? randomUUID();
    const ptyId = `workflow-${request.workflowId}`;
    const existingPty = getPty(ptyId);
    const prompt = [
      `Rocinante workflow ${request.workflowId}, run ${request.runId}.`,
      `Mode: ${request.mode}. Phase: ${request.phaseName}. Step: ${request.stepName}.`,
      `Goal: ${request.goal}`,
      'Complete only this step. Report output through the Rocinante workflow API.',
    ].join('\n');

    if (existingPty) {
      existingPty.write(`${prompt}\r`);
    } else {
      const ptyProcess = spawnPty(ptyId, {
        cwd: request.repositoryTarget,
        startupCommand: getConfig().launchCommands.copilot || 'copilot',
      });
      const timer = setTimeout(() => ptyProcess.write(`${prompt}\r`), 1_000);
      timer.unref();
    }

    return {
      workflowSessionId,
      transport: 'copilot-pty',
    };
  }

  async respondToInput(request: RespondToWorkflowInputRequest): Promise<void> {
    const ptyProcess = getPty(`workflow-${request.workflowId}`);
    if (!ptyProcess) {
      throw new Error(
        `Workflow session ${request.workflowSessionId} is not active in this server process`,
      );
    }

    ptyProcess.write(`${request.answer}\r`);
  }

  async closeWorkflow(request: CloseWorkflowSessionRequest): Promise<void> {
    killPty(`workflow-${request.workflowId}`);
  }
}
