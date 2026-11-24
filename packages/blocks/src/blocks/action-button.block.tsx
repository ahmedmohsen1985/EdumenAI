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
      ? 'glass-btn-secondary'
      : 'glass-btn-primary';

  return (
    <button
      type="button"
      onClick={() => void ctx.onTriggerAction({ block })}
      disabled={ctx.isSubmitting}
      className={`${variantClasses} w-full px-6 py-3.5`}
    >
      {ctx.isSubmitting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin opacity-80" />
          <span>{loadingLabel}</span>
        </>
      ) : (
        <>
          <Send className="h-4 w-4 opacity-80" />
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
