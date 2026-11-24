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
    <div className="glass-panel space-y-3 p-4 transition-all duration-200 hover:bg-white/85">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_4px_10px_-4px_rgba(15,17,21,0.4)]">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold tracking-tight text-zinc-900">
              {block.label || props.reportTitle || 'AI Examiner Evaluation'}
            </h4>
            <p className="text-xs text-zinc-600">
              {props.reportTitle || ctx.exerciseTitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {contentMax !== undefined && (
            <span className="glass-pill">
              Content /{contentMax}
            </span>
          )}
          {languageMax !== undefined && (
            <span className="glass-pill">
              Language /{languageMax}
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-zinc-900 px-2.5 py-1 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
            Total /{totalMarks}
          </span>
        </div>
      </div>

      {activePrompts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-zinc-500">Active Rubrics:</span>
          {activePrompts.map((p) => (
            <span
              key={p.key}
              className="inline-flex items-center gap-1 rounded-md border border-white/80 bg-white/70 px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-900/[0.06] backdrop-blur-md transition-all duration-200 hover:bg-white/95"
            >
              <Sparkles className="h-3 w-3 text-zinc-500" />
              {p.label}
            </span>
          ))}
        </div>
      )}

      {ctx.isSubmitting && (
        <div className="flex items-center gap-2.5 rounded-xl bg-zinc-900 px-4 py-3 text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
          <Loader2 className="h-4 w-4 animate-spin opacity-80" />
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
