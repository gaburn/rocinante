import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderInlineMarkdown } from '../inlineMarkdown.js';

/** Helper: render the result to an HTML string for assertion */
function renderToHtml(text: string): string {
  const node = renderInlineMarkdown(text);
  // Plain strings aren't React elements — wrap them
  if (typeof node === 'string') {
    return node;
  }
  return renderToStaticMarkup(React.createElement(React.Fragment, null, node));
}

describe('renderInlineMarkdown', () => {
  describe('bold formatting', () => {
    it('renders **bold** as <strong>', () => {
      const html = renderToHtml('**bold text**');
      expect(html).toContain('<strong>bold text</strong>');
    });
  });

  describe('italic formatting', () => {
    it('renders *italic* as <em>', () => {
      const html = renderToHtml('*italic text*');
      expect(html).toContain('<em>italic text</em>');
    });
  });

  describe('code formatting', () => {
    it('renders `code` as <code>', () => {
      const html = renderToHtml('`inline code`');
      expect(html).toContain('<code');
      expect(html).toContain('inline code');
      expect(html).toContain('</code>');
    });
  });

  describe('mixed formatting', () => {
    it('renders **bold** and *italic* together', () => {
      const html = renderToHtml('**bold** and *italic*');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<em>italic</em>');
      expect(html).toContain(' and ');
    });

    it('renders bold, italic, and code in one string', () => {
      const html = renderToHtml('Use **this** or *that* or `code`');
      expect(html).toContain('<strong>this</strong>');
      expect(html).toContain('<em>that</em>');
      expect(html).toContain('code</code>');
    });
  });

  describe('plain text passthrough', () => {
    it('returns plain text unchanged when no markdown tokens', () => {
      const result = renderInlineMarkdown('just plain text');
      // Plain text should pass through as a string
      expect(result).toBe('just plain text');
    });

    it('returns empty string for empty input', () => {
      const result = renderInlineMarkdown('');
      expect(result).toBe('');
    });
  });

  describe('table detection and rendering', () => {
    it('renders a markdown table as an HTML <table>', () => {
      const input = '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |';
      const html = renderToHtml(input);
      expect(html).toContain('<table');
      expect(html).toContain('<th');
      expect(html).toContain('Name');
      expect(html).toContain('Age');
      expect(html).toContain('<td');
      expect(html).toContain('Alice');
      expect(html).toContain('Bob');
    });

    it('renders inline markdown within table cells', () => {
      const input = '| Col |\n|-----|\n| **bold** |';
      const html = renderToHtml(input);
      expect(html).toContain('<strong>bold</strong>');
    });

    it('treats pipe lines without separator row as plain text', () => {
      const input = '| not a table |';
      const html = renderToHtml(input);
      // Without a separator row, this should not become a <table>
      expect(html).not.toContain('<table');
    });
  });

  describe('edge cases', () => {
    it('preserves emoji characters', () => {
      const html = renderToHtml('🚀 Launch **now** 🎉');
      expect(html).toContain('🚀');
      expect(html).toContain('🎉');
      expect(html).toContain('<strong>now</strong>');
    });

    it('does not match unbalanced markers', () => {
      // Single * without closing should not render as italic
      const result = renderInlineMarkdown('just *unclosed');
      // Should pass through without <em>
      const html = typeof result === 'string' ? result : renderToStaticMarkup(React.createElement(React.Fragment, null, result));
      expect(html).not.toContain('<em>');
    });
  });
});
