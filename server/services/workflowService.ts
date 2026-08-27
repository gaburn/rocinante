import { randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeRepoPath, validateDirectory } from './launchManager.js';
import {
  WORKFLOW_CATALOG,
  parseBugFixClassification,
  parseWorkflowMode,
  type ArchitectureChoice,
  type BugFixClassification,
  type WorkflowMode,
  type WorkflowPhaseDefinition,
} from './workflowCatalog.js';
import {
  CopilotPtyWorkflowTransport,
  type WorkflowSessionTransport,
} from './workflowTransport.js';

const SCHEMA_VERSION = 1;
const MAX_ARTIFACTS = 10;
const MAX_ACTIVITY = 100;
const STEP_STATUSES = [
  'pending',
  'running',
  'awaiting-review',
  'complete',
  'skipped',
] as const;

export type WorkflowStepStatus = (typeof STEP_STATUSES)[number];
export type WorkflowStatus = Exclude<WorkflowStepStatus, 'skipped'>;

export interface WorkflowArtifact {
  type: 'url' | 'path';
  value: string;
}

export interface WorkflowInputRequest {
  id: string;
  question: string;
  choices: string[];
  artifactRefs: WorkflowArtifact[];
  createdAt: string;
}

export interface WorkflowStepState {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  requiresApproval: boolean;
  runId: string | null;
  summary: string | null;
  artifacts: WorkflowArtifact[];
  inputRequest: WorkflowInputRequest | null;
  startedAt: string | null;
  completedAt: string | null;
  approvedAt: string | null;
}

export interface WorkflowPhaseState {
  id: string;
  name: string;
  status: WorkflowStepStatus;
  step: WorkflowStepState;
}

export interface WorkflowSessionMetadata {
  id: string;
  transport: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowActivity {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

interface WorkflowState {
  schemaVersion: number;
  id: string;
  name: string;
  goal: string;
  mode: WorkflowMode;
  classification: BugFixClassification | null;
  repositoryTarget: string;
  architectureChoice: ArchitectureChoice | null;
  workflowSession: WorkflowSessionMetadata | null;
  phases: WorkflowPhaseState[];
  artifacts: WorkflowArtifact[];
  inputRequestIds: string[];
  activity: WorkflowActivity[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowStepPointer {
  phaseId: string;
  phaseName: string;
  stepId: string;
  stepName: string;
}

export interface WorkflowArtifactView extends WorkflowArtifact {
  path?: string;
  url?: string;
}

export interface WorkflowStepView extends WorkflowStepState {
  stepId: string;
  title: string;
  label: string;
  canStart: boolean;
  canApprove: boolean;
  artifacts: WorkflowArtifactView[];
}

export interface WorkflowPhaseView extends WorkflowPhaseState {
  phaseId: string;
  title: string;
  optional: boolean;
  steps: WorkflowStepView[];
}

export interface WorkflowInputRequestView {
  requestId: string;
  question: string;
  choices: string[];
  artifactRefs: WorkflowArtifactView[];
  phaseId: string;
  stepId: string;
  runId: string;
}

export interface WorkflowModeGateView {
  phaseId: string;
  stepId: string;
  question: string;
  choices: ArchitectureChoice[];
}

export interface WorkflowView extends Omit<WorkflowState, 'phases' | 'artifacts'> {
  workflowId: string;
  workflowSessionId: string | null;
  session: (WorkflowSessionMetadata & { workflowSessionId: string }) | null;
  phases: WorkflowPhaseView[];
  artifacts: WorkflowArtifactView[];
  status: WorkflowStatus;
  progress: {
    completed: number;
    total: number;
    percent: number;
  };
  percent: number;
  currentPhaseId: string | null;
  currentPhase: WorkflowStepPointer | null;
  nextEligibleStep: WorkflowStepPointer | null;
  nextStep: (WorkflowStepPointer & { label: string; action: 'run-step' }) | null;
  pendingInput: WorkflowInputRequestView | null;
  inputRequest: WorkflowInputRequestView | null;
  modeGate: WorkflowModeGateView | null;
}

export interface CorruptWorkflowView {
  id: string;
  message: string;
  status: 'error';
  sourceFile: string;
  error: {
    code: 'invalid-state' | 'unsupported-version';
    message: string;
  };
}

export interface CreateWorkflowInput {
  name?: unknown;
  goal?: unknown;
  mode?: unknown;
  repositoryTarget?: unknown;
  classification?: unknown;
}

export interface StepContextInput {
  phaseId?: unknown;
  stepId?: unknown;
  runId?: unknown;
}

export interface RegisterOutputInput extends StepContextInput {
  summary?: unknown;
  artifacts?: unknown;
  artifactRefs?: unknown;
}

export interface ApproveStepInput extends Partial<StepContextInput> {
  artifact?: unknown;
  artifacts?: unknown;
}

export interface InputRequestInput extends StepContextInput {
  requestId?: unknown;
  question?: unknown;
  choices?: unknown;
  artifactRefs?: unknown;
}

export interface InputResponseInput extends Partial<StepContextInput> {
  requestId?: unknown;
  answer?: unknown;
  choice?: unknown;
}

export class WorkflowProblem extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'WorkflowProblem';
  }
}

export interface WorkflowServiceOptions {
  dataDir?: string;
  transport?: WorkflowSessionTransport;
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WorkflowProblem(`${field} is required and must be a nonempty string`, 400, 'validation');
  }
  return value.trim();
}

function optionalMatchingString(value: unknown, field: string): string | null {
  if (value === undefined) {
    return null;
  }
  return requiredString(value, field);
}

function artifactKey(artifact: WorkflowArtifact): string {
  return `${artifact.type}:${artifact.value}`;
}

function uniqueArtifacts(artifacts: WorkflowArtifact[]): WorkflowArtifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = artifactKey(artifact);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function phasePointer(phase: WorkflowPhaseState): WorkflowStepPointer {
  return {
    phaseId: phase.id,
    phaseName: phase.name,
    stepId: phase.step.id,
    stepName: phase.step.name,
  };
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function assertState(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
  field: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assertState(
    actual.length === expected.length
      && actual.every((key, index) => key === expected[index]),
    `${field} contains missing or unsupported fields`,
  );
}

function assertNullableTimestamp(value: unknown, field: string): void {
  assertState(value === null || isTimestamp(value), `${field} must be a timestamp or null`);
}

export class WorkflowService {
  readonly dataDir: string;

  private readonly transport: WorkflowSessionTransport;
  private readonly now: () => Date;
  private readonly workflows = new Map<string, WorkflowState>();
  private readonly corruptWorkflows = new Map<string, CorruptWorkflowView>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(options: WorkflowServiceOptions = {}) {
    this.dataDir = path.resolve(
      options.dataDir
        ?? process.env.ROCINANTE_APP_DATA_DIR
        ?? path.join(os.homedir(), '.rocinante', 'workflows'),
    );
    this.transport = options.transport ?? new CopilotPtyWorkflowTransport();
    this.now = options.now ?? (() => new Date());
    this.restore();
  }

  list(): Array<WorkflowView | CorruptWorkflowView> {
    const valid = [...this.workflows.values()].map((state) => this.toView(state));
    const corrupt = [...this.corruptWorkflows.values()].map((entry) => structuredClone(entry));
    return [...valid, ...corrupt].sort((left, right) => left.id.localeCompare(right.id));
  }

  get(id: string): WorkflowView | CorruptWorkflowView {
    const state = this.workflows.get(id);
    if (state) {
      return this.toView(state);
    }

    const corrupt = this.corruptWorkflows.get(id);
    if (corrupt) {
      return structuredClone(corrupt);
    }

    throw new WorkflowProblem(`Workflow not found: ${id}`, 404, 'not-found');
  }

  async create(input: CreateWorkflowInput): Promise<WorkflowView> {
    const name = requiredString(input.name, 'name');
    const goal = requiredString(input.goal, 'goal');
    const repositoryInput = requiredString(input.repositoryTarget, 'repositoryTarget');
    const mode = parseWorkflowMode(input.mode);
    if (!mode) {
      throw new WorkflowProblem(
        'mode must be one of: simple, full, bug-fix, architecture-health, wayfinding',
        400,
        'validation',
      );
    }

    let classification: BugFixClassification | null = null;
    if (mode === 'bug-fix') {
      classification = parseBugFixClassification(input.classification);
      if (!classification) {
        throw new WorkflowProblem(
          'classification is required for bug-fix and must be confirmed or unverified-external',
          400,
          'validation',
        );
      }
    }

    let repositoryTarget: string;
    try {
      validateDirectory(repositoryInput);
      repositoryTarget = realpathSync(sanitizeRepoPath(repositoryInput));
      if (!statSync(repositoryTarget).isDirectory()) {
        throw new Error('not a directory');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkflowProblem(
        `repositoryTarget must resolve to an existing directory: ${message}`,
        400,
        'validation',
      );
    }

    const id = randomUUID();
    const timestamp = this.timestamp();
    const phases = WORKFLOW_CATALOG[mode].phases.map((definition) =>
      this.createPhaseState(definition, this.isInitiallySkipped(mode, classification, definition.id)),
    );
    const state: WorkflowState = {
      schemaVersion: SCHEMA_VERSION,
      id,
      name,
      goal,
      mode,
      classification,
      repositoryTarget,
      architectureChoice: null,
      workflowSession: null,
      phases,
      artifacts: [],
      inputRequestIds: [],
      activity: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.addActivity(state, 'created', `Created ${WORKFLOW_CATALOG[mode].name} workflow`);

    await this.writeState(state);
    this.workflows.set(id, state);
    return this.toView(state);
  }

  async runStep(id: string, input: StepContextInput): Promise<{
    runId: string;
    workflowSessionId: string;
    workflow: WorkflowView;
  }> {
    const requestedPhaseId = optionalMatchingString(input.phaseId, 'phaseId');
    const requestedStepId = optionalMatchingString(input.stepId, 'stepId');

    return this.serialized(id, async (state) => {
      const next = this.findNextEligible(state);
      if (!next) {
        throw new WorkflowProblem(
          'No step is currently eligible to run',
          409,
          'invalid-transition',
        );
      }
      if (
        (requestedPhaseId !== null && next.id !== requestedPhaseId)
        || (requestedStepId !== null && next.step.id !== requestedStepId)
      ) {
        throw new WorkflowProblem(
          `Only the next eligible step may run: ${next.id}/${next.step.id}`,
          409,
          'invalid-transition',
        );
      }

      const phaseId = next.id;
      const stepId = next.step.id;
      const runId = randomUUID();
      const startedAt = this.timestamp();
      next.status = 'running';
      next.step.status = 'running';
      next.step.runId = runId;
      next.step.startedAt = startedAt;
      state.updatedAt = startedAt;
      this.addActivity(state, 'step-started', `Started ${phaseId}/${stepId} run ${runId}`);

      try {
        const result = await this.transport.startStep({
          workflowId: state.id,
          workflowSessionId: state.workflowSession?.id ?? null,
          runId,
          phaseId,
          stepId,
          phaseName: next.name,
          stepName: next.step.name,
          mode: state.mode,
          goal: state.goal,
          repositoryTarget: state.repositoryTarget,
        });
        const workflowSessionId = requiredString(
          result.workflowSessionId,
          'transport workflowSessionId',
        );
        const transportName = requiredString(result.transport, 'transport name');
        if (state.workflowSession && state.workflowSession.id !== workflowSessionId) {
          throw new Error('Transport attempted to replace the linked workflow session');
        }

        const completedAt = this.timestamp();
        state.workflowSession = state.workflowSession ?? {
          id: workflowSessionId,
          transport: transportName,
          createdAt: completedAt,
          updatedAt: completedAt,
        };
        state.workflowSession.updatedAt = completedAt;
        state.updatedAt = completedAt;
        await this.writeState(state);

        return {
          runId,
          workflowSessionId,
          workflow: this.toView(state),
        };
      } catch (error) {
        next.status = 'pending';
        next.step.status = 'pending';
        next.step.runId = null;
        next.step.startedAt = null;
        const failedAt = this.timestamp();
        state.updatedAt = failedAt;
        this.addActivity(
          state,
          'dispatch-failed',
          `Failed to dispatch ${phaseId}/${stepId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await this.writeState(state);
        throw new WorkflowProblem(
          `Failed to dispatch workflow step: ${
            error instanceof Error ? error.message : String(error)
          }`,
          502,
          'transport-error',
        );
      }
    });
  }

  async registerOutput(id: string, input: RegisterOutputInput): Promise<WorkflowView> {
    const context = this.readRequiredContext(input);
    const summary = requiredString(input.summary, 'summary');

    return this.serialized(id, async (state) => {
      const phase = this.requireRunningStep(state, context);
      if (phase.step.inputRequest) {
        throw new WorkflowProblem(
          'Output is blocked while an input request is pending',
          409,
          'input-pending',
        );
      }

      const artifactValues = input.artifacts ?? input.artifactRefs;
      const artifacts = await this.readArtifacts(artifactValues, state.repositoryTarget, 'artifacts');
      const definition = WORKFLOW_CATALOG[state.mode].phases.find(
        (candidate) => candidate.id === phase.id,
      );
      if (definition?.requiresArtifact && artifacts.length === 0) {
        throw new WorkflowProblem(
          `Output for ${phase.id}/${phase.step.id} requires at least one artifact`,
          409,
          'artifact-required',
        );
      }
      this.addArtifacts(state, artifacts);
      phase.step.artifacts = uniqueArtifacts([...phase.step.artifacts, ...artifacts]);
      phase.step.summary = summary;
      const timestamp = this.timestamp();
      phase.step.status = phase.step.requiresApproval ? 'awaiting-review' : 'complete';
      phase.status = phase.step.status;
      if (phase.step.status === 'complete') {
        phase.step.completedAt = timestamp;
      }
      state.updatedAt = timestamp;
      this.addActivity(
        state,
        'output-registered',
        `Registered output for ${context.phaseId}/${context.stepId} run ${context.runId}`,
      );
      await this.writeState(state);
      return this.toView(state);
    });
  }

  async approve(id: string, input: ApproveStepInput): Promise<WorkflowView> {
    return this.serialized(id, async (state) => {
      const phase = state.phases.find((candidate) => candidate.status === 'awaiting-review');
      if (!phase) {
        throw new WorkflowProblem(
          'Approval requires output awaiting review',
          409,
          'invalid-transition',
        );
      }
      if (phase.step.inputRequest) {
        throw new WorkflowProblem(
          'Approval is blocked while an input request is pending',
          409,
          'input-pending',
        );
      }

      this.assertOptionalContext(phase, input);
      const artifactValues = input.artifacts === undefined && input.artifact !== undefined
        ? [input.artifact]
        : input.artifacts;
      const artifacts = await this.readArtifacts(
        artifactValues,
        state.repositoryTarget,
        'artifacts',
      );
      this.addArtifacts(state, artifacts);
      phase.step.artifacts = uniqueArtifacts([...phase.step.artifacts, ...artifacts]);
      const timestamp = this.timestamp();
      phase.status = 'complete';
      phase.step.status = 'complete';
      phase.step.approvedAt = timestamp;
      phase.step.completedAt = timestamp;
      state.updatedAt = timestamp;
      this.addActivity(
        state,
        'step-approved',
        `Approved ${phase.id}/${phase.step.id} run ${phase.step.runId}`,
      );
      await this.writeState(state);
      const view = this.toView(state);
      if (view.status === 'complete' && state.workflowSession) {
        try {
          await this.transport.closeWorkflow({
            workflowId: state.id,
            workflowSessionId: state.workflowSession.id,
          });
        } catch (error) {
          console.error('[workflows] Failed to close completed workflow session:', {
            workflowId: state.id,
            workflowSessionId: state.workflowSession.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return view;
    });
  }

  async selectArchitectureMode(id: string, choiceValue: unknown): Promise<WorkflowView> {
    const choice = typeof choiceValue === 'string'
      ? choiceValue.trim().toLowerCase()
      : '';
    if (choice !== 'direct' && choice !== 'planned') {
      throw new WorkflowProblem(
        'choice must be direct or planned',
        400,
        'validation',
      );
    }

    return this.serialized(id, async (state) => {
      if (state.mode !== 'architecture-health') {
        throw new WorkflowProblem(
          'Mode gates are only valid for architecture-health workflows',
          409,
          'invalid-transition',
        );
      }
      if (state.architectureChoice) {
        throw new WorkflowProblem('Architecture mode gate is already selected', 409, 'duplicate');
      }
      const shape = state.phases.find((phase) => phase.id === 'shape');
      if (!shape || shape.status !== 'complete') {
        throw new WorkflowProblem(
          'Architecture mode gate is available only after Shape completes',
          409,
          'invalid-transition',
        );
      }

      state.architectureChoice = choice;
      if (choice === 'direct') {
        for (const phaseId of ['specification', 'tasks']) {
          const phase = state.phases.find((candidate) => candidate.id === phaseId);
          if (!phase || phase.status !== 'pending') {
            throw new WorkflowProblem(
              `Cannot skip architecture phase ${phaseId} in its current state`,
              409,
              'invalid-transition',
            );
          }
          phase.status = 'skipped';
          phase.step.status = 'skipped';
        }
      }
      state.updatedAt = this.timestamp();
      this.addActivity(state, 'mode-gate', `Selected architecture path: ${choice}`);
      await this.writeState(state);
      return this.toView(state);
    });
  }

  async requestInput(id: string, input: InputRequestInput): Promise<WorkflowView> {
    const context = this.readRequiredContext(input);
    const requestId = requiredString(input.requestId, 'requestId');
    const question = requiredString(input.question, 'question');
    if (
      input.choices !== undefined
      && (!Array.isArray(input.choices)
        || input.choices.some((choice) => typeof choice !== 'string' || choice.trim().length === 0))
    ) {
      throw new WorkflowProblem('choices must be an array of nonempty strings', 400, 'validation');
    }
    const choices = input.choices === undefined
      ? []
      : [...new Set((input.choices as string[]).map((choice) => choice.trim()))];

    return this.serialized(id, async (state) => {
      const phase = this.requireRunningStep(state, context);
      if (phase.step.inputRequest) {
        throw new WorkflowProblem('An input request is already pending', 409, 'input-pending');
      }
      if (state.inputRequestIds.includes(requestId)) {
        throw new WorkflowProblem(`Input request is stale or duplicated: ${requestId}`, 409, 'duplicate');
      }

      const artifactRefs = await this.readArtifacts(
        input.artifactRefs,
        state.repositoryTarget,
        'artifactRefs',
      );
      this.addArtifacts(state, artifactRefs);
      const timestamp = this.timestamp();
      phase.step.inputRequest = {
        id: requestId,
        question,
        choices,
        artifactRefs,
        createdAt: timestamp,
      };
      state.inputRequestIds.push(requestId);
      state.updatedAt = timestamp;
      this.addActivity(
        state,
        'input-requested',
        `Input requested for ${context.phaseId}/${context.stepId} run ${context.runId}`,
      );
      await this.writeState(state);
      return this.toView(state);
    });
  }

  async respondToInput(id: string, input: InputResponseInput): Promise<WorkflowView> {
    const requestId = requiredString(input.requestId, 'requestId');
    const answer = requiredString(input.answer ?? input.choice, 'answer');

    return this.serialized(id, async (state) => {
      const phase = state.phases.find((candidate) => candidate.step.inputRequest?.id === requestId);
      if (!phase || phase.status !== 'running' || !phase.step.runId) {
        throw new WorkflowProblem(
          `Input request is missing, stale, or mismatched: ${requestId}`,
          409,
          'invalid-transition',
        );
      }
      this.assertOptionalContext(phase, input);
      if (!state.workflowSession) {
        throw new WorkflowProblem('Workflow session metadata is missing', 409, 'invalid-state');
      }

      await this.transport.respondToInput({
        workflowId: state.id,
        workflowSessionId: state.workflowSession.id,
        runId: phase.step.runId,
        requestId,
        answer,
      });
      phase.step.inputRequest = null;
      const timestamp = this.timestamp();
      state.workflowSession.updatedAt = timestamp;
      state.updatedAt = timestamp;
      this.addActivity(
        state,
        'input-responded',
        `Input response resumed ${phase.id}/${phase.step.id} run ${phase.step.runId}`,
      );
      await this.writeState(state);
      return this.toView(state);
    });
  }

  private restore(): void {
    mkdirSync(this.dataDir, { recursive: true });
    for (const fileName of readdirSync(this.dataDir)) {
      if (!fileName.endsWith('.json')) {
        continue;
      }

      const fileId = fileName.slice(0, -'.json'.length);
      try {
        const raw = JSON.parse(readFileSync(path.join(this.dataDir, fileName), 'utf8')) as unknown;
        const state = this.validateRestoredWorkflow(raw, fileId);
        this.workflows.set(state.id, state);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const unsupported = message.startsWith('Unsupported workflow schema version');
        this.corruptWorkflows.set(fileId, {
          id: fileId,
          message,
          status: 'error',
          sourceFile: fileName,
          error: {
            code: unsupported ? 'unsupported-version' : 'invalid-state',
            message,
          },
        });
        console.error(`[workflows] Failed to restore ${fileName}: ${message}`);
      }
    }
  }

  private validateRestoredWorkflow(raw: unknown, fileId: string): WorkflowState {
    assertState(isRecord(raw), 'Workflow state must be a JSON object');
    if (raw.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported workflow schema version: ${String(raw.schemaVersion)}`);
    }
    assertExactKeys(
      raw,
      [
        'schemaVersion',
        'id',
        'name',
        'goal',
        'mode',
        'classification',
        'repositoryTarget',
        'architectureChoice',
        'workflowSession',
        'phases',
        'artifacts',
        'inputRequestIds',
        'activity',
        'createdAt',
        'updatedAt',
      ],
      'Workflow state',
    );
    assertState(raw.id === fileId, 'Workflow identity must match its filename');
    assertState(typeof raw.name === 'string' && raw.name.trim().length > 0, 'Invalid workflow name');
    assertState(typeof raw.goal === 'string' && raw.goal.trim().length > 0, 'Invalid workflow goal');
    const mode = parseWorkflowMode(raw.mode);
    assertState(mode !== null && raw.mode === mode, 'Invalid workflow mode');
    assertState(
      typeof raw.repositoryTarget === 'string' && path.isAbsolute(raw.repositoryTarget),
      'Invalid repositoryTarget',
    );
    assertState(raw.classification === null || typeof raw.classification === 'string', 'Invalid classification');
    const classification = raw.classification === null
      ? null
      : parseBugFixClassification(raw.classification);
    if (mode === 'bug-fix') {
      assertState(classification !== null, 'Bug Fix classification is required');
    } else {
      assertState(raw.classification === null, 'Classification is valid only for Bug Fix');
    }
    assertState(
      raw.architectureChoice === null
        || raw.architectureChoice === 'direct'
        || raw.architectureChoice === 'planned',
      'Invalid architecture choice',
    );
    if (mode !== 'architecture-health') {
      assertState(raw.architectureChoice === null, 'Architecture choice is valid only in Architecture Health');
    }
    assertState(Array.isArray(raw.phases), 'Workflow phases must be an array');
    assertState(Array.isArray(raw.artifacts), 'Workflow artifacts must be an array');
    assertState(Array.isArray(raw.inputRequestIds), 'inputRequestIds must be an array');
    assertState(Array.isArray(raw.activity), 'Workflow activity must be an array');
    assertState(isTimestamp(raw.createdAt) && isTimestamp(raw.updatedAt), 'Invalid workflow timestamps');

    const artifacts = raw.artifacts.map((artifact, index) =>
      this.validatePersistedArtifact(artifact, raw.repositoryTarget as string, `artifacts[${index}]`),
    );
    assertState(artifacts.length <= MAX_ARTIFACTS, `Workflow exceeds ${MAX_ARTIFACTS} artifacts`);
    assertState(
      uniqueArtifacts(artifacts).length === artifacts.length,
      'Workflow artifacts must be deduplicated',
    );
    const artifactKeys = new Set(artifacts.map(artifactKey));

    const definitions = WORKFLOW_CATALOG[mode].phases;
    assertState(raw.phases.length === definitions.length, 'Workflow phases do not match the mode catalog');
    const phases = raw.phases.map((phase, index) =>
      this.validatePersistedPhase(
        phase,
        definitions[index],
        raw.repositoryTarget as string,
        artifactKeys,
      ),
    );
    this.validatePersistedProgression(
      mode,
      classification,
      raw.architectureChoice as ArchitectureChoice | null,
      phases,
    );

    assertState(
      raw.inputRequestIds.every((value) => typeof value === 'string' && value.length > 0),
      'inputRequestIds must contain nonempty strings',
    );
    assertState(
      new Set(raw.inputRequestIds as string[]).size === raw.inputRequestIds.length,
      'inputRequestIds must be deduplicated',
    );
    assertState(
      phases.every(
        (phase) =>
          phase.step.inputRequest === null
          || (raw.inputRequestIds as string[]).includes(phase.step.inputRequest.id),
      ),
      'A pending input request is missing from inputRequestIds',
    );
    assertState(raw.activity.length <= MAX_ACTIVITY, `Workflow activity exceeds ${MAX_ACTIVITY} entries`);
    const activity = raw.activity.map((entry, index) => {
      assertState(isRecord(entry), `activity[${index}] must be an object`);
      assertExactKeys(entry, ['id', 'type', 'message', 'createdAt'], `activity[${index}]`);
      assertState(
        typeof entry.id === 'string'
          && typeof entry.type === 'string'
          && typeof entry.message === 'string'
          && isTimestamp(entry.createdAt),
        `Invalid activity[${index}]`,
      );
      return entry as unknown as WorkflowActivity;
    });

    let workflowSession: WorkflowSessionMetadata | null = null;
    if (raw.workflowSession !== null) {
      assertState(isRecord(raw.workflowSession), 'Invalid workflowSession');
      assertExactKeys(
        raw.workflowSession,
        ['id', 'transport', 'createdAt', 'updatedAt'],
        'workflowSession',
      );
      assertState(
        typeof raw.workflowSession.id === 'string'
          && raw.workflowSession.id.length > 0
          && typeof raw.workflowSession.transport === 'string'
          && raw.workflowSession.transport.length > 0
          && isTimestamp(raw.workflowSession.createdAt)
          && isTimestamp(raw.workflowSession.updatedAt),
        'Invalid workflowSession',
      );
      workflowSession = raw.workflowSession as unknown as WorkflowSessionMetadata;
    }
    const hasRun = phases.some((phase) => phase.step.runId !== null);
    assertState(!hasRun || workflowSession !== null, 'Run state requires workflowSession metadata');

    return {
      schemaVersion: SCHEMA_VERSION,
      id: fileId,
      name: raw.name,
      goal: raw.goal,
      mode,
      classification,
      repositoryTarget: raw.repositoryTarget,
      architectureChoice: raw.architectureChoice as ArchitectureChoice | null,
      workflowSession,
      phases,
      artifacts,
      inputRequestIds: [...raw.inputRequestIds] as string[],
      activity,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private validatePersistedPhase(
    raw: unknown,
    definition: WorkflowPhaseDefinition,
    repositoryTarget: string,
    workflowArtifactKeys: Set<string>,
  ): WorkflowPhaseState {
    assertState(isRecord(raw), `Phase ${definition.id} must be an object`);
    assertExactKeys(raw, ['id', 'name', 'status', 'step'], `Phase ${definition.id}`);
    assertState(raw.id === definition.id && raw.name === definition.name, `Invalid phase ${definition.id}`);
    assertState(STEP_STATUSES.includes(raw.status as WorkflowStepStatus), `Invalid status for ${definition.id}`);
    assertState(isRecord(raw.step), `Invalid step for ${definition.id}`);
    const step = raw.step;
    assertExactKeys(
      step,
      [
        'id',
        'name',
        'status',
        'requiresApproval',
        'runId',
        'summary',
        'artifacts',
        'inputRequest',
        'startedAt',
        'completedAt',
        'approvedAt',
      ],
      `Step ${definition.id}`,
    );
    assertState(
      step.id === definition.stepId
        && step.name === definition.stepName
        && step.requiresApproval === definition.requiresApproval,
      `Step ${definition.stepId} does not match the mode catalog`,
    );
    assertState(STEP_STATUSES.includes(step.status as WorkflowStepStatus), `Invalid step status for ${definition.id}`);
    assertState(step.status === raw.status, `Phase and step status differ for ${definition.id}`);
    assertState(step.runId === null || (typeof step.runId === 'string' && step.runId.length > 0), `Invalid runId for ${definition.id}`);
    assertState(step.summary === null || typeof step.summary === 'string', `Invalid summary for ${definition.id}`);
    assertState(Array.isArray(step.artifacts), `Invalid artifacts for ${definition.id}`);
    assertNullableTimestamp(step.startedAt, `${definition.id}.startedAt`);
    assertNullableTimestamp(step.completedAt, `${definition.id}.completedAt`);
    assertNullableTimestamp(step.approvedAt, `${definition.id}.approvedAt`);

    const artifacts = step.artifacts.map((artifact, index) =>
      this.validatePersistedArtifact(
        artifact,
        repositoryTarget,
        `${definition.id}.artifacts[${index}]`,
      ),
    );
    assertState(
      artifacts.every((artifact) => workflowArtifactKeys.has(artifactKey(artifact))),
      `Step ${definition.id} references an unregistered artifact`,
    );
    assertState(uniqueArtifacts(artifacts).length === artifacts.length, `Step ${definition.id} artifacts are duplicated`);

    let inputRequest: WorkflowInputRequest | null = null;
    if (step.inputRequest !== null) {
      assertState(isRecord(step.inputRequest), `Invalid input request for ${definition.id}`);
      const request = step.inputRequest;
      assertExactKeys(
        request,
        ['id', 'question', 'choices', 'artifactRefs', 'createdAt'],
        `Input request for ${definition.id}`,
      );
      assertState(
        typeof request.id === 'string'
          && request.id.length > 0
          && typeof request.question === 'string'
          && request.question.length > 0
          && Array.isArray(request.choices)
          && request.choices.every((choice) => typeof choice === 'string' && choice.length > 0)
          && Array.isArray(request.artifactRefs)
          && isTimestamp(request.createdAt),
        `Invalid input request for ${definition.id}`,
      );
      const artifactRefs = request.artifactRefs.map((artifact, index) =>
        this.validatePersistedArtifact(
          artifact,
          repositoryTarget,
          `${definition.id}.inputRequest.artifactRefs[${index}]`,
        ),
      );
      assertState(
        artifactRefs.every((artifact) => workflowArtifactKeys.has(artifactKey(artifact))),
        `Input request for ${definition.id} references an unregistered artifact`,
      );
      inputRequest = {
        id: request.id,
        question: request.question,
        choices: [...request.choices] as string[],
        artifactRefs,
        createdAt: request.createdAt,
      };
      assertState(
        new Set(request.choices as string[]).size === request.choices.length,
        `Input request choices for ${definition.id} must be deduplicated`,
      );
      assertState(
        uniqueArtifacts(artifactRefs).length === artifactRefs.length,
        `Input request artifacts for ${definition.id} must be deduplicated`,
      );
    }

    const status = raw.status as WorkflowStepStatus;
    if (status === 'pending' || status === 'skipped') {
      assertState(step.runId === null, `${definition.id} cannot have a runId while ${status}`);
      assertState(
        step.summary === null
          && step.artifacts.length === 0
          && step.inputRequest === null
          && step.startedAt === null
          && step.completedAt === null
          && step.approvedAt === null,
        `${definition.id} contains work while ${status}`,
      );
    } else {
      assertState(typeof step.runId === 'string', `${definition.id} requires a runId while ${status}`);
      assertState(isTimestamp(step.startedAt), `${definition.id} requires startedAt while ${status}`);
    }
    if (status === 'running') {
      assertState(
        step.summary === null && step.completedAt === null && step.approvedAt === null,
        `${definition.id} running state contains completed output`,
      );
    }
    if (status === 'awaiting-review') {
      assertState(
        typeof step.summary === 'string'
          && step.summary.trim().length > 0
          && step.completedAt === null
          && step.approvedAt === null,
        `${definition.id} awaiting-review state is incomplete`,
      );
    }
    if (status === 'complete') {
      assertState(
        typeof step.summary === 'string'
          && step.summary.trim().length > 0
          && isTimestamp(step.completedAt),
        `${definition.id} complete state is missing output`,
      );
      assertState(
        definition.requiresApproval
          ? isTimestamp(step.approvedAt)
          : step.approvedAt === null,
        `${definition.id} approval state does not match the catalog`,
      );
    }
    assertState(inputRequest === null || status === 'running', 'Input request requires a running step');
    assertState(status !== 'awaiting-review' || definition.requiresApproval, 'Only review steps may await review');

    return {
      id: definition.id,
      name: definition.name,
      status,
      step: {
        id: definition.stepId,
        name: definition.stepName,
        status,
        requiresApproval: definition.requiresApproval,
        runId: step.runId as string | null,
        summary: step.summary as string | null,
        artifacts,
        inputRequest,
        startedAt: step.startedAt as string | null,
        completedAt: step.completedAt as string | null,
        approvedAt: step.approvedAt as string | null,
      },
    };
  }

  private validatePersistedProgression(
    mode: WorkflowMode,
    classification: BugFixClassification | null,
    architectureChoice: ArchitectureChoice | null,
    phases: WorkflowPhaseState[],
  ): void {
    const skipped = new Set(
      phases.filter((phase) => phase.status === 'skipped').map((phase) => phase.id),
    );
    if (mode === 'simple') {
      assertState(skipped.size === 1 && skipped.has('pr'), 'Simple must omit only its optional PR');
    } else if (mode === 'bug-fix' && classification === 'confirmed') {
      assertState(
        skipped.size === 1 && skipped.has('intake'),
        'Confirmed Bug Fix must skip Intake / Verification',
      );
    } else if (mode === 'architecture-health' && architectureChoice === 'direct') {
      assertState(
        skipped.size === 2 && skipped.has('specification') && skipped.has('tasks'),
        'Direct Architecture Health must skip Specification and Tasks',
      );
    } else {
      assertState(skipped.size === 0, 'Workflow contains unexpected skipped phases');
    }

    if (mode === 'architecture-health' && architectureChoice !== null) {
      assertState(phases[0].status === 'complete', 'Architecture choice requires completed Shape');
    }
    if (mode === 'architecture-health' && architectureChoice === null) {
      assertState(
        phases.slice(1).every((phase) => phase.status === 'pending'),
        'Architecture phases cannot advance before the mode gate',
      );
    }

    let encounteredIncomplete = false;
    let activeCount = 0;
    for (const phase of phases) {
      if (phase.status === 'skipped') {
        continue;
      }
      if (phase.status === 'running' || phase.status === 'awaiting-review') {
        activeCount += 1;
      }
      if (phase.status === 'complete') {
        assertState(!encounteredIncomplete, `Completed phase ${phase.id} is out of order`);
      } else {
        encounteredIncomplete = true;
      }
    }
    assertState(activeCount <= 1, 'Workflow has concurrent active work');
  }

  private validatePersistedArtifact(
    raw: unknown,
    repositoryTarget: string,
    field: string,
  ): WorkflowArtifact {
    assertState(isRecord(raw), `${field} must be an artifact object`);
    assertExactKeys(raw, ['type', 'value'], field);
    assertState(
      (raw.type === 'url' || raw.type === 'path') && typeof raw.value === 'string',
      `${field} is invalid`,
    );
    try {
      const validated = this.validateArtifact(raw, repositoryTarget);
      assertState(
        validated.type === raw.type && validated.value === raw.value,
        `${field} is not canonical`,
      );
      return validated;
    } catch (error) {
      throw new Error(`${field}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private createPhaseState(
    definition: WorkflowPhaseDefinition,
    skipped: boolean,
  ): WorkflowPhaseState {
    const status: WorkflowStepStatus = skipped ? 'skipped' : 'pending';
    return {
      id: definition.id,
      name: definition.name,
      status,
      step: {
        id: definition.stepId,
        name: definition.stepName,
        status,
        requiresApproval: definition.requiresApproval,
        runId: null,
        summary: null,
        artifacts: [],
        inputRequest: null,
        startedAt: null,
        completedAt: null,
        approvedAt: null,
      },
    };
  }

  private isInitiallySkipped(
    mode: WorkflowMode,
    classification: BugFixClassification | null,
    phaseId: string,
  ): boolean {
    return (mode === 'simple' && phaseId === 'pr')
      || (mode === 'bug-fix'
        && classification === 'confirmed'
        && phaseId === 'intake');
  }

  private getMutableState(id: string): WorkflowState {
    const state = this.workflows.get(id);
    if (state) {
      return state;
    }
    if (this.corruptWorkflows.has(id)) {
      throw new WorkflowProblem(`Workflow state is invalid: ${id}`, 422, 'invalid-state');
    }
    throw new WorkflowProblem(`Workflow not found: ${id}`, 404, 'not-found');
  }

  private async serialized<T>(
    id: string,
    operation: (state: WorkflowState) => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queueMarker = previous.catch(() => {}).then(() => current);
    this.queues.set(id, queueMarker);
    await previous.catch(() => {});
    try {
      return await operation(this.getMutableState(id));
    } finally {
      release();
      if (this.queues.get(id) === queueMarker) {
        this.queues.delete(id);
      }
    }
  }

  private readRequiredContext(input: StepContextInput): {
    phaseId: string;
    stepId: string;
    runId: string;
  } {
    return {
      phaseId: requiredString(input.phaseId, 'phaseId'),
      stepId: requiredString(input.stepId, 'stepId'),
      runId: requiredString(input.runId, 'runId'),
    };
  }

  private requireRunningStep(
    state: WorkflowState,
    context: { phaseId: string; stepId: string; runId: string },
  ): WorkflowPhaseState {
    const phase = state.phases.find((candidate) => candidate.id === context.phaseId);
    if (!phase || phase.step.id !== context.stepId) {
      throw new WorkflowProblem('Output phase or step is mismatched', 409, 'mismatch');
    }
    if (phase.status !== 'running' || phase.step.status !== 'running') {
      throw new WorkflowProblem('Step is not running; callback is stale or duplicated', 409, 'stale');
    }
    if (phase.step.runId !== context.runId) {
      throw new WorkflowProblem('Output runId is missing, mismatched, or stale', 409, 'stale');
    }
    return phase;
  }

  private assertOptionalContext(
    phase: WorkflowPhaseState,
    input: Partial<StepContextInput>,
  ): void {
    const phaseId = optionalMatchingString(input.phaseId, 'phaseId');
    const stepId = optionalMatchingString(input.stepId, 'stepId');
    const runId = optionalMatchingString(input.runId, 'runId');
    if (
      (phaseId !== null && phaseId !== phase.id)
      || (stepId !== null && stepId !== phase.step.id)
      || (runId !== null && runId !== phase.step.runId)
    ) {
      throw new WorkflowProblem('Step context is mismatched or stale', 409, 'mismatch');
    }
  }

  private async readArtifacts(
    raw: unknown,
    repositoryTarget: string,
    field: string,
  ): Promise<WorkflowArtifact[]> {
    if (raw === undefined) {
      return [];
    }
    if (!Array.isArray(raw)) {
      throw new WorkflowProblem(`${field} must be an array`, 400, 'validation');
    }
    const artifacts = raw.map((artifact, index) => {
      try {
        return this.validateArtifact(artifact, repositoryTarget);
      } catch (error) {
        throw new WorkflowProblem(
          `${field}[${index}]: ${error instanceof Error ? error.message : String(error)}`,
          400,
          'invalid-artifact',
        );
      }
    });
    return uniqueArtifacts(artifacts);
  }

  private validateArtifact(raw: unknown, repositoryTarget: string): WorkflowArtifact {
    let value: string;
    let declaredType: unknown;
    if (typeof raw === 'string') {
      value = raw.trim();
    } else if (isRecord(raw)) {
      const candidate = raw.value ?? raw.ref ?? raw.url ?? raw.path;
      if (typeof candidate !== 'string') {
        throw new Error('artifact value must be a string');
      }
      value = candidate.trim();
      declaredType = raw.type ?? raw.kind;
      if (declaredType === undefined && typeof raw.url === 'string') {
        declaredType = 'url';
      }
      if (declaredType === undefined && typeof raw.path === 'string') {
        declaredType = 'path';
      }
    } else {
      throw new Error('artifact must be a string or artifact object');
    }
    if (value.length === 0 || value.includes('\0')) {
      throw new Error('artifact value must be nonempty and contain no null bytes');
    }

    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || declaredType === 'url') {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error('artifact URL is invalid');
      }
      if (url.protocol !== 'https:') {
        throw new Error('artifact URLs must use HTTPS');
      }
      if (declaredType !== undefined && declaredType !== 'url') {
        throw new Error('artifact type does not match its URL value');
      }
      return { type: 'url', value: url.toString() };
    }

    if (declaredType !== undefined && declaredType !== 'path') {
      throw new Error('local artifact type must be path');
    }
    if (path.isAbsolute(value)) {
      throw new Error('local artifact paths must be repository-relative');
    }
    if (value.split(/[\\/]+/).includes('..')) {
      throw new Error('local artifact paths cannot contain traversal segments');
    }

    const candidatePath = path.resolve(repositoryTarget, value);
    let realArtifactPath: string;
    try {
      realArtifactPath = realpathSync(candidatePath);
      statSync(realArtifactPath);
    } catch {
      throw new Error('local artifact path does not exist');
    }
    const relative = path.relative(repositoryTarget, realArtifactPath);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error('local artifact path resolves outside repositoryTarget');
    }
    return {
      type: 'path',
      value: (relative || '.').split(path.sep).join('/'),
    };
  }

  private addArtifacts(state: WorkflowState, incoming: WorkflowArtifact[]): void {
    const combined = uniqueArtifacts([...state.artifacts, ...incoming]);
    if (combined.length > MAX_ARTIFACTS) {
      throw new WorkflowProblem(
        `A workflow may contain at most ${MAX_ARTIFACTS} artifacts`,
        400,
        'artifact-limit',
      );
    }
    state.artifacts = combined;
  }

  private findNextEligible(state: WorkflowState): WorkflowPhaseState | null {
    if (state.phases.some((phase) => phase.status === 'running' || phase.status === 'awaiting-review')) {
      return null;
    }
    for (const phase of state.phases) {
      if (phase.status === 'complete' || phase.status === 'skipped') {
        continue;
      }
      if (
        state.mode === 'architecture-health'
        && phase.id !== 'shape'
        && state.architectureChoice === null
      ) {
        return null;
      }
      return phase.status === 'pending' ? phase : null;
    }
    return null;
  }

  private toView(state: WorkflowState): WorkflowView {
    const copy = structuredClone(state);
    const active = copy.phases.find(
      (phase) => phase.status === 'running' || phase.status === 'awaiting-review',
    );
    const next = this.findNextEligible(copy);
    const selected = copy.phases.filter((phase) => phase.status !== 'skipped');
    const completed = selected.filter((phase) => phase.status === 'complete').length;
    const status: WorkflowStatus = active?.status === 'awaiting-review'
      ? 'awaiting-review'
      : active?.status === 'running'
        ? 'running'
        : completed === selected.length
          ? 'complete'
          : 'pending';
    const progress = {
      completed,
      total: selected.length,
      percent: selected.length === 0 ? 100 : Math.round((completed / selected.length) * 100),
    };
    const pendingPhase = copy.phases.find((phase) => phase.step.inputRequest !== null);
    const pendingRequest = pendingPhase?.step.inputRequest;
    const pendingInput: WorkflowInputRequestView | null =
      pendingPhase && pendingRequest && pendingPhase.step.runId
        ? {
            requestId: pendingRequest.id,
            question: pendingRequest.question,
            choices: [...pendingRequest.choices],
            artifactRefs: pendingRequest.artifactRefs.map((artifact) => this.toArtifactView(artifact)),
            phaseId: pendingPhase.id,
            stepId: pendingPhase.step.id,
            runId: pendingPhase.step.runId,
          }
        : null;
    const modeGate: WorkflowModeGateView | null =
      copy.mode === 'architecture-health'
        && copy.architectureChoice === null
        && copy.phases[0]?.status === 'complete'
        ? {
            phaseId: 'shape',
            stepId: 'shape',
            question: 'How should this architecture work continue?',
            choices: ['direct', 'planned'],
          }
        : null;
    const nextStep = next
      ? {
          ...phasePointer(next),
          label: next.step.name,
          action: 'run-step' as const,
        }
      : null;

    return {
      ...copy,
      workflowId: copy.id,
      workflowSessionId: copy.workflowSession?.id ?? null,
      session: copy.workflowSession
        ? {
            ...structuredClone(copy.workflowSession),
            workflowSessionId: copy.workflowSession.id,
          }
        : null,
      phases: copy.phases.map((phase) => ({
        ...phase,
        phaseId: phase.id,
        title: phase.name,
        optional: phase.status === 'skipped',
        steps: [{
          ...structuredClone(phase.step),
          stepId: phase.step.id,
          title: phase.step.name,
          label: phase.step.name,
          canStart: next?.id === phase.id && next.step.id === phase.step.id,
          canApprove: phase.step.status === 'awaiting-review',
          artifacts: phase.step.artifacts.map((artifact) => this.toArtifactView(artifact)),
        }],
      })),
      artifacts: copy.artifacts.map((artifact) => this.toArtifactView(artifact)),
      status,
      progress,
      percent: progress.percent,
      currentPhaseId: active?.id ?? next?.id ?? null,
      currentPhase: active ? phasePointer(active) : next ? phasePointer(next) : null,
      nextEligibleStep: next ? phasePointer(next) : null,
      nextStep,
      pendingInput,
      inputRequest: pendingInput ? structuredClone(pendingInput) : null,
      modeGate,
    };
  }

  private toArtifactView(artifact: WorkflowArtifact): WorkflowArtifactView {
    return artifact.type === 'url'
      ? { ...artifact, url: artifact.value }
      : { ...artifact, path: artifact.value };
  }

  private addActivity(state: WorkflowState, type: string, message: string): void {
    state.activity.push({
      id: randomUUID(),
      type,
      message,
      createdAt: this.timestamp(),
    });
    if (state.activity.length > MAX_ACTIVITY) {
      state.activity.splice(0, state.activity.length - MAX_ACTIVITY);
    }
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private async writeState(state: WorkflowState): Promise<void> {
    mkdirSync(this.dataDir, { recursive: true });
    const destination = path.join(this.dataDir, `${state.id}.json`);
    const temporary = path.join(this.dataDir, `${state.id}.${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
      renameSync(temporary, destination);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        // The rename may already have consumed the temporary file.
      }
      throw error;
    }
  }
}
