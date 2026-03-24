import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfig } from '../config.js';
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

export function readSessionPlan(sessionId: string): SessionPlan | null {
  const planPath = path.join(getConfig().sessionStateDir, sessionId, 'plan.md');

  if (!fs.existsSync(planPath)) {
    return null;
  }

  const raw = fs.readFileSync(planPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const sections: PlanSection[] = [];

  let currentSection: PlanSection | null = null;
  let currentTask: PlanTask | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const sectionMatch = line.match(/^###?\s+(.+)$/);
    if (sectionMatch) {
      currentSection = {
        title: sectionMatch[1].trim(),
        tasks: [],
      };
      sections.push(currentSection);
      currentTask = null;
      continue;
    }

    const boldTaskMatch = line.match(/^- \*\*(.+?)\*\*(.*)$/);
    if (boldTaskMatch) {
      if (!currentSection) {
        currentSection = { title: 'Plan', tasks: [] };
        sections.push(currentSection);
      }

      const title = boldTaskMatch[1].trim().replace(/:\s*$/, '');
      const descriptionText = boldTaskMatch[2].trim().replace(/^[:\-–]\s*/, '').trim();
      const taskIndex = currentSection.tasks.length;
      const task: PlanTask = {
        id: createTaskId(sections.length - 1, taskIndex, title),
        title,
      };

      if (descriptionText) {
        task.description = descriptionText;
      }

      currentSection.tasks.push(task);
      currentTask = task;
      continue;
    }

    const bulletTaskMatch = line.match(/^- (.+)$/);
    if (bulletTaskMatch) {
      if (!currentSection) {
        currentSection = { title: 'Plan', tasks: [] };
        sections.push(currentSection);
      }

      const title = bulletTaskMatch[1].trim();
      const taskIndex = currentSection.tasks.length;
      const task: PlanTask = {
        id: createTaskId(sections.length - 1, taskIndex, title),
        title,
      };
      currentSection.tasks.push(task);
      currentTask = task;
      continue;
    }

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
