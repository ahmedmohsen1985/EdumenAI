'use client';

import type React from 'react';
import { z } from 'zod';
import type { TemplateBlock } from '@edumenai/shared';
import type { BlockDefinition, BlockRuntimeContext } from '../types.js';

const InputBlockPropsSchema = z
  .object({
    placeholder: z.string().optional(),
    inputType: z.enum(['text', 'email', 'number']).optional(),
    helperText: z.string().optional()
  })
  .default({});

function InputBlockRuntime({
  block,
  ctx
}: {
  block: TemplateBlock;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const fieldKey = block.fieldKey || block.id;
  const parsedProps = InputBlockPropsSchema.safeParse(block.props ?? {});
  const props = parsedProps.success ? parsedProps.data : {};
  const rawVal = ctx.values[fieldKey];
  const value = typeof rawVal === 'string' || typeof rawVal === 'number' ? String(rawVal) : '';
  const error = ctx.errors[fieldKey];

  return (
    <div className="space-y-1.5">
      {block.label && (
        <label htmlFor={block.id} className="block text-sm font-medium text-slate-800">
          {block.label}
          {block.required && <span className="ml-1 text-red-600">*</span>}
        </label>
      )}
      <input
        id={block.id}
        type={props.inputType ?? 'text'}
        value={value}
        onChange={(e) => ctx.setValue(fieldKey, e.target.value)}
        placeholder={props.placeholder ?? ''}
        disabled={ctx.isSubmitting}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 ${
          error
            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
            : 'border-slate-300 focus:border-brand-navy focus:ring-brand-navy/15'
        } disabled:cursor-not-allowed disabled:bg-slate-50`}
      />
      {props.helperText && !error && (
        <p className="text-xs text-slate-500">{props.helperText}</p>
      )}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export const inputBlockDefinition: BlockDefinition = {
  type: 'input',
  name: 'Text Input',
  description: 'Single-line text, email, or number field.',
  category: 'input',
  icon: 'Type',
  defaultWidth: 'half',
  defaultProps: {
    placeholder: 'Enter text...'
  },
  propsSchema: InputBlockPropsSchema,
  RuntimeComponent: InputBlockRuntime
};
