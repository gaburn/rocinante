/**
 * Bundle Baseline Measurement Script
 *
 * Runs `vite build`, scans the dist/ output, and produces a JSON report
 * with per-chunk raw + gzipped sizes. Flags chunks over 100KB gzipped.
 *
 * Usage: tsx src/__benchmarks__/bundle-baseline.ts
 */

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST_DIR = join(process.cwd(), 'dist');
const REPORT_PATH = join(process.cwd(), 'src', '__benchmarks__', 'bundle-baseline-results.json');
const GZIP_WARN_BYTES = 100 * 1024; // 100 KB

interface ChunkInfo {
  file: string;
  type: 'js' | 'css' | 'other';
  rawBytes: number;
  gzipBytes: number;
  overThreshold: boolean;
}

interface Report {
  timestamp: string;
  buildOutput: string;
  chunks: ChunkInfo[];
  totals: {
    jsRawBytes: number;
    jsGzipBytes: number;
    cssRawBytes: number;
    cssGzipBytes: number;
    totalRawBytes: number;
    totalGzipBytes: number;
  };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFiles(dir: string, base: string = dir): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...collectFiles(full, base));
    } else {
      entries.push(relative(base, full));
    }
  }
  return entries;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function chunkType(file: string): ChunkInfo['type'] {
  if (file.endsWith('.js') || file.endsWith('.mjs')) return 'js';
  if (file.endsWith('.css')) return 'css';
  return 'other';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // 1. Run vite build
  console.error('⏳ Running vite build…');
  let buildOutput: string;
  try {
    buildOutput = execSync('npx vite build', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string };
    console.error('❌ vite build failed');
    if (execErr.stderr) console.error(execErr.stderr);
    if (execErr.stdout) console.error(execErr.stdout);
    process.exit(1);
  }
  console.error('✅ Build complete\n');

  // 2. Scan dist/ for JS and CSS assets
  const allFiles = collectFiles(DIST_DIR);
  const assetFiles = allFiles.filter(
    (f) => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.css'),
  );

  const chunks: ChunkInfo[] = assetFiles.map((file) => {
    const absPath = join(DIST_DIR, file);
    const content = readFileSync(absPath);
    const rawBytes = statSync(absPath).size;
    const gzipBytes = gzipSync(content).length;
    return {
      file: file.replace(/\\/g, '/'),
      type: chunkType(file),
      rawBytes,
      gzipBytes,
      overThreshold: gzipBytes > GZIP_WARN_BYTES,
    };
  });

  // Sort largest gzip first
  chunks.sort((a, b) => b.gzipBytes - a.gzipBytes);

  // 3. Compute totals
  const totals = chunks.reduce(
    (acc, c) => {
      acc.totalRawBytes += c.rawBytes;
      acc.totalGzipBytes += c.gzipBytes;
      if (c.type === 'js') {
        acc.jsRawBytes += c.rawBytes;
        acc.jsGzipBytes += c.gzipBytes;
      } else if (c.type === 'css') {
        acc.cssRawBytes += c.rawBytes;
        acc.cssGzipBytes += c.gzipBytes;
      }
      return acc;
    },
    {
      jsRawBytes: 0,
      jsGzipBytes: 0,
      cssRawBytes: 0,
      cssGzipBytes: 0,
      totalRawBytes: 0,
      totalGzipBytes: 0,
    },
  );

  // 4. Build warnings
  const warnings = chunks
    .filter((c) => c.overThreshold)
    .map((c) => `⚠️  ${c.file} is ${formatBytes(c.gzipBytes)} gzipped (over 100 KB threshold)`);

  // 5. Assemble report
  const report: Report = {
    timestamp: new Date().toISOString(),
    buildOutput: buildOutput.trim(),
    chunks,
    totals,
    warnings,
  };

  // 6. Write JSON report
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.error(`📄 Report saved to ${relative(process.cwd(), REPORT_PATH)}\n`);

  // 7. Print human-readable table to stderr
  const PAD_FILE = 50;
  const PAD_SIZE = 14;

  const header = [
    'File'.padEnd(PAD_FILE),
    'Type'.padEnd(6),
    'Raw'.padStart(PAD_SIZE),
    'Gzip'.padStart(PAD_SIZE),
    'Flag',
  ].join('  ');

  const divider = '─'.repeat(header.length);

  console.error(divider);
  console.error(header);
  console.error(divider);

  for (const c of chunks) {
    const flag = c.overThreshold ? '🔴' : '  ';
    console.error(
      [
        c.file.padEnd(PAD_FILE),
        c.type.padEnd(6),
        formatBytes(c.rawBytes).padStart(PAD_SIZE),
        formatBytes(c.gzipBytes).padStart(PAD_SIZE),
        flag,
      ].join('  '),
    );
  }

  console.error(divider);
  console.error(
    [
      'TOTAL'.padEnd(PAD_FILE),
      ''.padEnd(6),
      formatBytes(totals.totalRawBytes).padStart(PAD_SIZE),
      formatBytes(totals.totalGzipBytes).padStart(PAD_SIZE),
      '',
    ].join('  '),
  );
  console.error(
    `  JS:  ${formatBytes(totals.jsRawBytes)} raw / ${formatBytes(totals.jsGzipBytes)} gzip`,
  );
  console.error(
    `  CSS: ${formatBytes(totals.cssRawBytes)} raw / ${formatBytes(totals.cssGzipBytes)} gzip`,
  );
  console.error(divider);

  if (warnings.length > 0) {
    console.error('\n⚠️  LARGE CHUNKS (over 100 KB gzipped):');
    for (const w of warnings) {
      console.error(`  ${w}`);
    }
  } else {
    console.error('\n✅ All chunks under 100 KB gzipped threshold');
  }

  console.error('');
}

main();
