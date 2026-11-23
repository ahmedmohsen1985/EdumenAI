'use client';

import type React from 'react';
import { BookOpen } from 'lucide-react';
import { z } from 'zod';
import type { TemplateBlock } from '@edumenai/shared';
import type { BlockDefinition, BlockRuntimeContext } from '../types.js';

const RichTextBlockPropsSchema = z
  .object({
    heading: z.string().optional(),
    content: z.string().optional(),
    tone: z.enum(['neutral', 'cream', 'info']).optional()
  })
  .default({});

interface ContentChunk {
  kind: 'paragraph' | 'list';
  lines: string[];
}

function parseStructuredText(raw: string): ContentChunk[] {
  const blocks = raw.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const chunks: ContentChunk[] = [];

  for (const rawBlock of blocks) {
    const lines = rawBlock
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const isBulletList = lines.every((l) => /^[-*•]\s+/.test(l));
    if (isBulletList) {
      chunks.push({
        kind: 'list',
        lines: lines.map((l) => l.replace(/^[-*•]\s+/, ''))
      });
    } else {
      chunks.push({
        kind: 'paragraph',
        lines
      });
    }
  }

  return chunks;
}

function RichTextBlockRuntime({
  block
}: {
  block: TemplateBlock;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const parsedProps = RichTextBlockPropsSchema.safeParse(block.props ?? {});
  const props = parsedProps.success ? parsedProps.data : {};
  const tone = props.tone ?? 'cream';
  const heading = props.heading || block.label;
  const content = props.content || '';
  const chunks = parseStructuredText(content);

  const toneClasses =
    tone === 'info'
      ? 'border-blue-200 bg-blue-50/70 text-slate-800'
      : tone === 'neutral'
        ? 'border-slate-200 bg-slate-50 text-slate-800'
        : 'border-brand-gold/30 bg-brand-cream text-slate-800';

  return (
    <div className={`rounded-xl border p-4 space-y-2.5 ${toneClasses}`}>
      {heading && (
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
          <BookOpen className="h-4 w-4 text-brand-gold" />
          <span>{heading}</span>
        </div>
      )}
      {chunks.length > 0 ? (
        <div className="space-y-2 text-sm leading-relaxed text-slate-700">
          {chunks.map((chunk, idx) =>
            chunk.kind === 'list' ? (
              <ul key={idx} className="list-disc space-y-1 pl-5">
                {chunk.lines.map((line, lineIdx) => (
                  <li key={lineIdx}>{line}</li>
                ))}
              </ul>
            ) : (
              <p key={idx} className="whitespace-pre-line">
                {chunk.lines.join('\n')}
              </p>
            )
          )}
        </div>
      ) : (
        <p className="text-sm italic text-slate-400">No instructions provided.</p>
      )}
    </div>
  );
}

export const richtextBlockDefinition: BlockDefinition = {
  type: 'richtext',
  name: 'Instruction / Passage',
  description: 'Read-only formatted instructions, reading passage, or prompt card.',
  category: 'content',
  icon: 'FileText',
  defaultWidth: 'full',
  defaultProps: {
    heading: 'Instructions',
    content: 'Read the prompt carefully before answering.',
    tone: 'cream'
  },
  propsSchema: RichTextBlockPropsSchema,
  RuntimeComponent: RichTextBlockRuntime
};
