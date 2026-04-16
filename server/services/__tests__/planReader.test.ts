import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readSessionPlan } from '../planReader.js';

// Mock filesystem and config so we can feed arbitrary markdown to the parser
vi.mock('node:fs');
vi.mock('../../config.js', () => ({
  getConfig: vi.fn(() => ({
    sessionStateDir: '/mock/sessions',
  })),
}));
vi.mock('../../utils/sanitize.js', () => ({
  sanitizeSessionId: vi.fn((id: string) => id),
}));

import * as fs from 'node:fs';

/** Feed raw markdown into readSessionPlan and return the result */
function parsePlan(content: string) {
  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.readFileSync).mockReturnValue(content);
  return readSessionPlan('test-session');
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Existing formats — regression tests
// ---------------------------------------------------------------------------
describe('planReader — existing formats (regression)', () => {
  it('returns null when plan file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(readSessionPlan('missing')).toBeNull();
  });

  it('returns empty sections for blank plan', () => {
    const result = parsePlan('');
    expect(result).not.toBeNull();
    expect(result!.sections).toEqual([]);
  });

  it('## heading creates a section', () => {
    const result = parsePlan('## My Section\n- task one');
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].title).toBe('My Section');
  });

  it('### sub-heading creates a section', () => {
    const result = parsePlan('### Sub Section\n- task one');
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].title).toBe('Sub Section');
  });

  it('plain bullet creates a task', () => {
    const result = parsePlan('## S\n- Buy groceries');
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('Buy groceries');
    expect(task.id).toEqual(expect.any(String));
  });

  it('bold title with description splits correctly', () => {
    const result = parsePlan('## S\n- **Auth module**: implement JWT login');
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('Auth module');
    expect(task.description).toBe('implement JWT login');
  });

  it('multiline description continuation appends to previous task', () => {
    const md = [
      '## S',
      '- **Task one**: first line',
      '  continued here',
      '  and here',
    ].join('\n');
    const result = parsePlan(md);
    const task = result!.sections[0].tasks[0];
    expect(task.description).toContain('first line');
    expect(task.description).toContain('continued here');
    expect(task.description).toContain('and here');
  });

  it('tasks without a preceding heading get a default section', () => {
    const result = parsePlan('- orphan task');
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].title).toBe('Plan');
    expect(result!.sections[0].tasks[0].title).toBe('orphan task');
  });

  it('preserves raw plan content', () => {
    const md = '## S\n- task';
    const result = parsePlan(md);
    expect(result!.raw).toBe(md);
  });
});

// ---------------------------------------------------------------------------
// 2. Checkbox format
// ---------------------------------------------------------------------------
describe('planReader — checkbox format', () => {
  it('unchecked checkbox creates task with checked: false', () => {
    const result = parsePlan('## S\n- [ ] Unchecked task');
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('Unchecked task');
    expect((task as any).checked).toBe(false);
    expect((task as any).checkedFromFile).toBe(true);
  });

  it('lowercase x checkbox creates task with checked: true', () => {
    const result = parsePlan('## S\n- [x] Done task');
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('Done task');
    expect((task as any).checked).toBe(true);
    expect((task as any).checkedFromFile).toBe(true);
  });

  it('uppercase X checkbox creates task with checked: true', () => {
    const result = parsePlan('## S\n- [X] Also done');
    const task = result!.sections[0].tasks[0];
    expect((task as any).checked).toBe(true);
  });

  it('checkbox title does NOT include the bracket prefix', () => {
    const result = parsePlan('## S\n- [ ] Clean title');
    const task = result!.sections[0].tasks[0];
    expect(task.title).not.toMatch(/\[[ xX]\]/);
    expect(task.title).toBe('Clean title');
  });

  it('bold checkbox preserves title/description split', () => {
    const result = parsePlan('## S\n- [x] **Deploy**: push to prod');
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('Deploy');
    expect(task.description).toBe('push to prod');
    expect((task as any).checked).toBe(true);
    expect((task as any).checkedFromFile).toBe(true);
  });

  it('mixed checkboxes and plain bullets in same section', () => {
    const md = [
      '## S',
      '- [ ] Unchecked',
      '- [x] Checked',
      '- Plain bullet',
    ].join('\n');
    const result = parsePlan(md);
    const tasks = result!.sections[0].tasks;
    expect(tasks).toHaveLength(3);

    expect((tasks[0] as any).checked).toBe(false);
    expect((tasks[0] as any).checkedFromFile).toBe(true);
    expect((tasks[1] as any).checked).toBe(true);
    expect((tasks[1] as any).checkedFromFile).toBe(true);
    // Plain bullet should NOT have checkedFromFile
    expect((tasks[2] as any).checkedFromFile).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Numbered list format
// ---------------------------------------------------------------------------
describe('planReader — numbered list format', () => {
  it('simple numbered item creates a task', () => {
    const result = parsePlan('## S\n1. First task');
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('First task');
    expect(task.id).toEqual(expect.any(String));
  });

  it('numbered item with bold title splits correctly', () => {
    const result = parsePlan('## S\n1. **Setup**: install deps');
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('Setup');
    expect(task.description).toBe('install deps');
  });

  it('high number still creates a task', () => {
    const result = parsePlan('## S\n42. The answer');
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('The answer');
  });

  it('mixed numbered and bullet items in same section', () => {
    const md = [
      '## S',
      '- Bullet one',
      '1. Numbered one',
      '2. Numbered two',
      '- Bullet two',
    ].join('\n');
    const result = parsePlan(md);
    expect(result!.sections[0].tasks).toHaveLength(4);
    expect(result!.sections[0].tasks[0].title).toBe('Bullet one');
    expect(result!.sections[0].tasks[1].title).toBe('Numbered one');
    expect(result!.sections[0].tasks[2].title).toBe('Numbered two');
    expect(result!.sections[0].tasks[3].title).toBe('Bullet two');
  });
});

// ---------------------------------------------------------------------------
// 4. Markdown table format
// ---------------------------------------------------------------------------
describe('planReader — markdown table format', () => {
  it('simple table with header → data rows become tasks', () => {
    const md = [
      '## S',
      '| Task | Status |',
      '|------|--------|',
      '| Write tests | Pending |',
      '| Fix bug | Pending |',
    ].join('\n');
    const result = parsePlan(md);
    const tasks = result!.sections[0].tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Write tests');
    expect(tasks[1].title).toBe('Fix bug');
  });

  it('table with ✅ in status column → checked task', () => {
    const md = [
      '## S',
      '| Task | Status |',
      '|------|--------|',
      '| Done thing | ✅ |',
    ].join('\n');
    const result = parsePlan(md);
    const task = result!.sections[0].tasks[0];
    expect((task as any).checked).toBe(true);
  });

  it('table with ❌ in status column → unchecked task', () => {
    const md = [
      '## S',
      '| Task | Status |',
      '|------|--------|',
      '| Not done | ❌ |',
    ].join('\n');
    const result = parsePlan(md);
    const task = result!.sections[0].tasks[0];
    expect((task as any).checked).toBe(false);
  });

  it('table with "Pending" in status column → unchecked task', () => {
    const md = [
      '## S',
      '| Task | Status |',
      '|------|--------|',
      '| Waiting | Pending |',
    ].join('\n');
    const result = parsePlan(md);
    const task = result!.sections[0].tasks[0];
    expect((task as any).checked).toBe(false);
  });

  it('table with no status column → unchecked tasks', () => {
    const md = [
      '## S',
      '| Task | Notes |',
      '|------|-------|',
      '| Some task | important |',
    ].join('\n');
    const result = parsePlan(md);
    const task = result!.sections[0].tasks[0];
    expect(task.title).toBe('Some task');
    // No status column → should not be checked
    expect((task as any).checked).toBeFalsy();
  });

  it('table separator row is skipped (not parsed as task)', () => {
    const md = [
      '## S',
      '| Task | Status |',
      '|------|--------|',
      '| Real task | ✅ |',
    ].join('\n');
    const result = parsePlan(md);
    const tasks = result!.sections[0].tasks;
    // Only the data row, not the separator or header
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).not.toMatch(/^-+$/);
  });

  it('table header row is skipped (not parsed as task)', () => {
    const md = [
      '## S',
      '| Task | Status |',
      '|------|--------|',
      '| My task | Pending |',
    ].join('\n');
    const result = parsePlan(md);
    const tasks = result!.sections[0].tasks;
    // "Task" is the header — should not appear as a task title
    const titles = tasks.map((t) => t.title);
    expect(titles).not.toContain('Task');
  });
});

// ---------------------------------------------------------------------------
// 5. Nested bullets
// ---------------------------------------------------------------------------
describe('planReader — nested bullets', () => {
  it('indented bullet appends to parent task description', () => {
    const md = [
      '## S',
      '- Parent task',
      '  - Child detail',
    ].join('\n');
    const result = parsePlan(md);
    const tasks = result!.sections[0].tasks;
    // Should NOT create a separate top-level task for the child
    // (child should be folded into parent description)
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Parent task');
    expect(tasks[0].description).toContain('Child detail');
  });

  it('multiple levels of indentation fold into parent', () => {
    const md = [
      '## S',
      '- Top level',
      '  - Second level',
      '    - Third level',
    ].join('\n');
    const result = parsePlan(md);
    const tasks = result!.sections[0].tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].description).toContain('Second level');
    expect(tasks[0].description).toContain('Third level');
  });
});

// ---------------------------------------------------------------------------
// 6. Code block immunity
// ---------------------------------------------------------------------------
describe('planReader — code block immunity', () => {
  it('tasks inside fenced code blocks are NOT parsed', () => {
    const md = [
      '## S',
      '- Real task',
      '```',
      '- Not a task',
      '## Not a section',
      '```',
    ].join('\n');
    const result = parsePlan(md);
    expect(result!.sections).toHaveLength(1);
    const tasks = result!.sections[0].tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Real task');
  });

  it('tasks after code block close still parse normally', () => {
    const md = [
      '## S',
      '```',
      '- Inside code',
      '```',
      '- After code',
    ].join('\n');
    const result = parsePlan(md);
    const tasks = result!.sections[0].tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('After code');
  });

  it('code block with language tag is still immune', () => {
    const md = [
      '## S',
      '```markdown',
      '- Fake task',
      '```',
      '- Real task',
    ].join('\n');
    const result = parsePlan(md);
    expect(result!.sections[0].tasks).toHaveLength(1);
    expect(result!.sections[0].tasks[0].title).toBe('Real task');
  });
});

// ---------------------------------------------------------------------------
// 7. Top-level heading
// ---------------------------------------------------------------------------
describe('planReader — top-level heading', () => {
  it('# Title creates a section', () => {
    const result = parsePlan('# Top Level\n- task one');
    expect(result!.sections).toHaveLength(1);
    expect(result!.sections[0].title).toBe('Top Level');
    expect(result!.sections[0].tasks[0].title).toBe('task one');
  });

  it('# heading coexists with ## and ### headings', () => {
    const md = [
      '# Top',
      '- task a',
      '## Mid',
      '- task b',
      '### Sub',
      '- task c',
    ].join('\n');
    const result = parsePlan(md);
    expect(result!.sections).toHaveLength(3);
    expect(result!.sections[0].title).toBe('Top');
    expect(result!.sections[1].title).toBe('Mid');
    expect(result!.sections[2].title).toBe('Sub');
  });
});

// ---------------------------------------------------------------------------
// 8. Mixed format plans
// ---------------------------------------------------------------------------
describe('planReader — mixed format plans', () => {
  it('plan with bullets, checkboxes, numbered, and table in different sections', () => {
    const md = [
      '## Bullets',
      '- Plain task',
      '- **Bold**: with desc',
      '',
      '## Checkboxes',
      '- [ ] Todo item',
      '- [x] Done item',
      '',
      '## Numbered',
      '1. First thing',
      '2. Second thing',
      '',
      '## Table',
      '| Task | Status |',
      '|------|--------|',
      '| Row task | ✅ |',
    ].join('\n');
    const result = parsePlan(md);
    expect(result!.sections).toHaveLength(4);

    // Section 0: Bullets
    const bullets = result!.sections[0];
    expect(bullets.title).toBe('Bullets');
    expect(bullets.tasks).toHaveLength(2);
    expect(bullets.tasks[0].title).toBe('Plain task');
    expect(bullets.tasks[1].title).toBe('Bold');
    expect(bullets.tasks[1].description).toBe('with desc');

    // Section 1: Checkboxes
    const checkboxes = result!.sections[1];
    expect(checkboxes.title).toBe('Checkboxes');
    expect(checkboxes.tasks).toHaveLength(2);
    expect((checkboxes.tasks[0] as any).checked).toBe(false);
    expect((checkboxes.tasks[1] as any).checked).toBe(true);

    // Section 2: Numbered
    const numbered = result!.sections[2];
    expect(numbered.title).toBe('Numbered');
    expect(numbered.tasks).toHaveLength(2);
    expect(numbered.tasks[0].title).toBe('First thing');
    expect(numbered.tasks[1].title).toBe('Second thing');

    // Section 3: Table
    const table = result!.sections[3];
    expect(table.title).toBe('Table');
    expect(table.tasks).toHaveLength(1);
    expect(table.tasks[0].title).toBe('Row task');
    expect((table.tasks[0] as any).checked).toBe(true);
  });

  it('numbered checkbox items parse both number and check state', () => {
    const md = [
      '## S',
      '1. [ ] Numbered unchecked',
      '2. [x] Numbered checked',
    ].join('\n');
    const result = parsePlan(md);
    const tasks = result!.sections[0].tasks;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Numbered unchecked');
    expect((tasks[0] as any).checked).toBe(false);
    expect(tasks[1].title).toBe('Numbered checked');
    expect((tasks[1] as any).checked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Integration — realistic mixed-format plans
// ---------------------------------------------------------------------------
describe('planReader — integration: realistic plan samples', () => {
  it('parses a Copilot CLI style plan (title, checkboxes, bullets, table)', () => {
    const md = [
      '# Session Plan: Refactor Auth Module',
      '',
      '## Overview',
      '- Migrate from cookie-based auth to JWT tokens',
      '- **Timeline**: 2 sprint cycles',
      '',
      '## Backend Tasks',
      '- [x] Create JWT utility in `src/auth/jwt.ts`',
      '- [x] Add refresh-token rotation endpoint',
      '- [ ] Write middleware for token validation',
      '- [ ] **Rate limiter**: add sliding-window rate limiting to login',
      '  - Use Redis as backing store',
      '  - Default to 5 req/min per IP',
      '',
      '## Frontend Tasks',
      '- [ ] Replace cookie reads with `Authorization` header',
      '- [x] Update login form to store token in memory',
      '- [ ] Add silent refresh on 401',
      '',
      '## Test Matrix',
      '| Scenario | Status |',
      '|----------|--------|',
      '| Login happy path | ✅ |',
      '| Expired token refresh | ❌ |',
      '| Invalid token rejection | ✅ |',
      '| Rate limit exceeded | ❌ |',
      '',
      '```bash',
      '- This should NOT be parsed as a task',
      'npm run test:auth',
      '```',
      '',
      '## Notes',
      '- Review security audit checklist before merge',
    ].join('\n');

    const result = parsePlan(md);
    expect(result).not.toBeNull();

    // 6 sections: title heading, Overview, Backend Tasks, Frontend Tasks, Test Matrix, Notes
    expect(result!.sections).toHaveLength(6);

    // Section 0 is the # title heading (no tasks beneath it)
    expect(result!.sections[0].title).toBe('Session Plan: Refactor Auth Module');
    expect(result!.sections[0].tasks).toHaveLength(0);

    // --- Overview: 2 plain bullet tasks ---
    const overview = result!.sections[1];
    expect(overview.title).toBe('Overview');
    expect(overview.tasks).toHaveLength(2);
    expect(overview.tasks[1].title).toBe('Timeline');
    expect(overview.tasks[1].description).toBe('2 sprint cycles');

    // --- Backend Tasks: 4 tasks, 2 checked, 2 unchecked ---
    const backend = result!.sections[2];
    expect(backend.title).toBe('Backend Tasks');
    expect(backend.tasks).toHaveLength(4);
    expect((backend.tasks[0] as any).checked).toBe(true);
    expect((backend.tasks[0] as any).checkedFromFile).toBe(true);
    expect((backend.tasks[1] as any).checked).toBe(true);
    expect((backend.tasks[2] as any).checked).toBe(false);
    // Bold checkbox with nested bullets
    expect(backend.tasks[3].title).toBe('Rate limiter');
    expect(backend.tasks[3].description).toContain('sliding-window');
    expect(backend.tasks[3].description).toContain('Redis');
    expect(backend.tasks[3].description).toContain('5 req/min');

    // --- Frontend Tasks: 3 tasks, 1 checked ---
    const frontend = result!.sections[3];
    expect(frontend.title).toBe('Frontend Tasks');
    expect(frontend.tasks).toHaveLength(3);
    const frontendChecked = frontend.tasks.filter((t: any) => t.checked);
    expect(frontendChecked).toHaveLength(1);

    // --- Test Matrix table: 4 tasks, 2 ✅ and 2 ❌ ---
    const testMatrix = result!.sections[4];
    expect(testMatrix.title).toBe('Test Matrix');
    expect(testMatrix.tasks).toHaveLength(4);
    expect((testMatrix.tasks[0] as any).checked).toBe(true);   // Login happy path ✅
    expect((testMatrix.tasks[1] as any).checked).toBe(false);  // Expired token ❌
    expect((testMatrix.tasks[2] as any).checked).toBe(true);   // Invalid token ✅
    expect((testMatrix.tasks[3] as any).checked).toBe(false);  // Rate limit ❌

    // --- Notes section: 1 plain task ---
    const notes = result!.sections[5];
    expect(notes.title).toBe('Notes');
    expect(notes.tasks).toHaveLength(1);

    // Code block content must NOT leak
    const allTitles = result!.sections.flatMap(s => s.tasks.map(t => t.title));
    expect(allTitles).not.toContain('This should NOT be parsed as a task');

    // Total task count: 2 + 4 + 3 + 4 + 1 = 14
    const totalTasks = result!.sections.reduce((sum, s) => sum + s.tasks.length, 0);
    expect(totalTasks).toBe(14);

    // Total file-checked completed: 2 backend + 1 frontend + 2 table = 5
    const totalChecked = result!.sections
      .flatMap(s => s.tasks)
      .filter((t: any) => t.checked === true).length;
    expect(totalChecked).toBe(5);
  });

  it('parses a Squad style plan (tables with status, bold bullets, nested bullets)', () => {
    const md = [
      '## Component Ownership',
      '',
      '| Component | Owner | Status |',
      '|-----------|-------|--------|',
      '| API Gateway | Alex | ✅ |',
      '| Auth Service | Bobbie | ❌ |',
      '| Database Migration | Chris | ✅ |',
      '',
      '## Implementation Tasks',
      '- **API Gateway**: set up Express router with versioned endpoints',
      '  - Add `/v1/health` and `/v1/ready` probes',
      '  - Configure CORS for staging and production origins',
      '- **Auth Service**: implement OAuth2 PKCE flow',
      '  - Register callback URL with identity provider',
      '  - Store tokens in encrypted HTTP-only cookies',
      '- **Database Migration**: run Prisma migrate on staging',
      '',
      '## Acceptance Criteria',
      '',
      '| Criterion | Status |',
      '|-----------|--------|',
      '| All endpoints return JSON | ✅ |',
      '| Auth redirects work on mobile | ❌ |',
      '| DB schema matches production | ✅ |',
      '| Load test passes 500 RPS | Pending |',
      '',
      '## Risks',
      '- **Token expiry**: silent refresh may fail on slow networks',
      '  - Mitigation: add retry with exponential backoff',
      '- Network partition could stall migration',
    ].join('\n');

    const result = parsePlan(md);
    expect(result).not.toBeNull();

    // 4 sections
    expect(result!.sections).toHaveLength(4);

    // --- Component Ownership table: 3 tasks ---
    const ownership = result!.sections[0];
    expect(ownership.title).toBe('Component Ownership');
    expect(ownership.tasks).toHaveLength(3);
    expect(ownership.tasks[0].title).toBe('API Gateway');
    expect((ownership.tasks[0] as any).checked).toBe(true);
    expect(ownership.tasks[1].title).toBe('Auth Service');
    expect((ownership.tasks[1] as any).checked).toBe(false);
    expect((ownership.tasks[2] as any).checked).toBe(true);

    // --- Implementation Tasks: 3 bold-bullet tasks with nested details ---
    const impl = result!.sections[1];
    expect(impl.title).toBe('Implementation Tasks');
    expect(impl.tasks).toHaveLength(3);
    expect(impl.tasks[0].title).toBe('API Gateway');
    expect(impl.tasks[0].description).toContain('Express router');
    expect(impl.tasks[0].description).toContain('CORS');
    expect(impl.tasks[1].title).toBe('Auth Service');
    expect(impl.tasks[1].description).toContain('PKCE');
    expect(impl.tasks[1].description).toContain('HTTP-only cookies');
    expect(impl.tasks[2].title).toBe('Database Migration');

    // --- Acceptance Criteria table: 4 tasks (3 ✅/❌, 1 Pending) ---
    const criteria = result!.sections[2];
    expect(criteria.title).toBe('Acceptance Criteria');
    expect(criteria.tasks).toHaveLength(4);
    expect((criteria.tasks[0] as any).checked).toBe(true);   // All endpoints
    expect((criteria.tasks[1] as any).checked).toBe(false);  // Auth redirects
    expect((criteria.tasks[2] as any).checked).toBe(true);   // DB schema
    expect((criteria.tasks[3] as any).checked).toBe(false);  // Load test Pending

    // --- Risks: 2 tasks, one bold with nested mitigation ---
    const risks = result!.sections[3];
    expect(risks.title).toBe('Risks');
    expect(risks.tasks).toHaveLength(2);
    expect(risks.tasks[0].title).toBe('Token expiry');
    expect(risks.tasks[0].description).toContain('exponential backoff');
    expect(risks.tasks[1].title).toBe('Network partition could stall migration');

    // Total tasks: 3 + 3 + 4 + 2 = 12
    const totalTasks = result!.sections.reduce((sum, s) => sum + s.tasks.length, 0);
    expect(totalTasks).toBe(12);

    // File-checked completed: 2 ownership + 2 criteria = 4
    const totalChecked = result!.sections
      .flatMap(s => s.tasks)
      .filter((t: any) => t.checked === true).length;
    expect(totalChecked).toBe(4);
  });

  it('parses a hybrid plan mixing all format types in one document', () => {
    const md = [
      '# Sprint 14 — Platform Hardening',
      '',
      '## Phase 1: Infra',
      '1. Provision staging cluster',
      '2. [x] Update Terraform modules',
      '3. [ ] Smoke-test deploy pipeline',
      '',
      '## Phase 2: Features',
      '- [x] **Search rewrite**: migrate to Elasticsearch 8',
      '- [ ] **Caching layer**: add Redis TTL-based caching',
      '  - Eviction policy: LRU',
      '  - Max memory: 256 MB',
      '- Add feature flags for gradual rollout',
      '',
      '## Status Dashboard',
      '| Milestone | Owner | Status |',
      '|-----------|-------|--------|',
      '| Cluster up | SRE | ✅ |',
      '| Search indexed | Backend | ❌ |',
      '| Cache warm | Backend | Pending |',
      '',
      '```yaml',
      '# k8s config — should be ignored',
      '- name: redis',
      '  image: redis:7',
      '```',
      '',
      '## Wrap-up',
      '- Write retro notes',
      '- [ ] Final QA sign-off',
    ].join('\n');

    const result = parsePlan(md);
    expect(result).not.toBeNull();

    // 5 sections: # title heading, Phase 1, Phase 2, Status Dashboard, Wrap-up
    expect(result!.sections).toHaveLength(5);

    // Section 0 is the # title heading (no tasks)
    expect(result!.sections[0].title).toBe('Sprint 14 — Platform Hardening');
    expect(result!.sections[0].tasks).toHaveLength(0);

    // Phase 1: 3 numbered (1 plain, 1 checked, 1 unchecked)
    const phase1 = result!.sections[1];
    expect(phase1.title).toBe('Phase 1: Infra');
    expect(phase1.tasks).toHaveLength(3);
    expect((phase1.tasks[0] as any).checkedFromFile).toBeUndefined(); // plain numbered
    expect((phase1.tasks[1] as any).checked).toBe(true);
    expect((phase1.tasks[2] as any).checked).toBe(false);

    // Phase 2: 3 tasks (checkbox-bold, checkbox-bold with nested, plain)
    const phase2 = result!.sections[2];
    expect(phase2.title).toBe('Phase 2: Features');
    expect(phase2.tasks).toHaveLength(3);
    expect((phase2.tasks[0] as any).checked).toBe(true);
    expect(phase2.tasks[1].title).toBe('Caching layer');
    expect(phase2.tasks[1].description).toContain('LRU');
    expect(phase2.tasks[1].description).toContain('256 MB');
    expect(phase2.tasks[2].title).toBe('Add feature flags for gradual rollout');

    // Status Dashboard: 3 table rows
    const dashboard = result!.sections[3];
    expect(dashboard.title).toBe('Status Dashboard');
    expect(dashboard.tasks).toHaveLength(3);
    expect((dashboard.tasks[0] as any).checked).toBe(true);
    expect((dashboard.tasks[1] as any).checked).toBe(false);
    expect((dashboard.tasks[2] as any).checked).toBe(false); // Pending

    // YAML code block content must NOT leak
    const allTitles = result!.sections.flatMap(s => s.tasks.map(t => t.title));
    expect(allTitles.every(t => !t.includes('redis'))).toBe(true);

    // Wrap-up: 2 tasks (plain + checkbox)
    const wrapup = result!.sections[4];
    expect(wrapup.title).toBe('Wrap-up');
    expect(wrapup.tasks).toHaveLength(2);
    expect((wrapup.tasks[1] as any).checked).toBe(false);

    // Total: 3 + 3 + 3 + 2 = 11
    const totalTasks = result!.sections.reduce((sum, s) => sum + s.tasks.length, 0);
    expect(totalTasks).toBe(11);

    // Checked: 1 phase1 + 1 phase2 + 1 dashboard = 3
    const totalChecked = result!.sections
      .flatMap(s => s.tasks)
      .filter((t: any) => t.checked === true).length;
    expect(totalChecked).toBe(3);
  });
});
