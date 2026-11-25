'use client';

import React from 'react';

interface HighlightedTextProps {
  html: string;
  className?: string;
}

type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'correction'; value: string }
  | { type: 'suggestion'; value: string };

const TAG_REGEX =
  /<(mark|ins|suggest)(\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;

function classifyHighlight(tagName: string, attrs: string): 'correction' | 'suggestion' {
  const lowerTag = tagName.toLowerCase();
  if (lowerTag === 'ins' || lowerTag === 'suggest') {
    return 'suggestion';
  }
  if (/class\s*=\s*["'][^"']*\b(suggestion|addition)\b[^"']*["']/i.test(attrs)) {
    return 'suggestion';
  }
  return 'correction';
}

function tokenizeParagraph(paragraph: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TAG_REGEX.lastIndex = 0;

  while ((match = TAG_REGEX.exec(paragraph)) !== null) {
    if (match.index > lastIndex) {
      const plain = paragraph.slice(lastIndex, match.index).replace(/<[^>]+>/g, '');
      if (plain) {
        segments.push({ type: 'text', value: plain });
      }
    }

    const tagName = match[1] ?? 'mark';
    const attrs = match[2] ?? '';
    const inner = (match[3] ?? '').replace(/<[^>]+>/g, '');
    if (inner) {
      segments.push({ type: classifyHighlight(tagName, attrs), value: inner });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < paragraph.length) {
    const rest = paragraph.slice(lastIndex).replace(/<[^>]+>/g, '');
    if (rest) {
      segments.push({ type: 'text', value: rest });
    }
  }

  return segments;
}

export function HighlightedText({ html, className }: HighlightedTextProps): React.ReactElement {
  const normalized = (html || '').replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return <p className="text-sm italic text-zinc-500">No corrected version provided.</p>;
  }

  const paragraphs = normalized
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className={className ?? 'space-y-3 text-sm leading-relaxed text-zinc-800'}>
      {paragraphs.map((paragraph, pIdx) => {
        const segments = tokenizeParagraph(paragraph);
        return (
          <p key={pIdx} className="leading-relaxed">
            {segments.map((seg, sIdx) => {
              if (seg.type === 'correction') {
                return (
                  <mark key={sIdx} className="correction font-medium">
                    {seg.value}
                  </mark>
                );
              }
              if (seg.type === 'suggestion') {
                return (
                  <ins key={sIdx} className="suggestion font-medium">
                    {seg.value}
                  </ins>
                );
              }
              return <React.Fragment key={sIdx}>{seg.value}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}
