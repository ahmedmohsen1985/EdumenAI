'use client';

import type React from 'react';
import { ChevronDown } from 'lucide-react';
import { z } from 'zod';
import type { TemplateBlock } from '@edumenai/shared';
import type { BlockDefinition, BlockRuntimeContext } from '../types.js';

const DropdownBlockPropsSchema = z
  .object({
    placeholder: z.string().optional(),
    options: z.array(z.string()).default([]),
    helperText: z.string().optional()
  })
  .default({ options: [] });

function DropdownBlockRuntime({
  block,
  ctx
}: {
  block: TemplateBlock;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const fieldKey = block.fieldKey || block.id;
  const parsedProps = DropdownBlockPropsSchema.safeParse(block.props ?? {});
  const props = parsedProps.success ? parsedProps.data : { options: [] as string[] };
  const rawVal = ctx.values[fieldKey];
  const value = typeof rawVal === 'string' ? rawVal : '';
  const error = ctx.errors[fieldKey];

  return (
    <div className="space-y-1.5">
      {block.label && (
        <label htmlFor={block.id} className="block text-sm font-medium text-slate-800">
          {block.label}
          {block.required && <span className="ml-1 text-red-600">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={block.id}
          value={value}
          onChange={(e) => ctx.setValue(fieldKey, e.target.value)}
          disabled={ctx.isSubmitting}
          aria-invalid={Boolean(error)}
          className={`w-full appearance-none rounded-xl border bg-white py-2.5 pl-3.5 pr-10 text-sm text-slate-900 transition focus:outline-none focus:ring-2 ${
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
              : 'border-slate-300 focus:border-brand-navy focus:ring-brand-navy/15'
          } disabled:cursor-not-allowed disabled:bg-slate-50`}
        >
          <option value="">{props.placeholder ?? '-- Select an option --'}</option>
          {props.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </div>
      {props.helperText && !error && (
        <p className="text-xs text-slate-500">{props.helperText}</p>
      )}
      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

export const dropdownBlockDefinition: BlockDefinition = {
  type: 'dropdown',
  name: 'Dropdown Select',
  description: 'Select list with configurable options.',
  category: 'input',
  icon: 'ChevronDown',
  defaultWidth: 'half',
  defaultProps: {
    placeholder: '-- Select an option --',
    options: ['Option A', 'Option B']
  },
  propsSchema: DropdownBlockPropsSchema,
  RuntimeComponent: DropdownBlockRuntime
};
