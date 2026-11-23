'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  FileText,
  Image as ImageIcon,
  Loader2,
  Lock,
  RefreshCw,
  ScanText,
  UploadCloud,
  X
} from 'lucide-react';
import { z } from 'zod';
import type { TemplateBlock } from '@edumenai/shared';
import type { BlockDefinition, BlockRuntimeContext } from '../types.js';

const FileUploadOcrPropsSchema = z
  .object({
    description: z.string().optional(),
    accept: z.array(z.string()).optional(),
    maxSizeMb: z.number().positive().optional(),
    locked: z.boolean().optional(),
    allowManualEdit: z.boolean().optional(),
    extractButtonLabel: z.string().optional(),
    lockedNotice: z.string().optional()
  })
  .default({});

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
}

function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  );
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const lower = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function FileUploadOcrBlockRuntime({
  block,
  ctx
}: {
  block: TemplateBlock;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fieldKey = block.fieldKey || block.id;
  const parsedProps = FileUploadOcrPropsSchema.safeParse(block.props ?? {});
  const props = parsedProps.success ? parsedProps.data : {};

  const maxSizeMb = props.maxSizeMb ?? 15;
  const isLocked = Boolean(props.locked);
  const allowManualEdit = props.allowManualEdit ?? !isLocked;
  const promptKey = block.bindings?.promptKey ?? '';

  const rawValue = ctx.values[fieldKey];
  const extractedText = typeof rawValue === 'string' ? rawValue : '';
  const fieldError = ctx.errors[fieldKey];

  const [activeTab, setActiveTab] = useState<'image' | 'pdf'>('image');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);

  useEffect(() => {
    if (!selectedFile || !isImageFile(selectedFile)) {
      setPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const acceptAttribute =
    activeTab === 'pdf'
      ? '.pdf,application/pdf'
      : 'image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif';

  const handleFileSelection = (file: File | null): void => {
    setLocalError(null);
    if (!file) return;

    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setLocalError(`File exceeds maximum size of ${maxSizeMb} MB (${formatFileSize(file.size)}).`);
      return;
    }

    const pdf = isPdfFile(file);
    const img = isImageFile(file);
    if (!pdf && !img) {
      setLocalError('Unsupported file type. Please upload an image (JPG, PNG, WEBP) or PDF.');
      return;
    }

    if (pdf && activeTab !== 'pdf') {
      setActiveTab('pdf');
    } else if (img && activeTab !== 'image') {
      setActiveTab('image');
    }

    setSelectedFile(file);
    setManualEntryOpen(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (ctx.isSubmitting || isExtracting) return;
    const dropped = e.dataTransfer.files?.[0] ?? null;
    handleFileSelection(dropped);
  };

  const handleClearFile = (): void => {
    setSelectedFile(null);
    setLocalError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExtractClick = async (): Promise<void> => {
    if (!selectedFile || isExtracting || ctx.isSubmitting) return;
    setLocalError(null);
    setIsExtracting(true);

    try {
      const result = await ctx.onRunOcr({
        file: selectedFile,
        promptKey,
        fieldKey,
        block
      });
      ctx.setValue(fieldKey, result.text);
      if (result.transcriptionMeta) {
        ctx.setMeta(fieldKey, result.transcriptionMeta);
      }
      setIsEditingText(false);
      setManualEntryOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OCR extraction failed. Please try again.';
      setLocalError(message);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleResetExtracted = (): void => {
    ctx.setValue(fieldKey, '');
    ctx.setMeta(fieldKey, undefined);
    setIsEditingText(false);
    setManualEntryOpen(false);
    handleClearFile();
  };

  const hasExtractedText = extractedText.trim().length > 0;
  const wordCount = countWords(extractedText);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {block.label && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-semibold text-slate-900">
              {block.label}
              {block.required && <span className="ml-1 text-red-600">*</span>}
            </label>
            {isLocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                <Lock className="h-3 w-3" />
                Locked OCR Mode
              </span>
            )}
          </div>
        )}
        {props.description && <p className="text-xs text-slate-500">{props.description}</p>}
      </div>

      {/* Extracted Result Display */}
      {hasExtractedText && !manualEntryOpen && (
        <div
          className={`rounded-xl border p-4 space-y-3 ${
            isLocked
              ? 'border-emerald-200 bg-emerald-50/50'
              : 'border-slate-200 bg-slate-50/70'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isLocked ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <Lock className="h-3.5 w-3.5" />
                  Extracted from Handwriting
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy/10 px-3 py-1 text-xs font-semibold text-brand-navy">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Extracted Content
                </span>
              )}
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
                {wordCount} {wordCount === 1 ? 'word' : 'words'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!isLocked && allowManualEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditingText((prev) => !prev)}
                  disabled={ctx.isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  {isEditingText ? 'Save Changes' : 'Edit Question'}
                </button>
              )}
              <button
                type="button"
                onClick={handleResetExtracted}
                disabled={ctx.isSubmitting || isExtracting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {isLocked ? 'Re-upload Handwriting' : 'Change Question'}
              </button>
            </div>
          </div>

          {isLocked ? (
            <>
              <textarea
                value={extractedText}
                readOnly
                spellCheck={false}
                rows={8}
                aria-label={block.label || 'Verbatim OCR transcription'}
                className="w-full cursor-default resize-y rounded-xl border border-emerald-200 bg-white px-4 py-3 font-sans text-sm leading-relaxed text-slate-900 focus:outline-none"
              />
              {props.lockedNotice && (
                <p className="flex items-start gap-1.5 text-xs text-emerald-800">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{props.lockedNotice}</span>
                </p>
              )}
            </>
          ) : isEditingText ? (
            <textarea
              value={extractedText}
              onChange={(e) => ctx.setValue(fieldKey, e.target.value)}
              rows={6}
              disabled={ctx.isSubmitting}
              className="w-full rounded-xl border border-brand-navy/30 bg-white px-4 py-3 text-sm leading-relaxed text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
            />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 whitespace-pre-line">
              {extractedText}
            </div>
          )}
        </div>
      )}

      {/* Manual Entry Mode (only when unlocked & allowed) */}
      {!isLocked && allowManualEdit && manualEntryOpen && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Manual Text Entry</span>
            <button
              type="button"
              onClick={() => setManualEntryOpen(false)}
              className="text-xs font-medium text-brand-navy hover:underline"
            >
              Switch back to file upload
            </button>
          </div>
          <textarea
            value={extractedText}
            onChange={(e) => ctx.setValue(fieldKey, e.target.value)}
            rows={5}
            placeholder="Paste or type the exam task question here..."
            disabled={ctx.isSubmitting}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
          />
        </div>
      )}

      {/* Upload & Extraction UI (shown when not yet populated or user clicked Change/Re-upload) */}
      {!hasExtractedText && !manualEntryOpen && (
        <div className="space-y-3">
          {/* Tabs: Upload Image | Upload PDF */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'image'
                  ? 'bg-white text-brand-navy shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pdf')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'pdf'
                  ? 'bg-white text-brand-navy shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Upload PDF
            </button>
          </div>

          {/* Dropzone or Selected File Preview */}
          {!selectedFile ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
                isDragging
                  ? 'border-brand-gold bg-brand-cream'
                  : fieldError
                    ? 'border-red-300 bg-red-50/40 hover:border-red-400'
                    : 'border-slate-300 bg-slate-50/60 hover:border-brand-navy/50 hover:bg-slate-50'
              }`}
            >
              <UploadCloud className="mb-2.5 h-8 w-8 text-brand-navy/70" />
              <p className="text-sm font-medium text-slate-800">
                {activeTab === 'pdf'
                  ? 'Drag & drop a PDF document here, or click to browse'
                  : 'Drag & drop a clear photo here, or click to browse'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {activeTab === 'pdf' ? 'PDF documents' : 'JPG, PNG, WEBP, HEIC'} up to {maxSizeMb} MB
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={selectedFile.name}
                      className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-cover bg-white"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy">
                      <FileText className="h-6 w-6" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(selectedFile.size)} · {isPdfFile(selectedFile) ? 'PDF Document' : 'Image'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearFile}
                  disabled={isExtracting || ctx.isSubmitting}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Remove
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleExtractClick()}
                disabled={isExtracting || ctx.isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
                    <span>Running AI OCR Extraction...</span>
                  </>
                ) : (
                  <>
                    <ScanText className="h-4 w-4 text-brand-gold" />
                    <span>{props.extractButtonLabel || 'Extract Text'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={acceptAttribute}
            onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null)}
            className="sr-only"
          />

          {!isLocked && allowManualEdit && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setManualEntryOpen(true)}
                className="text-xs font-medium text-brand-navy hover:underline"
              >
                Or type / paste question manually
              </button>
            </div>
          )}
        </div>
      )}

      {(localError || fieldError) && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{localError || fieldError}</span>
        </div>
      )}
    </div>
  );
}

export const fileUploadOcrBlockDefinition: BlockDefinition = {
  type: 'file_upload_ocr',
  name: 'File Upload + AI OCR',
  description: 'Image or PDF upload with AI OCR extraction and optional verbatim lock.',
  category: 'ai',
  icon: 'ScanText',
  defaultWidth: 'full',
  defaultProps: {
    description: 'Upload an image or PDF for AI extraction.',
    accept: ['image/*', 'application/pdf'],
    maxSizeMb: 15,
    locked: false,
    allowManualEdit: true,
    extractButtonLabel: 'Extract Text'
  },
  defaultBindings: {
    promptKey: 'transcription_prompt'
  },
  propsSchema: FileUploadOcrPropsSchema,
  RuntimeComponent: FileUploadOcrBlockRuntime
};
