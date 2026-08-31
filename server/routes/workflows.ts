import { Router, type Request, type Response } from 'express';
import {
  type CorruptWorkflowView,
  WorkflowProblem,
  WorkflowService,
  type ApproveStepInput,
  type CreateWorkflowInput,
  type InputRequestInput,
  type InputResponseInput,
  type RegisterOutputInput,
  type StepContextInput,
  type WorkflowView,
} from '../services/workflowService.js';

type AsyncRoute = (req: Request, res: Response) => Promise<unknown>;

function route(handler: AsyncRoute): AsyncRoute {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      if (error instanceof WorkflowProblem) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
      }

      const message = error instanceof Error ? error.message : String(error);
      console.error('[workflows] Route error:', message);
      return res.status(500).json({
        error: 'Workflow operation failed',
        code: 'internal-error',
      });
    }
  };
}

function workflowId(req: Request): string {
  const id = req.params.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new WorkflowProblem('Workflow id is required', 400, 'validation');
  }
  return id;
}

export function createWorkflowsRouter(service: WorkflowService): Router {
  const router = Router();

  router.get('/workflows', (_req, res) => {
    const workflows: WorkflowView[] = [];
    const errors: CorruptWorkflowView[] = [];
    for (const entry of service.list()) {
      if (entry.status === 'error') {
        const error = entry as CorruptWorkflowView;
        errors.push({ ...error, message: error.error.message });
      } else {
        workflows.push(entry);
      }
    }
    return res.json({ workflows, errors });
  });

  router.post('/workflows', route(async (req, res) => {
    const workflow = await service.create((req.body ?? {}) as CreateWorkflowInput);
    return res.status(201).json(workflow);
  }));

  router.get('/workflows/:id', route(async (req, res) => {
    return res.json(service.get(workflowId(req)));
  }));

  router.post('/workflows/:id/run-step', route(async (req, res) => {
    const result = await service.runStep(workflowId(req), (req.body ?? {}) as StepContextInput);
    return res.json({
      ...result.workflow,
      runId: result.runId,
      workflowSessionId: result.workflowSessionId,
    });
  }));

  router.post('/workflows/:id/resume-step', route(async (req, res) => {
    const workflow = await service.resumeStep(workflowId(req), (req.body ?? {}) as StepContextInput);
    return res.json(workflow);
  }));

  router.post('/workflows/:id/register-output', route(async (req, res) => {
    const workflow = await service.registerOutput(
      workflowId(req),
      (req.body ?? {}) as RegisterOutputInput,
    );
    return res.json(workflow);
  }));

  router.post('/workflows/:id/approve', route(async (req, res) => {
    const workflow = await service.approve(workflowId(req), (req.body ?? {}) as ApproveStepInput);
    return res.json(workflow);
  }));

  router.post('/workflows/:id/mode-gate', route(async (req, res) => {
    const body = (req.body ?? {}) as { choice?: unknown };
    const workflow = await service.selectArchitectureMode(workflowId(req), body.choice);
    return res.json(workflow);
  }));

  router.post('/workflows/:id/input-request', route(async (req, res) => {
    const workflow = await service.requestInput(workflowId(req), (req.body ?? {}) as InputRequestInput);
    return res.json(workflow);
  }));

  router.post('/workflows/:id/input-response', route(async (req, res) => {
    const workflow = await service.respondToInput(workflowId(req), (req.body ?? {}) as InputResponseInput);
    return res.json(workflow);
  }));

  return router;
}
