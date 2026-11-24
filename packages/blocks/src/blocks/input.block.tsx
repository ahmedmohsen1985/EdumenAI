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
        <label htmlFor={block.id} className="block text-sm font-medium text-zinc-900">
          {block.label}
          {block.required && <span className="ml-1 text-rose-600">*</span>}
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
        className={`glass-input hover:bg-white/90 ${
          error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/15' : ''
        }`}
      />
      {props.helperText && !error && (
        <p className="text-xs text-zinc-500">{props.helperText}</p>
      )}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
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
