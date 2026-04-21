import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../rateLimit.js';
import type { Request, Response, NextFunction } from 'express';

// ── Helpers ──────────────────────────────────────────────────────

function mockReq(ip = '127.0.0.1'): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function mockRes(): Response & { statusCode: number; body: unknown } {
  const res = {
    statusCode: 200,
    body: null as unknown,
    headers: {} as Record<string, string>,
    set(key: string, val: string) {
      res.headers[key] = val;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

// ── Tests ────────────────────────────────────────────────────────

describe('createRateLimiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  afterEach(() => {
    limiter?._stopCleanup();
  });

  it('allows requests under the limit', () => {
    limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });
    const req = mockReq();
    const res = mockRes();
    let called = false;
    const next: NextFunction = () => { called = true; };

    limiter(req, res, next);
    expect(called).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('returns 429 when limit is exceeded', () => {
    limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });

    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      limiter(mockReq(), res, () => {});
      expect(res.statusCode).toBe(200);
    }

    // 4th request should be rejected
    const res = mockRes();
    limiter(mockReq(), res, () => {});
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests. Please try again later.' });
  });

  it('tracks IPs independently', () => {
    limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });

    // Exhaust limit for IP A
    for (let i = 0; i < 2; i++) {
      limiter(mockReq('10.0.0.1'), mockRes(), () => {});
    }

    // IP B should still be allowed
    const res = mockRes();
    let called = false;
    limiter(mockReq('10.0.0.2'), res, () => { called = true; });
    expect(called).toBe(true);
    expect(res.statusCode).toBe(200);

    // IP A should be blocked
    const resA = mockRes();
    limiter(mockReq('10.0.0.1'), resA, () => {});
    expect(resA.statusCode).toBe(429);
  });

  it('sets Retry-After header on 429 response', () => {
    limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    limiter(mockReq(), mockRes(), () => {});

    const res = mockRes();
    limiter(mockReq(), res, () => {});
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
    expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('_reset clears all tracked state', () => {
    limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    limiter(mockReq(), mockRes(), () => {}); // 1st — ok
    limiter(mockReq(), mockRes(), () => {}); // 2nd — blocked

    limiter._reset();

    const res = mockRes();
    let called = false;
    limiter(mockReq(), res, () => { called = true; });
    expect(called).toBe(true);
  });
});
