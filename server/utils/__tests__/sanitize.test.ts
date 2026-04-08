import { describe, it, expect } from 'vitest';
import { sanitizeSessionId, validateShellName } from '../sanitize.js';

describe('sanitizeSessionId', () => {
  describe('valid session IDs', () => {
    it('accepts a standard UUID', () => {
      expect(sanitizeSessionId('550e8400-e29b-41d4-a716-446655440000'))
        .toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('accepts alphanumeric-only IDs', () => {
      expect(sanitizeSessionId('abc123')).toBe('abc123');
    });

    it('accepts IDs with hyphens and underscores', () => {
      expect(sanitizeSessionId('session_2025-07-01_abc')).toBe('session_2025-07-01_abc');
    });

    it('accepts single character IDs', () => {
      expect(sanitizeSessionId('a')).toBe('a');
    });
  });

  describe('path traversal attacks', () => {
    it('rejects relative path traversal (..)', () => {
      expect(() => sanitizeSessionId('../../etc/passwd'))
        .toThrow('path traversal');
    });

    it('rejects hidden traversal (encoded dots)', () => {
      expect(() => sanitizeSessionId('..'))
        .toThrow('path traversal');
    });

    it('rejects traversal embedded in otherwise-valid ID', () => {
      expect(() => sanitizeSessionId('abc/../etc/passwd'))
        .toThrow(); // contains / and ..
    });

    it('rejects forward slash separators', () => {
      expect(() => sanitizeSessionId('abc/def'))
        .toThrow('path separator');
    });

    it('rejects backslash separators', () => {
      expect(() => sanitizeSessionId('abc\\def'))
        .toThrow('path separator');
    });

    it('rejects null bytes', () => {
      expect(() => sanitizeSessionId('abc\0def'))
        .toThrow('null bytes');
    });
  });

  describe('invalid formats', () => {
    it('rejects empty string', () => {
      expect(() => sanitizeSessionId('')).toThrow('must not be empty');
    });

    it('rejects spaces', () => {
      expect(() => sanitizeSessionId('abc def')).toThrow('invalid characters');
    });

    it('rejects shell metacharacters (semicolons)', () => {
      expect(() => sanitizeSessionId('abc;ls')).toThrow('invalid characters');
    });

    it('rejects pipe characters', () => {
      expect(() => sanitizeSessionId('abc|cat /etc/passwd')).toThrow();
    });

    it('rejects backticks', () => {
      expect(() => sanitizeSessionId('`whoami`')).toThrow('invalid characters');
    });

    it('rejects dollar signs', () => {
      expect(() => sanitizeSessionId('$(cat /etc/passwd)')).toThrow();
    });
  });
});

describe('validateShellName', () => {
  describe('allowed shells', () => {
    it.each([
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
    ])('accepts "%s"', (shell) => {
      expect(validateShellName(shell)).toBe(shell);
    });

    it('accepts case variations', () => {
      expect(validateShellName('PowerShell')).toBe('PowerShell');
      expect(validateShellName('BASH')).toBe('BASH');
      expect(validateShellName('Cmd.exe')).toBe('Cmd.exe');
    });
  });

  describe('shell injection attacks', () => {
    it('rejects arbitrary executables', () => {
      expect(() => validateShellName('/bin/evil'))
        .toThrow('not in the allowed list');
    });

    it('rejects command injection via semicolons', () => {
      expect(() => validateShellName('bash; rm -rf /'))
        .toThrow('not in the allowed list');
    });

    it('rejects command injection via pipes', () => {
      expect(() => validateShellName('bash | cat /etc/passwd'))
        .toThrow('not in the allowed list');
    });

    it('rejects path-qualified shell names', () => {
      expect(() => validateShellName('/usr/bin/bash'))
        .toThrow('not in the allowed list');
    });

    it('rejects unknown shell names', () => {
      expect(() => validateShellName('evil-shell'))
        .toThrow('not in the allowed list');
    });

    it('rejects empty string', () => {
      expect(() => validateShellName('')).toThrow('must not be empty');
    });

    it('rejects backtick injection', () => {
      expect(() => validateShellName('`whoami`'))
        .toThrow('not in the allowed list');
    });
  });
});
