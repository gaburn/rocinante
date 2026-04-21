import type { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory sliding-window rate limiter middleware.
 *
 * Tracks request timestamps per IP address and rejects requests that exceed
 * the configured limit within the time window. Uses periodic cleanup to
 * prevent unbounded memory growth.
 */

interface RateLimitOptions {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Time window in milliseconds. */
  windowMs: number;
}

const DEFAULT_OPTIONS: RateLimitOptions = {
  maxRequests: 100,
  windowMs: 60_000, // 1 minute
};

/**
 * Create a rate-limiting middleware using a sliding window per IP.
 *
 * Returns 429 Too Many Requests when the limit is exceeded, with a
 * Retry-After header indicating when the client can retry.
 */
export function createRateLimiter(opts: Partial<RateLimitOptions> = {}) {
  const { maxRequests, windowMs } = { ...DEFAULT_OPTIONS, ...opts };
  const hits = new Map<string, number[]>();

  // Periodic cleanup to prevent memory leaks from stale IPs
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of hits) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(ip);
      } else {
        hits.set(ip, valid);
      }
    }
  }, windowMs);
  cleanupInterval.unref();

  function middleware(req: Request, res: Response, next: NextFunction): void {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = hits.get(ip);
    if (timestamps) {
      // Prune entries outside the current window
      timestamps = timestamps.filter((t) => t > windowStart);
    } else {
      timestamps = [];
    }

    if (timestamps.length >= maxRequests) {
      const oldestInWindow = timestamps[0];
      const retryAfterSec = Math.ceil((oldestInWindow + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }

    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
  }

  /** Expose for testing: clear all tracked state. */
  middleware._reset = () => hits.clear();

  /** Expose for shutdown: stop the cleanup timer. */
  middleware._stopCleanup = () => clearInterval(cleanupInterval);

  return middleware;
}
