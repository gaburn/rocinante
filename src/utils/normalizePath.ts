/**
 * Normalize a file path for cross-platform comparison.
 * - Replaces backslashes with forward slashes
 * - Removes trailing slashes
 * - Lowercases on Windows (detected by drive letter, e.g. C:\)
 */
export function normalizePath(p: string): string {
  let normalized = p.replace(/\\/g, '/')
  normalized = normalized.replace(/\/+$/, '')
  // Lowercase when path looks like a Windows drive path (e.g. C:/...)
  if (normalized.length >= 2 && normalized[1] === ':') {
    normalized = normalized.toLowerCase()
  }
  return normalized
}
