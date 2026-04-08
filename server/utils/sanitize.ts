/**
 * Input sanitization utilities for security-critical paths.
 *
 * Addresses P0 vulnerabilities:
 * - Path traversal via sessionId in file-path construction
 * - Shell injection via unsanitized shell name in ptyManager
 */

/**
 * Allowed pattern for session IDs: alphanumeric characters, hyphens, and
 * underscores only. Copilot CLI uses UUID-format session identifiers.
 */
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates and returns a session ID that is safe to use as a path segment.
 *
 * Rejects any value containing path-traversal sequences (`..`), path
 * separators (`/`, `\`), null bytes, or characters outside the expected
 * alphanumeric-plus-hyphens format.
 *
 * @throws {Error} if the sessionId is invalid
 */
export function sanitizeSessionId(sessionId: string): string {
  if (!sessionId || sessionId.length === 0) {
    throw new Error('Session ID must not be empty');
  }

  if (sessionId.includes('\0')) {
    throw new Error('Session ID contains null bytes');
  }

  if (sessionId.includes('..')) {
    throw new Error('Session ID contains path traversal sequence');
  }

  if (sessionId.includes('/') || sessionId.includes('\\')) {
    throw new Error('Session ID contains path separator');
  }

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('Session ID contains invalid characters');
  }

  return sessionId;
}

/**
 * Allowlist of recognized shell names. Values are normalized to lowercase
 * for comparison. Both bare names and `.exe` suffixed variants are accepted
 * on Windows.
 */
const ALLOWED_SHELLS = new Set([
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
  'cmd',
  'cmd.exe',
  'bash',
  'bash.exe',
  'zsh',
  'sh',
  'fish',
]);

/**
 * Validates that a shell name is in the known allowlist.
 *
 * @throws {Error} if the shell name is not recognized
 */
export function validateShellName(shellName: string): string {
  if (!shellName || shellName.length === 0) {
    throw new Error('Shell name must not be empty');
  }

  const normalized = shellName.toLowerCase().trim();

  if (!ALLOWED_SHELLS.has(normalized)) {
    throw new Error(
      `Shell "${shellName}" is not in the allowed list. ` +
      `Allowed shells: ${[...ALLOWED_SHELLS].join(', ')}`,
    );
  }

  return shellName;
}
