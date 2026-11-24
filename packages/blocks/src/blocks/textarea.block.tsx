'use client';

import type React from 'react';
import { z } from 'zod';
import type { TemplateBlock } from '@edumenai/shared';
import type { BlockDefinition, BlockRuntimeContext } from '../types.js';

const TextareaBlockPropsSchema = z
  .object({
    placeholder: z.string().optional(),
    rows: z.number().int().min(2).max(30).optional(),
    readOnly: z.boolean().optional(),
    helperText: z.string().optional(),
    showWordCount: z.boolean().optional()
  })
  .default({});

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

function TextareaBlockRuntime({
  block,
  ctx
}: {
  block: TemplateBlock;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const fieldKey = block.fieldKey || block.id;
  const parsedProps = TextareaBlockPropsSchema.safeParse(block.props ?? {});
  const props = parsedProps.success ? parsedProps.data : {};
  const rawVal = ctx.values[fieldKey];
  const value = typeof rawVal === 'string' ? rawVal : '';
  const error = ctx.errors[fieldKey];
  const wordCount = countWords(value);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        {block.label ? (
          <label htmlFor={block.id} className="block text-sm font-medium text-zinc-900">
            {block.label}
            {block.required && <span className="ml-1 text-rose-600">*</span>}
          </label>
        ) : (
          <span />
        )}
        {props.showWordCount && (
          <span className="glass-pill font-medium text-zinc-600 transition-all duration-200">
            {wordCount} {wordCount === 1 ? 'word' : 'words'}
          </span>
        )}
      </div>
      <textarea
        id={block.id}
        rows={props.rows ?? 5}
        value={value}
        readOnly={Boolean(props.readOnly)}
        onChange={(e) => ctx.setValue(fieldKey, e.target.value)}
        placeholder={props.placeholder ?? ''}
        disabled={ctx.isSubmitting}
        aria-invalid={Boolean(error)}
        className={`glass-input leading-relaxed hover:bg-white/90 ${
          error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/15' : ''
        } ${props.readOnly ? 'bg-zinc-50/70 text-zinc-700' : ''}`}
      />
      {props.helperText && !error && (
        <p className="text-xs text-zinc-500">{props.helperText}</p>
      )}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

export const textareaBlockDefinition: BlockDefinition = {
  type: 'textarea',
  name: 'Long Text Area',
  description: 'Multi-line essay or response input with optional word count.',
  category: 'input',
  icon: 'AlignLeft',
  defaultWidth: 'full',
  defaultProps: {
    placeholder: 'Write your response here...',
    rows: 6,
    showWordCount: true
  },
  propsSchema: TextareaBlockPropsSchema,
  RuntimeComponent: TextareaBlockRuntime
};
