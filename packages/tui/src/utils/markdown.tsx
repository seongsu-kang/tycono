/**
 * Terminal Markdown Renderer
 *
 * Converts markdown text to Ink <Text> elements with basic formatting:
 * - **bold** → bold text
 * - `code` → dimmed text
 * - ## heading → bold colored text
 * - --- → horizontal line
 * - | table | → kept as-is (monospace already works)
 */

import React from 'react';
import { Text } from 'ink';

interface Segment {
  text: string;
  bold?: boolean;
  dim?: boolean;
  color?: string;
}

/** Parse inline markdown (bold, code) into segments */
function parseInline(text: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Bold: **text**
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) segments.push({ text: boldMatch[1] });
      segments.push({ text: boldMatch[2], bold: true });
      remaining = boldMatch[3];
      continue;
    }

    // Inline code: `text`
    const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/s);
    if (codeMatch) {
      if (codeMatch[1]) segments.push({ text: codeMatch[1] });
      segments.push({ text: codeMatch[2], dim: true, color: 'yellow' });
      remaining = codeMatch[3];
      continue;
    }

    // No more matches — push rest
    segments.push({ text: remaining });
    break;
  }

  return segments;
}

/** Render a single line of markdown as Ink elements */
export function renderMarkdownLine(line: string, key: string | number): React.ReactElement {
  // Horizontal rule
  if (/^---+$/.test(line.trim())) {
    return <Text key={key} color="gray">{'\u2500'.repeat(Math.min(60, process.stdout.columns || 60))}</Text>;
  }

  // Heading: ## text
  const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const content = headingMatch[2].replace(/\*\*/g, ''); // Strip bold in headings
    const color = level <= 2 ? 'cyan' : 'white';
    return <Text key={key} color={color} bold>{content}</Text>;
  }

  // Empty line
  if (!line.trim()) {
    return <Text key={key}> </Text>;
  }

  // Regular line with inline formatting
  const segments = parseInline(line);

  if (segments.length === 1 && !segments[0].bold && !segments[0].dim) {
    // Simple text — no formatting needed
    return <Text key={key} color="white">{segments[0].text}</Text>;
  }

  return (
    <Text key={key}>
      {segments.map((seg, i) => (
        <Text
          key={i}
          bold={seg.bold}
          dimColor={seg.dim}
          color={seg.color ?? 'white'}
        >
          {seg.text}
        </Text>
      ))}
    </Text>
  );
}

/** Render multi-line markdown text as array of Ink elements */
export function renderMarkdown(text: string, baseKey: string | number = 0): React.ReactElement[] {
  return text.split('\n').map((line, i) => renderMarkdownLine(line, `${baseKey}-${i}`));
}
