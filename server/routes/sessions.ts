import { Router } from 'express';
import { mapAllSessions, mapSessionById } from '../services/sessionMapper.js';
import { readSessionPlan } from '../services/planReader.js';
import { generateDemoSessions, getDemoWorkstreams } from '../services/demoData.js';

const sessionsRouter = Router();

sessionsRouter.get('/sessions', (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      const sessions = generateDemoSessions();
      res.set('Cache-Control', 'no-cache');
      return res.json(sessions);
    }

    const sessions = mapAllSessions();
    res.set('Cache-Control', 'no-cache');
    res.json(sessions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

sessionsRouter.get('/sessions/:id', (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      const session = generateDemoSessions().find((s) => s.id === req.params.id);
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      return res.json(session);
    }

    const session = mapSessionById(req.params.id);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json(session);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

sessionsRouter.get('/demo/workstreams', (_req, res) => {
  if (process.env.DEMO_MODE === 'true') {
    res.json(getDemoWorkstreams());
  } else {
    res.status(404).json({ error: 'Demo mode is not enabled' });
  }
});

sessionsRouter.get('/sessions/:id/plan', (req, res) => {
  try {
    const plan = readSessionPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ error: 'No plan found for this session' });
      return;
    }
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

export default sessionsRouter;
