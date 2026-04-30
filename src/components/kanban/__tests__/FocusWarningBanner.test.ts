import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import FocusWarningBanner from '../FocusWarningBanner'

/**
 * Tests for FocusWarningBanner component (issue #24).
 *
 * Uses renderToStaticMarkup (node environment) to match the repo's
 * existing TSX test pattern (see inlineMarkdown.test.tsx).
 */

function renderBanner(activeCount: number, threshold: number) {
  return renderToStaticMarkup(
    React.createElement(FocusWarningBanner, {
      activeCount,
      threshold,
      onDismiss: () => {},
    }),
  )
}

describe('FocusWarningBanner', () => {
  it('renders the active count and threshold in the text', () => {
    const html = renderBanner(5, 3)
    expect(html).toContain('5')
    expect(html).toContain('3')
    expect(html).toContain('workstreams are currently active')
  })

  it('has role="alert" for accessibility', () => {
    const html = renderBanner(4, 3)
    expect(html).toContain('role="alert"')
  })

  it('renders a dismiss button with data-testid', () => {
    const html = renderBanner(5, 3)
    expect(html).toContain('data-testid="focus-warning-dismiss"')
    expect(html).toContain('Dismiss')
  })

  it('has data-testid="focus-warning-banner" on the container', () => {
    const html = renderBanner(6, 3)
    expect(html).toContain('data-testid="focus-warning-banner"')
  })
})
