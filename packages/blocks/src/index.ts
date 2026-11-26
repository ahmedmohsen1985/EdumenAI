'use client';

import { registerBuiltInBlocks } from './registry.js';

registerBuiltInBlocks();

export * from './types.js';
export * from './registry.js';
export * from './TemplateRenderer.js';
export { inputBlockDefinition } from './blocks/input.block.js';
export { dropdownBlockDefinition } from './blocks/dropdown.block.js';
export { textareaBlockDefinition } from './blocks/textarea.block.js';
export { richtextBlockDefinition } from './blocks/richtext.block.js';
export { fileUploadOcrBlockDefinition } from './blocks/file-upload-ocr.block.js';
export { mediaUploadBlockDefinition } from './blocks/media-upload.block.js';
export { examinerEvaluationBlockDefinition } from './blocks/examiner-evaluation.block.js';
export { actionButtonBlockDefinition } from './blocks/action-button.block.js';
