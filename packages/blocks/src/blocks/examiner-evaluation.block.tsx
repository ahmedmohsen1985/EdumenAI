'use client';

import type React from 'react';
import { Award, Loader2, Sparkles } from 'lucide-react';
import { z } from 'zod';
import type { TemplateBlock } from '@edumenai/shared';
import type { BlockDefinition, BlockRuntimeContext } from '../types.js';

const ExaminerEvaluationPropsSchema = z
  .object({
    reportTitle: z.string().optional(),
    totalMarks: z.number().int().positive().optional(),
    contentMax: z.number().int().positive().optional(),
    languageMax: z.number().int().positive().optional()
  })
  .default({});

function ExaminerEvaluationBlockRuntime({
  block,
  ctx
}: {
  block: TemplateBlock;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const parsedProps = ExaminerEvaluationPropsSchema.safeParse(block.props ?? {});
  const props = parsedProps.success ? parsedProps.data : {};

  const totalMarks = props.totalMarks ?? ctx.totalMarks;
  const contentMax = props.contentMax;
  const languageMax = props.languageMax;

  const boundKeys = block.bindings?.promptKeys ?? [];
  const activePrompts =
    boundKeys.length > 0
      ? ctx.promptMeta.filter((p) => boundKeys.includes(p.key))
      : ctx.promptMeta.filter((p) => p.taskType === 'evaluation');

  return (
    <div className="rounded-xl border border-brand-gold/35 bg-brand-cream/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy text-brand-gold">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-brand-navy">
              {block.label || props.reportTitle || 'AI Examiner Evaluation'}
            </h4>
            <p className="text-xs text-slate-600">
              {props.reportTitle || ctx.exerciseTitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {contentMax !== undefined && (
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 border border-slate-200">
              Content /{contentMax}
            </span>
          )}
          {languageMax !== undefined && (
            <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 border border-slate-200">
              Language /{languageMax}
            </span>
          )}
          <span className="rounded-full bg-brand-navy px-2.5 py-1 text-brand-gold">
            Total /{totalMarks}
          </span>
        </div>
      </div>

      {activePrompts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500">Active Rubrics:</span>
          {activePrompts.map((p) => (
            <span
              key={p.key}
              className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-200"
            >
              <Sparkles className="h-3 w-3 text-brand-gold" />
              {p.label}
            </span>
          ))}
        </div>
      )}

      {ctx.isSubmitting && (
        <div className="flex items-center gap-2.5 rounded-xl bg-brand-navy px-4 py-3 text-xs font-semibold text-white">
          <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
          <span>AI Examiner Marking Your Work... Please wait while your full report is generated.</span>
        </div>
      )}
    </div>
  );
}

export const examinerEvaluationBlockDefinition: BlockDefinition = {
  type: 'examiner_evaluation',
  name: 'AI Examiner Evaluation',
  description: 'Displays marking rubric breakdown, bound prompts, and evaluation progress.',
  category: 'ai',
  icon: 'Sparkles',
  defaultWidth: 'full',
  defaultProps: {
    reportTitle: 'EdumenAI Assessment Report',
    totalMarks: 23,
    contentMax: 8,
    languageMax: 15
  },
  defaultBindings: {
    promptKeys: ['marking_protocol', 'rubric_and_anchors'],
    enablePdfDownload: true,
    enableTelegramSend: true
  },
  propsSchema: ExaminerEvaluationPropsSchema,
  RuntimeComponent: ExaminerEvaluationBlockRuntime
};
