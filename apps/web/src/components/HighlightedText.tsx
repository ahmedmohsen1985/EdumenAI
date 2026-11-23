'use client';

import React from 'react';

interface HighlightedTextProps {
  html: string;
  className?: string;
}

type TextSegment =
  | { type: 'text'; value: string }
  | { type: 'mark'; value: string };

function tokenizeParagraph(paragraph: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const markRegex = /<mark(?:\s+[^>]*)?>([\s\S]*?)<\/mark>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markRegex.exec(paragraph)) !== null) {
    if (match.index > lastIndex) {
      const plain = paragraph.slice(lastIndex, match.index).replace(/<[^>]+>/g, '');
      if (plain) {
        segments.push({ type: 'text', value: plain });
      }
    }

    const marked = (match[1] ?? '').replace(/<[^>]+>/g, '');
    if (marked) {
      segments.push({ type: 'mark', value: marked });
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
    return <p className="text-sm italic text-slate-500">No corrected version provided.</p>;
  }

  const paragraphs = normalized
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className={className ?? 'space-y-3 text-sm leading-relaxed text-slate-800'}>
      {paragraphs.map((paragraph, pIdx) => {
        const segments = tokenizeParagraph(paragraph);
        return (
          <p key={pIdx} className="leading-relaxed">
            {segments.map((seg, sIdx) =>
              seg.type === 'mark' ? (
                <mark key={sIdx} className="correction font-medium">
                  {seg.value}
                </mark>
              ) : (
                <React.Fragment key={sIdx}>{seg.value}</React.Fragment>
              )
            )}
          </p>
        );
      })}
    </div>
  );
}
