import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig } from '../config.js';
import { sanitizeSessionId } from '../utils/sanitize.js';
import type { SessionPlan, PlanSection, PlanTask } from '../../src/types/index.js';

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16);
}

function createTaskId(sectionIndex: number, taskIndex: number, title: string): string {
  return simpleHash(`${sectionIndex}:${taskIndex}:${title}`);
}

const TABLE_SEPARATOR_RE = /^\|[\s\-:]+(\|[\s\-:]+)+\|?\s*$/;
const STATUS_CELL_RE = /^(✅\s*(?:Done|Complete|Completed)?|❌\s*(?:Pending|TODO)?|Done|Complete|Completed|DONE|Pending|TODO)$/i;
const CHECKED_RE = /✅|^Done$|^Complete$|^Completed$|^DONE$/i;
const UNCHECKED_RE = /❌|^Pending$|^TODO$/i;

function detectTableStatus(cells: string[]): { checked: boolean; checkedFromFile: boolean } | null {
  for (const cell of cells) {
    const c = cell.trim();
    if (CHECKED_RE.test(c)) return { checked: true, checkedFromFile: true };
    if (UNCHECKED_RE.test(c)) return { checked: false, checkedFromFile: true };
  }
  return null;
}

export function readSessionPlan(sessionId: string): SessionPlan | null {
  const safeId = sanitizeSessionId(sessionId);
  const planPath = path.join(getConfig().sessionStateDir, safeId, 'plan.md');

  if (!fs.existsSync(planPath)) {
    return null;
  }

  const raw = fs.readFileSync(planPath, 'utf8');
  return parsePlanMarkdown(raw);
}

/** Parse plan markdown into structured sections/tasks. Exported for testing. */
export function parsePlanMarkdown(raw: string): SessionPlan {
  const lines = raw.split(/\r?\n/);
  const sections: PlanSection[] = [];

  let currentSection: PlanSection | null = null;
  let currentTask: PlanTask | null = null;
  let inCodeBlock = false;
  let inTable = false;

  function ensureSection(): PlanSection {
    if (!currentSection) {
      currentSection = { title: 'Plan', tasks: [] };
      sections.push(currentSection);
    }
    return currentSection;
  }

  function buildTask(title: string, description?: string, checked?: boolean): PlanTask {
    const section = ensureSection();
    const taskIndex = section.tasks.length;
    const task: PlanTask = {
      id: createTaskId(sections.length - 1, taskIndex, title),
      title,
    };
    if (description) {
      task.description = description;
    }
    if (checked !== undefined) {
      task.checked = checked;
      task.checkedFromFile = true;
    }
    section.tasks.push(task);
    return task;
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // --- Code block immunity ---
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // --- Table separator (|---|---|) → enter table mode ---
    if (TABLE_SEPARATOR_RE.test(trimmed)) {
      inTable = true;
      continue;
    }

    // --- Table data rows ---
    if (inTable && trimmed.startsWith('|')) {
      const cells = trimmed.split('|').map(c => c.trim()).filter(c => c !== '');
      if (cells.length === 0) continue;

      const title = cells[0];
      const restCells = cells.slice(1);
      const status = detectTableStatus(restCells);
      const descParts = restCells.filter(c => !STATUS_CELL_RE.test(c.trim()));
      const description = descParts.join(' — ').trim();

      currentTask = buildTask(title, description || undefined, status?.checked);
      continue;
    }

    // Exit table mode on non-pipe line
    if (inTable && !trimmed.startsWith('|')) {
      inTable = false;
    }

    // Skip potential table header rows (| ... | before separator confirmed)
    if (!inTable && trimmed.startsWith('|') && trimmed.includes('|', 1)) {
      continue;
    }

    // --- Section headings: # / ## / ### ---
    const sectionMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (sectionMatch) {
      currentSection = {
        title: sectionMatch[1].trim(),
        tasks: [],
      };
      sections.push(currentSection);
      currentTask = null;
      continue;
    }

    // --- Nested bullets → append to parent task description ---
    const nestedBulletMatch = line.match(/^(\s{2,})[-*]\s+(.+)$/);
    if (nestedBulletMatch && currentTask) {
      const subText = nestedBulletMatch[2].trim();
      currentTask.description = currentTask.description
        ? `${currentTask.description}\n${subText}`
        : subText;
      continue;
    }

    // --- Checkbox + bold: - [x] **Bold**: desc ---
    const checkboxBoldMatch = line.match(/^- \[([xX ])\]\s+\*\*(.+?)\*\*(.*)$/);
    if (checkboxBoldMatch) {
      const checked = checkboxBoldMatch[1].toLowerCase() === 'x';
      const title = checkboxBoldMatch[2].trim().replace(/:\s*$/, '');
      const desc = checkboxBoldMatch[3].trim().replace(/^[:\-–]\s*/, '').trim();
      currentTask = buildTask(title, desc || undefined, checked);
      continue;
    }

    // --- Checkbox plain: - [ ] Task text ---
    const checkboxMatch = line.match(/^- \[([xX ])\]\s+(.+)$/);
    if (checkboxMatch) {
      const checked = checkboxMatch[1].toLowerCase() === 'x';
      const title = checkboxMatch[2].trim();
      currentTask = buildTask(title, undefined, checked);
      continue;
    }

    // --- Bold bullet: - **Bold**: description (existing pattern) ---
    const boldTaskMatch = line.match(/^- \*\*(.+?)\*\*(.*)$/);
    if (boldTaskMatch) {
      const title = boldTaskMatch[1].trim().replace(/:\s*$/, '');
      const desc = boldTaskMatch[2].trim().replace(/^[:\-–]\s*/, '').trim();
      currentTask = buildTask(title, desc || undefined);
      continue;
    }

    // --- Plain bullet: - Task text (existing pattern) ---
    const bulletTaskMatch = line.match(/^- (.+)$/);
    if (bulletTaskMatch) {
      currentTask = buildTask(bulletTaskMatch[1].trim());
      continue;
    }

    // --- Numbered checkbox bold: 1. [x] **Bold**: desc ---
    const numberedCheckboxBoldMatch = line.match(/^\d+\.\s+\[([xX ])\]\s+\*\*(.+?)\*\*(.*)$/);
    if (numberedCheckboxBoldMatch) {
      const checked = numberedCheckboxBoldMatch[1].toLowerCase() === 'x';
      const title = numberedCheckboxBoldMatch[2].trim().replace(/:\s*$/, '');
      const desc = numberedCheckboxBoldMatch[3].trim().replace(/^[:\-–]\s*/, '').trim();
      currentTask = buildTask(title, desc || undefined, checked);
      continue;
    }

    // --- Numbered checkbox plain: 1. [x] Task text ---
    const numberedCheckboxMatch = line.match(/^\d+\.\s+\[([xX ])\]\s+(.+)$/);
    if (numberedCheckboxMatch) {
      const checked = numberedCheckboxMatch[1].toLowerCase() === 'x';
      const title = numberedCheckboxMatch[2].trim();
      currentTask = buildTask(title, undefined, checked);
      continue;
    }

    // --- Numbered bold: 1. **Bold**: description ---
    const numberedBoldMatch = line.match(/^\d+\.\s+\*\*(.+?)\*\*(.*)$/);
    if (numberedBoldMatch) {
      const title = numberedBoldMatch[1].trim().replace(/:\s*$/, '');
      const desc = numberedBoldMatch[2].trim().replace(/^[:\-–]\s*/, '').trim();
      currentTask = buildTask(title, desc || undefined);
      continue;
    }

    // --- Numbered plain: 1. Task text ---
    const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (numberedMatch) {
      currentTask = buildTask(numberedMatch[1].trim());
      continue;
    }

    // --- Continuation text → append to current task ---
    if (trimmed && currentTask) {
      currentTask.description = currentTask.description
        ? `${currentTask.description}\n${trimmed}`
        : trimmed;
    }
  }

  return {
    raw,
    sections,
  };
}
