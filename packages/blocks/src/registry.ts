'use client';

import type { BlockDefinition } from './types.js';
import { inputBlockDefinition } from './blocks/input.block.js';
import { dropdownBlockDefinition } from './blocks/dropdown.block.js';
import { textareaBlockDefinition } from './blocks/textarea.block.js';
import { richtextBlockDefinition } from './blocks/richtext.block.js';
import { fileUploadOcrBlockDefinition } from './blocks/file-upload-ocr.block.js';
import { mediaUploadBlockDefinition } from './blocks/media-upload.block.js';
import { examinerEvaluationBlockDefinition } from './blocks/examiner-evaluation.block.js';
import { actionButtonBlockDefinition } from './blocks/action-button.block.js';

const blockRegistry = new Map<string, BlockDefinition>();

export function registerBlock(definition: BlockDefinition): void {
  blockRegistry.set(definition.type, definition);
}

export function getBlock(type: string): BlockDefinition | undefined {
  return blockRegistry.get(type);
}

export function listBlocks(): BlockDefinition[] {
  return Array.from(blockRegistry.values());
}

export function hasBlock(type: string): boolean {
  return blockRegistry.has(type);
}

export function registerBuiltInBlocks(): void {
  const builtIns: readonly BlockDefinition[] = [
    inputBlockDefinition,
    dropdownBlockDefinition,
    textareaBlockDefinition,
    richtextBlockDefinition,
    fileUploadOcrBlockDefinition,
    mediaUploadBlockDefinition,
    examinerEvaluationBlockDefinition,
    actionButtonBlockDefinition
  ];

  for (const def of builtIns) {
    if (!blockRegistry.has(def.type)) {
      blockRegistry.set(def.type, def);
    }
  }
}
