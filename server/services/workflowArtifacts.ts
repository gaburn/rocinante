import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import type { WorkflowArtifact } from '../../shared/workflowTypes.js';

export function artifactKey(artifact: WorkflowArtifact): string {
  return `${artifact.type}:${artifact.value}`;
}

export function uniqueArtifacts(artifacts: WorkflowArtifact[]): WorkflowArtifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = artifactKey(artifact);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validatePersistedArtifact(
  raw: unknown,
  repositoryTarget: string,
  field: string,
): WorkflowArtifact {
  if (
    !raw
    || typeof raw !== 'object'
    || Array.isArray(raw)
    || Object.keys(raw).sort().join(',') !== 'type,value'
  ) {
    throw new Error(`${field} must be an artifact object with type and value`);
  }
  const artifact = raw as Record<string, unknown>;
  if (
    (artifact.type !== 'url' && artifact.type !== 'path')
    || typeof artifact.value !== 'string'
  ) {
    throw new Error(`${field} is invalid`);
  }
  try {
    const validated = validateArtifact(artifact, repositoryTarget, false);
    if (validated.type !== artifact.type || validated.value !== artifact.value) {
      throw new Error(`${field} is not canonical`);
    }
    return validated;
  } catch (error) {
    throw new Error(`${field}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateArtifact(
  raw: unknown,
  repositoryTarget: string,
  requireExistingPath = true,
): WorkflowArtifact {
  let value: string;
  let declaredType: unknown;
  if (typeof raw === 'string') {
    value = raw.trim();
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const artifact = raw as Record<string, unknown>;
    const candidate = artifact.value ?? artifact.ref ?? artifact.url ?? artifact.path;
    if (typeof candidate !== 'string') throw new Error('artifact value must be a string');
    value = candidate.trim();
    declaredType = artifact.type ?? artifact.kind;
    if (declaredType === undefined && typeof artifact.url === 'string') declaredType = 'url';
    if (declaredType === undefined && typeof artifact.path === 'string') declaredType = 'path';
  } else {
    throw new Error('artifact must be a string or artifact object');
  }
  if (value.length === 0 || value.includes('\0')) {
    throw new Error('artifact value must be nonempty and contain no null bytes');
  }

  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || declaredType === 'url') {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('artifact URL is invalid');
    }
    if (url.protocol !== 'https:') throw new Error('artifact URLs must use HTTPS');
    if (declaredType !== undefined && declaredType !== 'url') {
      throw new Error('artifact type does not match its URL value');
    }
    return { type: 'url', value: url.toString() };
  }

  if (declaredType !== undefined && declaredType !== 'path') {
    throw new Error('local artifact type must be path');
  }
  if (path.isAbsolute(value)) throw new Error('local artifact paths must be repository-relative');
  if (value.split(/[\\/]+/).includes('..')) {
    throw new Error('local artifact paths cannot contain traversal segments');
  }

  const candidatePath = path.resolve(repositoryTarget, value);
  const resolvedPath = requireExistingPath ? existingPath(candidatePath) : candidatePath;
  const relative = path.relative(repositoryTarget, resolvedPath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('local artifact path resolves outside repositoryTarget');
  }
  return { type: 'path', value: (relative || '.').split(path.sep).join('/') };
}

function existingPath(candidatePath: string): string {
  try {
    const resolved = realpathSync(candidatePath);
    statSync(resolved);
    return resolved;
  } catch {
    throw new Error('local artifact path does not exist');
  }
}
