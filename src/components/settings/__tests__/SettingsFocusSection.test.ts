import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../types/settings'

/**
 * Tests for the Focus & Limits settings defaults and constraints (issue #24).
 *
 * Validates that the type-level defaults match the spec.
 * Full render tests of SettingsPanel require the entire context tree —
 * deferred to integration tests.
 */

describe('Focus & Limits settings defaults', () => {
  it('focusModeEnabled defaults to false', () => {
    expect(DEFAULT_SETTINGS.display.focusModeEnabled).toBe(false)
  })

  it('workstreamThreshold defaults to 3', () => {
    expect(DEFAULT_SETTINGS.display.workstreamThreshold).toBe(3)
  })
})
