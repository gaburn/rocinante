import { Router } from 'express';
import { aggregateTelemetry } from '../services/telemetryAggregator.js';

const telemetryRouter = Router();

telemetryRouter.get('/telemetry', (_req, res) => {
  try {
    const data = aggregateTelemetry();
    res.set('Cache-Control', 'public, max-age=30');
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[telemetry] Failed to aggregate telemetry data:', message);
    res.status(500).json({ error: message });
  }
});

export default telemetryRouter;
