import { describe, it, expect } from 'vitest'
import { normalizePath } from '../normalizePath'

describe('normalizePath', () => {
  it('replaces backslashes with forward slashes', () => {
    expect(normalizePath('C:\\Users\\dev\\project')).toBe('c:/users/dev/project')
  })

  it('removes trailing slashes', () => {
    expect(normalizePath('/home/user/project/')).toBe('/home/user/project')
  })

  it('removes multiple trailing slashes', () => {
    expect(normalizePath('/home/user/project///')).toBe('/home/user/project')
  })

  it('lowercases paths that look like Windows paths (drive letter colon)', () => {
    expect(normalizePath('C:/Users/Dev/Project')).toBe('c:/users/dev/project')
    expect(normalizePath('D:/Work/Repo')).toBe('d:/work/repo')
  })

  it('does NOT lowercase Unix-style paths', () => {
    expect(normalizePath('/Home/User/MyProject')).toBe('/Home/User/MyProject')
  })

  it('handles already-normalized paths (no-op)', () => {
    expect(normalizePath('/home/user/project')).toBe('/home/user/project')
  })

  it('handles empty string gracefully', () => {
    expect(normalizePath('')).toBe('')
  })

  it('handles a bare drive letter path', () => {
    expect(normalizePath('C:\\')).toBe('c:')
  })

  it('handles mixed slashes', () => {
    expect(normalizePath('C:\\Users/dev\\project/')).toBe('c:/users/dev/project')
  })

  it('does not add or remove leading slash on Unix paths', () => {
    expect(normalizePath('/usr/local/bin')).toBe('/usr/local/bin')
  })
})
