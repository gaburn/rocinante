import React from 'react';

/**
 * Renders inline markdown tokens (**bold**, *italic*, `code`) as React elements.
 */
function renderInlineTokens(text: string, keyPrefix = ''): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const [fullMatch] = match;
    const key = `${keyPrefix}${match.index}`;

    if (match[1]) {
      const code = fullMatch.slice(1, -1);
      parts.push(
        <code key={key} className="rounded bg-surface-tertiary px-1 py-0.5 font-mono text-[0.9em] text-fuchsia-300/90">
          {code}
        </code>
      );
    } else if (match[2]) {
      parts.push(<strong key={key}>{fullMatch.slice(2, -2)}</strong>);
    } else if (match[3]) {
      parts.push(<em key={key}>{fullMatch.slice(1, -1)}</em>);
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>;
}

/** True if the line is a markdown table separator like |------|--------| */
function isSeparatorRow(line: string): boolean {
  return /^\|[\s:-]+(\|[\s:-]+)+\|?\s*$/.test(line);
}

/** Split a pipe-delimited row into trimmed cell values */
function parseCells(line: string): string[] {
  // Strip leading/trailing pipes, then split on inner pipes
  const stripped = line.replace(/^\||\|$/g, '');
  return stripped.split('|').map(c => c.trim());
}

/** Render a parsed markdown table as a styled <table> */
function renderTable(
  headers: string[],
  rows: string[][],
  tableIndex: number,
): React.ReactNode {
  return (
    <table key={`table-${tableIndex}`} className="w-full text-xs border-collapse my-1">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th
              key={`th-${tableIndex}-${i}`}
              className="text-left font-medium text-fg/60 border-b border-border-default px-2 py-1"
            >
              {renderInlineTokens(h, `th-${tableIndex}-${i}-`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={`tr-${tableIndex}-${ri}`}>
            {headers.map((_, ci) => (
              <td
                key={`td-${tableIndex}-${ri}-${ci}`}
                className="text-fg/80 border-b border-border-default/50 px-2 py-1"
              >
                {renderInlineTokens(row[ci] ?? '', `td-${tableIndex}-${ri}-${ci}-`)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Split text into blocks of plain text and markdown tables.
 * A table block is a contiguous run of pipe-delimited lines that includes
 * a separator row (|---|---|).
 */
function splitBlocks(text: string): { type: 'text' | 'table'; content: string }[] {
  const lines = text.split('\n');
  const blocks: { type: 'text' | 'table'; content: string }[] = [];
  let buf: string[] = [];
  let inTable = false;

  const flushBuf = (type: 'text' | 'table') => {
    if (buf.length > 0) {
      blocks.push({ type, content: buf.join('\n') });
      buf = [];
    }
  };

  for (const line of lines) {
    const isPipeLine = /^\s*\|/.test(line);

    if (inTable) {
      if (isPipeLine) {
        buf.push(line);
      } else {
        flushBuf('table');
        inTable = false;
        buf.push(line);
      }
    } else {
      if (isPipeLine) {
        flushBuf('text');
        inTable = true;
        buf.push(line);
      } else {
        buf.push(line);
      }
    }
  }

  // Flush remaining — only mark as table if it has a separator row
  if (inTable) {
    flushBuf('table');
  } else {
    flushBuf('text');
  }

  // Validate table blocks: must contain a separator row, otherwise demote to text
  return blocks.map(b => {
    if (b.type === 'table') {
      const tableLines = b.content.split('\n');
      const hasSeparator = tableLines.some(l => isSeparatorRow(l));
      if (!hasSeparator) return { type: 'text' as const, content: b.content };
    }
    return b;
  });
}

/**
 * Renders basic inline markdown as React elements.
 * Handles: **bold**, *italic*, `code`, markdown tables, and preserves emoji.
 */
export function renderInlineMarkdown(text: string): React.ReactNode {
  // Fast path: no pipe chars means no tables possible
  if (!text.includes('|')) {
    return renderInlineTokens(text);
  }

  const blocks = splitBlocks(text);

  // If everything collapsed to a single text block, use the simple path
  if (blocks.length === 1 && blocks[0].type === 'text') {
    return renderInlineTokens(text);
  }

  let tableCount = 0;
  const rendered: React.ReactNode[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.type === 'text') {
      const trimmed = block.content;
      if (trimmed) {
        rendered.push(
          <React.Fragment key={`text-${i}`}>
            {renderInlineTokens(trimmed, `b${i}-`)}
          </React.Fragment>
        );
      }
    } else {
      // Parse table
      const lines = block.content.split('\n').filter(l => l.trim());
      const sepIdx = lines.findIndex(l => isSeparatorRow(l));
      if (sepIdx < 1) {
        // Malformed — render as text
        rendered.push(
          <React.Fragment key={`text-${i}`}>
            {renderInlineTokens(block.content, `b${i}-`)}
          </React.Fragment>
        );
        continue;
      }

      const headers = parseCells(lines[sepIdx - 1]);
      const dataRows = lines.slice(sepIdx + 1).map(l => parseCells(l));
      rendered.push(renderTable(headers, dataRows, tableCount++));
    }
  }

  return <>{rendered}</>;
}
