/**
 * Server performance baseline benchmarks.
 *
 * Measures API response times, payload sizes, and telemetry aggregation
 * speed against a running local server instance.
 *
 * Usage:
 *   npm run bench:server          (server must be running on API_PORT)
 *   API_PORT=4000 npm run bench:server
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
const BASE_URL = `http://localhost:${API_PORT}`;
const ITERATIONS = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EndpointResult {
  endpoint: string;
  iterations: number;
  timings: number[];
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  avgBodyBytes: number;
  errors: number;
}

interface AggregationResult {
  coldMs: number;
  warmMs: number;
}

interface BenchmarkReport {
  timestamp: string;
  serverUrl: string;
  iterations: number;
  endpoints: EndpointResult[];
  aggregation: AggregationResult | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function isServerReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await fetch(`${BASE_URL}/api/sessions`, { signal: controller.signal });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Benchmark an endpoint
// ---------------------------------------------------------------------------

async function benchEndpoint(urlPath: string, iterations: number): Promise<EndpointResult> {
  const timings: number[] = [];
  const sizes: number[] = [];
  let errors = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`${BASE_URL}${urlPath}`);
      const body = await res.arrayBuffer();
      const elapsed = performance.now() - start;

      if (!res.ok) {
        errors++;
      }

      timings.push(elapsed);
      // Prefer Content-Length header, fall back to body size
      const cl = res.headers.get('content-length');
      sizes.push(cl ? parseInt(cl, 10) : body.byteLength);
    } catch {
      const elapsed = performance.now() - start;
      timings.push(elapsed);
      errors++;
    }
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const avg = timings.reduce((s, t) => s + t, 0) / (timings.length || 1);
  const avgBytes = sizes.length > 0
    ? Math.round(sizes.reduce((s, b) => s + b, 0) / sizes.length)
    : 0;

  return {
    endpoint: urlPath,
    iterations,
    timings: timings.map(round2),
    avgMs: round2(avg),
    p50Ms: round2(percentile(sorted, 50)),
    p95Ms: round2(percentile(sorted, 95)),
    minMs: round2(sorted[0] ?? 0),
    maxMs: round2(sorted[sorted.length - 1] ?? 0),
    avgBodyBytes: avgBytes,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Telemetry aggregation direct timing
// ---------------------------------------------------------------------------

async function benchAggregation(): Promise<AggregationResult | null> {
  try {
    // Dynamic import so this file stays runnable even if the import fails
    const mod = await import('../services/telemetryAggregator.js');
    const { aggregateTelemetry } = mod;

    // Cold run: the module-level cache starts empty on fresh import,
    // but if something else imported it earlier we cannot clear private
    // vars without modifying source. We time the first call — if the
    // module was freshly loaded this IS a cold call.
    const coldStart = performance.now();
    aggregateTelemetry();
    const coldMs = performance.now() - coldStart;

    // Warm run: cache is now populated (TTL = 30 s)
    const warmStart = performance.now();
    aggregateTelemetry();
    const warmMs = performance.now() - warmStart;

    return { coldMs: round2(coldMs), warmMs: round2(warmMs) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bench] Skipping direct aggregation timing: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pretty printer
// ---------------------------------------------------------------------------

function printSummary(report: BenchmarkReport): void {
  const log = (s: string) => process.stderr.write(s + '\n');

  log('');
  log('╔══════════════════════════════════════════════════════════════════╗');
  log('║              SERVER PERFORMANCE BASELINE                       ║');
  log('╚══════════════════════════════════════════════════════════════════╝');
  log(`  Server:     ${report.serverUrl}`);
  log(`  Timestamp:  ${report.timestamp}`);
  log(`  Iterations: ${report.iterations}`);
  log('');

  // Endpoint table
  const header = 'Endpoint'.padEnd(30) +
    'Avg'.padStart(9) +
    'P50'.padStart(9) +
    'P95'.padStart(9) +
    'Min'.padStart(9) +
    'Max'.padStart(9) +
    'Size'.padStart(10) +
    'Err'.padStart(5);
  log('  ' + header);
  log('  ' + '─'.repeat(header.length));

  for (const ep of report.endpoints) {
    const sizeStr = ep.avgBodyBytes > 1024
      ? `${round2(ep.avgBodyBytes / 1024)} KB`
      : `${ep.avgBodyBytes} B`;

    const row = ep.endpoint.padEnd(30) +
      `${ep.avgMs}ms`.padStart(9) +
      `${ep.p50Ms}ms`.padStart(9) +
      `${ep.p95Ms}ms`.padStart(9) +
      `${ep.minMs}ms`.padStart(9) +
      `${ep.maxMs}ms`.padStart(9) +
      sizeStr.padStart(10) +
      `${ep.errors}`.padStart(5);
    log('  ' + row);
  }
  log('');

  // Aggregation timing
  if (report.aggregation) {
    log('  Telemetry Aggregation (direct):');
    log(`    Cold:  ${report.aggregation.coldMs} ms`);
    log(`    Warm:  ${report.aggregation.warmMs} ms`);
    log('');
  }

  log('  Results saved to server/__benchmarks__/baseline-results.json');
  log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.error(`[bench] Checking server at ${BASE_URL} ...`);

  const reachable = await isServerReachable();
  if (!reachable) {
    console.error(`[bench] ERROR: Server not reachable at ${BASE_URL}`);
    console.error('[bench] Start the server first: npm run start');
    process.exit(1);
  }
  console.error('[bench] Server is up. Starting benchmarks...');

  // 1. Bench /api/sessions
  console.error('[bench] Benchmarking GET /api/sessions ...');
  const sessionsResult = await benchEndpoint('/api/sessions', ITERATIONS);

  // 2. Determine a session ID for detail endpoint
  let sessionDetailResult: EndpointResult | null = null;
  try {
    const res = await fetch(`${BASE_URL}/api/sessions`);
    const sessions = (await res.json()) as Array<{ id: string }>;
    if (sessions.length > 0) {
      const firstId = sessions[0].id;
      console.error(`[bench] Benchmarking GET /api/sessions/${firstId} ...`);
      sessionDetailResult = await benchEndpoint(`/api/sessions/${firstId}`, ITERATIONS);
    } else {
      console.error('[bench] No sessions available — skipping detail endpoint.');
    }
  } catch {
    console.error('[bench] Could not fetch session list for detail benchmark.');
  }

  // 3. Bench /api/telemetry
  console.error('[bench] Benchmarking GET /api/telemetry ...');
  const telemetryResult = await benchEndpoint('/api/telemetry', ITERATIONS);

  // 4. Direct aggregation timing
  console.error('[bench] Timing aggregateTelemetry() directly ...');
  const aggregation = await benchAggregation();

  // Assemble report
  const endpoints: EndpointResult[] = [sessionsResult];
  if (sessionDetailResult) endpoints.push(sessionDetailResult);
  endpoints.push(telemetryResult);

  const report: BenchmarkReport = {
    timestamp: new Date().toISOString(),
    serverUrl: BASE_URL,
    iterations: ITERATIONS,
    endpoints,
    aggregation,
  };

  // Output JSON report to stdout
  const json = JSON.stringify(report, null, 2);
  process.stdout.write(json + '\n');

  // Save to file
  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(outDir, 'baseline-results.json');
  writeFileSync(outPath, json + '\n', 'utf-8');

  // Print human-readable summary to stderr
  printSummary(report);
}

main().catch((err) => {
  console.error('[bench] Fatal error:', err);
  process.exit(1);
});
