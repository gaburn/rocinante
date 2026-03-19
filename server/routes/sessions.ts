import { Router } from 'express';
import { mapAllSessions, mapSessionById } from '../services/sessionMapper.js';

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

export default sessionsRouter;
