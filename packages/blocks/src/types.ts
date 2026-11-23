import type React from 'react';
import type { z } from 'zod';
import type { AiTaskType, TemplateBlock, TranscriptionMeta } from '@edumenai/shared';

export type BlockFormValues = Record<string, unknown>;
export type BlockFieldErrors = Record<string, string>;

export interface BlockOcrResult {
  text: string;
  transcriptionMeta?: TranscriptionMeta;
  provider?: string;
  model?: string;
}

export type BlockOcrHandler = (params: {
  file: File;
  promptKey: string;
  fieldKey: string;
  block: TemplateBlock;
}) => Promise<BlockOcrResult>;

export type BlockActionHandler = (params: { block: TemplateBlock }) => Promise<void>;

export interface PublicPromptMeta {
  key: string;
  label: string;
  description?: string;
  taskType: AiTaskType;
}

export interface BlockRuntimeContext {
  values: BlockFormValues;
  meta: Record<string, unknown>;
  errors: BlockFieldErrors;
  setValue: (fieldKey: string, value: unknown) => void;
  setMeta: (fieldKey: string, meta: unknown) => void;
  onRunOcr: BlockOcrHandler;
  onTriggerAction: BlockActionHandler;
  isSubmitting: boolean;
  isPreview: boolean;
  exerciseTitle: string;
  totalMarks: number;
  promptMeta: PublicPromptMeta[];
}

export interface BlockDefinition {
  type: string;
  name: string;
  description: string;
  category: 'input' | 'content' | 'ai' | 'action';
  icon: string;
  defaultWidth: 'full' | 'half';
  defaultProps: Record<string, unknown>;
  defaultBindings?: TemplateBlock['bindings'];
  propsSchema: z.ZodTypeAny;
  RuntimeComponent: React.ComponentType<{ block: TemplateBlock; ctx: BlockRuntimeContext }>;
}
