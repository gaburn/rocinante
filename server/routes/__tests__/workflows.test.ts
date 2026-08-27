import { createServer, type Server } from 'node:http';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowsRouter } from '../workflows.js';
import {
  WorkflowService,
  type CorruptWorkflowView,
  type WorkflowView,
} from '../../services/workflowService.js';
import type {
  CloseWorkflowSessionRequest,
  RespondToWorkflowInputRequest,
  StartWorkflowStepRequest,
  StartWorkflowStepResult,
  WorkflowSessionTransport,
} from '../../services/workflowTransport.js';

class FakeWorkflowTransport implements WorkflowSessionTransport {
  readonly starts: StartWorkflowStepRequest[] = [];
  readonly responses: RespondToWorkflowInputRequest[] = [];
  readonly closes: CloseWorkflowSessionRequest[] = [];

  async startStep(request: StartWorkflowStepRequest): Promise<StartWorkflowStepResult> {
    this.starts.push(structuredClone(request));
    return {
      workflowSessionId: request.workflowSessionId ?? `session-${request.workflowId}`,
      transport: 'fake',
    };
  }

  async respondToInput(request: RespondToWorkflowInputRequest): Promise<void> {
    this.responses.push(structuredClone(request));
  }

  async closeWorkflow(request: CloseWorkflowSessionRequest): Promise<void> {
    this.closes.push(structuredClone(request));
  }
}

interface TestApi {
  server: Server;
  baseUrl: string;
}

interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: T;
}

interface RunStepResponse extends WorkflowView {
  runId: string;
  workflowSessionId: string;
}

async function startApi(service: WorkflowService): Promise<TestApi> {
  const app = express();
  app.use(express.json());
  app.use('/api', createWorkflowsRouter(service));
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server did not bind to a TCP port');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api`,
  };
}

async function stopApi(api: TestApi | null): Promise<void> {
  if (!api) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    api.server.close((error) => error ? reject(error) : resolve());
  });
}

async function request<T = Record<string, unknown>>(
  api: TestApi,
  method: string,
  route: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(`${api.baseUrl}${route}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json() as T,
  };
}

describe('workflow HTTP API', () => {
  let root: string;
  let dataDir: string;
  let repositoryTarget: string;
  let transport: FakeWorkflowTransport;
  let api: TestApi | null;

  beforeEach(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'rocinante-workflows-'));
    dataDir = path.join(root, 'state');
    repositoryTarget = path.join(root, 'repository');
    mkdirSync(repositoryTarget);
    transport = new FakeWorkflowTransport();
    api = await startApi(new WorkflowService({ dataDir, transport }));
  });

  afterEach(async () => {
    await stopApi(api);
    api = null;
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function createWorkflow(
    mode = 'simple',
    classification?: string,
  ): Promise<WorkflowView> {
    const result = await request<WorkflowView>(api!, 'POST', '/workflows', {
      name: `${mode} workflow`,
      goal: `Complete the ${mode} goal`,
      mode,
      repositoryTarget,
      classification,
    });
    expect(result.status).toBe(201);
    return result.body;
  }

  async function completeStep(
    workflow: WorkflowView,
    artifactRefs?: unknown[],
  ): Promise<WorkflowView> {
    const pointer = workflow.nextEligibleStep;
    expect(pointer).not.toBeNull();
    if (!pointer) {
      throw new Error('Expected a next eligible step');
    }
    const started = await request<RunStepResponse>(
      api!,
      'POST',
      `/workflows/${workflow.id}/run-step`,
      { phaseId: pointer.phaseId, stepId: pointer.stepId },
    );
    expect(started.status).toBe(200);
    const output = await request<WorkflowView>(
      api!,
      'POST',
      `/workflows/${workflow.id}/output`,
      {
        phaseId: pointer.phaseId,
        stepId: pointer.stepId,
        runId: started.body.runId,
        summary: `${pointer.phaseName} completed`,
        artifactRefs: artifactRefs ?? [
          `https://example.test/${workflow.id}/${pointer.phaseId}/${pointer.stepId}`,
        ],
      },
    );
    expect(output.status).toBe(200);
    if (output.body.status === 'awaiting-review') {
      const approved = await request<WorkflowView>(
        api!,
        'POST',
        `/workflows/${workflow.id}/approve`,
        {
          phaseId: pointer.phaseId,
          stepId: pointer.stepId,
          runId: started.body.runId,
        },
      );
      expect(approved.status).toBe(200);
      return approved.body;
    }
    return output.body;
  }

  it('creates, restores, and exposes malformed or unsupported state as errors', async () => {
    const invalid = await request(api!, 'POST', '/workflows', {
      name: '',
      goal: 'goal',
      mode: 'simple',
      repositoryTarget,
    });
    expect(invalid.status).toBe(400);

    const missingRepository = await request(api!, 'POST', '/workflows', {
      name: 'Bad repository',
      goal: 'goal',
      mode: 'simple',
      repositoryTarget: path.join(root, 'missing'),
    });
    expect(missingRepository.status).toBe(400);
    const missingClassification = await request(api!, 'POST', '/workflows', {
      name: 'Unclassified bug',
      goal: 'Fix it',
      mode: 'bug-fix',
      repositoryTarget,
    });
    expect(missingClassification.status).toBe(400);

    const workflow = await createWorkflow();
    expect(workflow.mode).toBe('simple');
    expect(workflow.workflowId).toBe(workflow.id);
    expect(workflow.repositoryTarget).toBe(realpathSync(repositoryTarget));
    expect(workflow.phases.map((phase) => phase.name)).toEqual([
      'Research',
      'Implement',
      'PR',
    ]);
    expect(workflow.phases.map((phase) => phase.status)).toEqual([
      'pending',
      'pending',
      'skipped',
    ]);
    expect(workflow.phases[0].steps).toHaveLength(1);
    expect(workflow.phases[0].title).toBe('Research');
    expect(workflow.phases[0].steps[0].canStart).toBe(true);
    expect(workflow.percent).toBe(0);
    expect(workflow.nextEligibleStep?.phaseId).toBe('research');

    await stopApi(api);
    writeFileSync(path.join(dataDir, 'broken.json'), '{broken');
    writeFileSync(path.join(dataDir, 'future.json'), JSON.stringify({ schemaVersion: 999 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    api = await startApi(new WorkflowService({
      dataDir,
      transport: new FakeWorkflowTransport(),
    }));

    const restored = await request<WorkflowView>(
      api,
      'GET',
      `/workflows/${workflow.id}`,
    );
    expect(restored.status).toBe(200);
    expect(restored.body.nextEligibleStep?.phaseId).toBe('research');

    const list = await request<{
      workflows: WorkflowView[];
      errors: Array<CorruptWorkflowView & { workflowId: string }>;
    }>(api, 'GET', '/workflows');
    expect(list.status).toBe(200);
    expect(list.body.errors.find((entry) => entry.id === 'broken')).toMatchObject({
      status: 'error',
      error: { code: 'invalid-state' },
    });
    expect(list.body.errors.find((entry) => entry.id === 'future')).toMatchObject({
      status: 'error',
      error: { code: 'unsupported-version' },
    });
    const corruptDetail = await request<CorruptWorkflowView>(api, 'GET', '/workflows/broken');
    expect(corruptDetail.body.status).toBe('error');
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('does not advance live state when persistence fails', async () => {
    const workflow = await createWorkflow();
    rmSync(dataDir, { recursive: true, force: true });
    writeFileSync(dataDir, 'blocks workflow persistence');
    const started = await request(
      api!,
      'POST',
      `/workflows/${workflow.id}/run-step`,
      workflow.nextEligibleStep,
    );
    expect(started.status).toBe(500);

    const unchanged = await request<WorkflowView>(
      api!,
      'GET',
      `/workflows/${workflow.id}`,
    );
    expect(unchanged.body.status).toBe('pending');
    expect(unchanged.body.nextEligibleStep?.phaseId).toBe('research');
    expect(unchanged.body.workflowSession).toBeNull();
  });

  it('keeps a Research run and successive input requests bound to one session and run', async () => {
    writeFileSync(path.join(repositoryTarget, 'evidence.md'), 'evidence');
    const workflow = await createWorkflow();
    const pointer = workflow.nextEligibleStep;
    const started = await request<RunStepResponse>(
      api!,
      'POST',
      `/workflows/${workflow.id}/run-step`,
      pointer,
    );
    expect(started.status).toBe(200);
    expect(started.body.runId).toEqual(expect.any(String));
    expect(started.body.workflowSessionId).toBe(`session-${workflow.id}`);
    expect(started.body.phases[0].status).toBe('running');

    const reconnected = await request<WorkflowView>(
      api!,
      'GET',
      `/workflows/${workflow.id}`,
    );
    expect(reconnected.body.status).toBe('running');
    expect(reconnected.body.workflowSession?.id).toBe(started.body.workflowSessionId);
    expect(transport.starts).toHaveLength(1);

    for (const requestId of ['research-question-1', 'research-question-2']) {
      const requested = await request<WorkflowView>(
        api!,
        'POST',
        `/workflows/${workflow.id}/input-request`,
        {
          phaseId: 'research',
          stepId: 'research',
          runId: started.body.runId,
          requestId,
          question: 'Which scope should be used?',
          choices: ['narrow', 'broad'],
          artifactRefs: requestId.endsWith('1') ? ['evidence.md'] : [],
        },
      );
      expect(requested.status).toBe(200);
      expect(requested.body.phases[0].step.inputRequest?.id).toBe(requestId);

      const blockedOutput = await request(
        api!,
        'POST',
        `/workflows/${workflow.id}/output`,
        {
          phaseId: 'research',
          stepId: 'research',
          runId: started.body.runId,
          summary: 'too soon',
        },
      );
      expect(blockedOutput.status).toBe(409);

      const wrongResponse = await request(
        api!,
        'POST',
        `/workflows/${workflow.id}/input-response`,
        { requestId: `${requestId}-stale`, answer: 'narrow' },
      );
      expect(wrongResponse.status).toBe(409);

      const resumed = await request<WorkflowView>(
        api!,
        'POST',
        `/workflows/${workflow.id}/input-response`,
        {
          requestId,
          runId: started.body.runId,
          ...(requestId.endsWith('1') ? { choice: 'narrow' } : { answer: 'narrow' }),
        },
      );
      expect(resumed.status).toBe(200);
      expect(resumed.body.phases[0].step.status).toBe('running');
      expect(resumed.body.phases[0].step.runId).toBe(started.body.runId);
    }

    expect(transport.responses).toHaveLength(2);
    expect(transport.responses.every((response) => response.runId === started.body.runId)).toBe(true);
    const output = await request<WorkflowView>(
      api!,
      'POST',
      `/workflows/${workflow.id}/output`,
      {
        phaseId: 'research',
        stepId: 'research',
        runId: started.body.runId,
        summary: 'Research evidence complete',
        artifacts: ['https://example.test/research'],
      },
    );
    expect(output.status).toBe(200);
    expect(output.body.phases[0].status).toBe('complete');
    expect(output.body.nextEligibleStep?.phaseId).toBe('implement');
  });

  it('validates artifacts and rejects concurrent, stale, and duplicate callbacks', async () => {
    const artifactPaths = Array.from({ length: 11 }, (_, index) => `artifact-${index}.txt`);
    for (const artifactPath of artifactPaths) {
      writeFileSync(path.join(repositoryTarget, artifactPath), artifactPath);
    }
    const workflow = await createWorkflow();
    const started = await request<RunStepResponse>(
      api!,
      'POST',
      `/workflows/${workflow.id}/run-step`,
      {},
    );
    expect(started.status).toBe(200);

    const concurrent = await request(api!, 'POST', `/workflows/${workflow.id}/run-step`, {});
    expect(concurrent.status).toBe(409);

    const baseOutput = {
      phaseId: 'research',
      stepId: 'research',
      runId: started.body.runId,
      summary: 'Research output',
    };
    for (const invalidArtifact of [
      'http://example.test/insecure',
      '../outside.txt',
      path.join(repositoryTarget, artifactPaths[0]),
      'missing.txt',
    ]) {
      const invalid = await request(
        api!,
        'POST',
        `/workflows/${workflow.id}/output`,
        { ...baseOutput, artifacts: [invalidArtifact] },
      );
      expect(invalid.status).toBe(400);
    }

    const stale = await request(
      api!,
      'POST',
      `/workflows/${workflow.id}/output`,
      { ...baseOutput, runId: 'stale-run' },
    );
    expect(stale.status).toBe(409);

    const overLimit = await request(
      api!,
      'POST',
      `/workflows/${workflow.id}/output`,
      { ...baseOutput, artifacts: artifactPaths },
    );
    expect(overLimit.status).toBe(400);

    const missingArtifact = await request(
      api!,
      'POST',
      `/workflows/${workflow.id}/output`,
      baseOutput,
    );
    expect(missingArtifact.status).toBe(409);

    const valid = await request<WorkflowView>(
      api!,
      'POST',
      `/workflows/${workflow.id}/output`,
      {
        ...baseOutput,
        artifacts: [...artifactPaths.slice(0, 10), artifactPaths[0]],
      },
    );
    expect(valid.status).toBe(200);
    expect(valid.body.artifacts).toHaveLength(10);

    const duplicate = await request(
      api!,
      'POST',
      `/workflows/${workflow.id}/output`,
      baseOutput,
    );
    expect(duplicate.status).toBe(409);
  });

  it('requires Implement output and approval and restores its review boundary', async () => {
    writeFileSync(path.join(repositoryTarget, 'implementation.md'), 'implementation');
    let workflow = await createWorkflow();
    workflow = await completeStep(workflow);
    expect(workflow.nextEligibleStep?.phaseId).toBe('implement');

    const started = await request<RunStepResponse>(
      api!,
      'POST',
      `/workflows/${workflow.id}/run-step`,
      workflow.nextEligibleStep,
    );
    const prematureApproval = await request(
      api!,
      'POST',
      `/workflows/${workflow.id}/approve`,
      { runId: started.body.runId },
    );
    expect(prematureApproval.status).toBe(409);

    const output = await request<WorkflowView>(
      api!,
      'POST',
      `/workflows/${workflow.id}/output`,
      {
        phaseId: 'implement',
        stepId: 'implement',
        runId: started.body.runId,
        summary: 'Implementation is ready',
        artifacts: ['implementation.md'],
      },
    );
    expect(output.status).toBe(200);
    expect(output.body.status).toBe('awaiting-review');
    expect(output.body.nextEligibleStep).toBeNull();

    await stopApi(api);
    api = await startApi(new WorkflowService({
      dataDir,
      transport: new FakeWorkflowTransport(),
    }));
    const restored = await request<WorkflowView>(
      api,
      'GET',
      `/workflows/${workflow.id}`,
    );
    expect(restored.body.status).toBe('awaiting-review');
    expect(restored.body.workflowSession?.id).toBe(`session-${workflow.id}`);

    const approved = await request<WorkflowView>(
      api,
      'POST',
      `/workflows/${workflow.id}/approve`,
      {
        phaseId: 'implement',
        stepId: 'implement',
        runId: started.body.runId,
      },
    );
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('complete');
    expect(approved.body.phases.map((phase) => phase.status)).toEqual([
      'complete',
      'complete',
      'skipped',
    ]);
    expect(readdirSync(dataDir).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });

  it('progresses every bounded mode variant, including both architecture paths', async () => {
    const variants = [
      {
        mode: 'full',
        expectedPhases: ['research', 'prototype', 'plan', 'implement', 'formal-review', 'finalize', 'pr'],
      },
      {
        mode: 'bug-fix',
        classification: 'confirmed',
        expectedPhases: ['intake', 'diagnose', 'fix', 'formal-review', 'finalize', 'pr'],
      },
      {
        mode: 'bug-fix',
        classification: 'unverified-external',
        expectedPhases: ['intake', 'diagnose', 'fix', 'formal-review', 'finalize', 'pr'],
      },
      {
        mode: 'architecture-health',
        choice: 'direct',
        expectedPhases: ['shape', 'specification', 'tasks', 'implement', 'formal-review', 'finalize', 'pr'],
      },
      {
        mode: 'architecture-health',
        choice: 'planned',
        expectedPhases: ['shape', 'specification', 'tasks', 'implement', 'formal-review', 'finalize', 'pr'],
      },
      {
        mode: 'wayfinding',
        expectedPhases: ['wayfind', 'specification', 'tasks', 'implement', 'formal-review', 'finalize', 'pr'],
      },
    ];

    for (const variant of variants) {
      let workflow = await createWorkflow(variant.mode, variant.classification);
      expect(workflow.phases.map((phase) => phase.id)).toEqual(variant.expectedPhases);
      if (variant.mode === 'architecture-health') {
        const invalidChoice = await request(
          api!,
          'POST',
          `/workflows/${workflow.id}/mode-gate`,
          { choice: 'unknown' },
        );
        expect(invalidChoice.status).toBe(400);
        const prematureGate = await request(
          api!,
          'POST',
          `/workflows/${workflow.id}/mode-gate`,
          { choice: variant.choice },
        );
        expect(prematureGate.status).toBe(409);
      }

      for (let transition = 0; transition < 12 && workflow.status !== 'complete'; transition += 1) {
        if (
          variant.mode === 'architecture-health'
          && workflow.phases.find((phase) => phase.id === 'shape')?.status === 'complete'
          && workflow.architectureChoice === null
        ) {
          expect(workflow.modeGate?.choices).toEqual(['direct', 'planned']);
          const gated = await request<WorkflowView>(
            api!,
            'POST',
            `/workflows/${workflow.id}/mode-gate`,
            { choice: variant.choice },
          );
          expect(gated.status).toBe(200);
          workflow = gated.body;
          continue;
        }

        const pointer = workflow.nextEligibleStep;
        expect(pointer).not.toBeNull();
        if (!pointer) {
          throw new Error('Expected a next eligible step');
        }
        const started = await request<RunStepResponse>(
          api!,
          'POST',
          `/workflows/${workflow.id}/run-step`,
          pointer,
        );
        expect(started.status).toBe(200);

        if (variant.mode === 'wayfinding' && pointer.phaseId === 'wayfind') {
          for (const requestId of ['map-scope', 'map-owner']) {
            const requested = await request(
              api!,
              'POST',
              `/workflows/${workflow.id}/input-request`,
              {
                phaseId: pointer.phaseId,
                stepId: pointer.stepId,
                runId: started.body.runId,
                requestId,
                question: `Answer ${requestId}`,
                choices: ['one', 'two'],
              },
            );
            expect(requested.status).toBe(200);
            const responded = await request(
              api!,
              'POST',
              `/workflows/${workflow.id}/input-response`,
              { requestId, answer: 'one' },
            );
            expect(responded.status).toBe(200);
          }
        }

        const output = await request<WorkflowView>(
          api!,
          'POST',
          `/workflows/${workflow.id}/output`,
          {
            phaseId: pointer.phaseId,
            stepId: pointer.stepId,
            runId: started.body.runId,
            summary: `${pointer.phaseName} complete`,
            artifacts: [
              `https://example.test/${workflow.id}/${pointer.phaseId}/${pointer.stepId}`,
            ],
          },
        );
        expect(output.status).toBe(200);
        workflow = output.body;
        if (workflow.status === 'awaiting-review') {
          const approved = await request<WorkflowView>(
            api!,
            'POST',
            `/workflows/${workflow.id}/approve`,
            {
              phaseId: pointer.phaseId,
              stepId: pointer.stepId,
              runId: started.body.runId,
            },
          );
          expect(approved.status).toBe(200);
          workflow = approved.body;
        }
      }

      expect(workflow.status).toBe('complete');
      expect(workflow.nextEligibleStep).toBeNull();
      if (variant.mode === 'bug-fix' && variant.classification === 'confirmed') {
        expect(workflow.phases[0].status).toBe('skipped');
        expect(workflow.phases[1].id).toBe('diagnose');
      }
      if (variant.mode === 'bug-fix' && variant.classification === 'unverified-external') {
        expect(workflow.phases[0]).toMatchObject({
          id: 'intake',
          name: 'Intake / Verification',
          status: 'complete',
        });
      }
      if (variant.mode === 'architecture-health' && variant.choice === 'direct') {
        expect(
          workflow.phases
            .filter((phase) => ['specification', 'tasks'].includes(phase.id))
            .map((phase) => phase.status),
        ).toEqual(['skipped', 'skipped']);
      }
      if (variant.mode === 'architecture-health' && variant.choice === 'planned') {
        expect(
          workflow.phases
            .filter((phase) => ['specification', 'tasks'].includes(phase.id))
            .map((phase) => phase.status),
        ).toEqual(['complete', 'complete']);
      }
    }
  }, 20_000);
});
