'use client';

import type React from 'react';
import { Loader2, Send } from 'lucide-react';
import { z } from 'zod';
import type { TemplateBlock } from '@edumenai/shared';
import type { BlockDefinition, BlockRuntimeContext } from '../types.js';

const ActionButtonPropsSchema = z
  .object({
    variant: z.enum(['primary', 'secondary']).optional(),
    action: z.string().optional(),
    loadingLabel: z.string().optional()
  })
  .default({});

function ActionButtonBlockRuntime({
  block,
  ctx
}: {
  block: TemplateBlock;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const parsedProps = ActionButtonPropsSchema.safeParse(block.props ?? {});
  const props = parsedProps.success ? parsedProps.data : {};
  const variant = props.variant ?? 'primary';
  const label = block.label || 'Get Examiner Feedback';
  const loadingLabel = props.loadingLabel || 'Submitting...';

  const variantClasses =
    variant === 'secondary'
      ? 'border border-brand-navy bg-white text-brand-navy hover:bg-slate-50'
      : 'bg-brand-navy text-white hover:bg-brand-navy/90 shadow-sm';

  return (
    <button
      type="button"
      onClick={() => void ctx.onTriggerAction({ block })}
      disabled={ctx.isSubmitting}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand-navy/30 disabled:cursor-not-allowed disabled:opacity-65 ${variantClasses}`}
    >
      {ctx.isSubmitting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          <Send className="h-4 w-4 text-brand-gold" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

export const actionButtonBlockDefinition: BlockDefinition = {
  type: 'action_button',
  name: 'Submit Action Button',
  description: 'Triggers evaluation or bound action block.',
  category: 'action',
  icon: 'Send',
  defaultWidth: 'full',
  defaultProps: {
    variant: 'primary',
    action: 'run_evaluation',
    loadingLabel: 'AI Examiner Marking Your Article...'
  },
  propsSchema: ActionButtonPropsSchema,
  RuntimeComponent: ActionButtonBlockRuntime
};
