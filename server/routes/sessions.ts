import { Router } from 'express';
import { mapAllSessions, mapSessionById } from '../services/sessionMapper.js';
import { readSessionPlan } from '../services/planReader.js';

const sessionsRouter = Router();

sessionsRouter.get('/sessions', (req, res) => {
  try {
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
