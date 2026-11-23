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
          <label htmlFor={block.id} className="block text-sm font-medium text-slate-800">
            {block.label}
            {block.required && <span className="ml-1 text-red-600">*</span>}
          </label>
        ) : (
          <span />
        )}
        {props.showWordCount && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
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
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
            : 'border-slate-300 focus:border-brand-navy focus:ring-brand-navy/15'
        } disabled:cursor-not-allowed disabled:bg-slate-50 ${
          props.readOnly ? 'bg-slate-50 text-slate-700' : ''
        }`}
      />
      {props.helperText && !error && (
        <p className="text-xs text-slate-500">{props.helperText}</p>
      )}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
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
