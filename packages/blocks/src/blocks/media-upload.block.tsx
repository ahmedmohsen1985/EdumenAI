'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  UploadCloud,
  X
} from 'lucide-react';
import { z } from 'zod';
import type { MediaAttachment, TemplateBlock } from '@edumenai/shared';
import type { BlockDefinition, BlockRuntimeContext } from '../types.js';

export const MediaUploadPropsSchema = z
  .object({
    description: z.string().optional(),
    accept: z.array(z.string()).optional(),
    maxSizeMb: z.number().positive().optional(),
    presetImageDataUrl: z.string().optional(),
    presetImageName: z.string().optional(),
    presetImageMimeType: z.string().optional(),
    allowStudentUpload: z.boolean().optional()
  })
  .default({});

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MAX_IMAGE_DIMENSION = 1024;
const JPEG_COMPRESSION_QUALITY = 0.8;
const SMALL_IMAGE_THRESHOLD_BYTES = 120 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const lower = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isMediaAttachment(value: unknown): value is MediaAttachment {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.mimeType === 'string' &&
    typeof record.fileName === 'string' &&
    (record.source === 'preset' || record.source === 'student')
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

async function compressImageToDataUrl(
  file: File
): Promise<{ dataUrl: string; mimeType: string }> {
  if (file.size < SMALL_IMAGE_THRESHOLD_BYTES) {
    const dataUrl = await readFileAsDataUrl(file);
    return {
      dataUrl,
      mimeType: file.type || 'image/jpeg'
    };
  }

  try {
    const rawDataUrl = await readFileAsDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imageEl = new Image();
      imageEl.onload = () => resolve(imageEl);
      imageEl.onerror = () => reject(new Error('Image decode failed.'));
      imageEl.src = rawDataUrl;
    });

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
    );
    const targetWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      return { dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg' };
    }

    context.drawImage(img, 0, 0, targetWidth, targetHeight);
    const compressedUrl = canvas.toDataURL('image/jpeg', JPEG_COMPRESSION_QUALITY);

    if (!compressedUrl.startsWith('data:image/jpeg;base64,')) {
      return { dataUrl: rawDataUrl, mimeType: file.type || 'image/jpeg' };
    }

    return {
      dataUrl: compressedUrl,
      mimeType: 'image/jpeg'
    };
  } catch {
    const fallbackUrl = await readFileAsDataUrl(file);
    return {
      dataUrl: fallbackUrl,
      mimeType: file.type || 'image/jpeg'
    };
  }
}

function MediaUploadBlockRuntime({
  block,
  ctx
}: {
  block: TemplateBlock;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fieldKey = block.fieldKey || block.id;
  const parsedProps = MediaUploadPropsSchema.safeParse(block.props ?? {});
  const props = parsedProps.success ? parsedProps.data : {};

  const maxSizeMb = props.maxSizeMb ?? 10;
  const acceptList = props.accept ?? [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ];
  const presetImageDataUrl = props.presetImageDataUrl?.trim() || '';
  const presetFileName = props.presetImageName?.trim() || 'stimulus.jpg';
  const presetMimeType = props.presetImageMimeType?.trim() || 'image/jpeg';
  const allowStudentUpload = props.allowStudentUpload ?? true;

  const rawValue = ctx.values[fieldKey];
  const currentAttachment = isMediaAttachment(rawValue) ? rawValue : null;
  const fieldError = ctx.errors[fieldKey];

  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!presetImageDataUrl) return;
    if (currentAttachment?.source === 'student') return;

    const alreadySynced =
      currentAttachment?.source === 'preset' &&
      currentAttachment.presetBlockId === block.id &&
      currentAttachment.fileName === presetFileName &&
      currentAttachment.mimeType === presetMimeType;

    if (!alreadySynced) {
      const presetAttachment: MediaAttachment = {
        source: 'preset',
        presetBlockId: block.id,
        fileName: presetFileName,
        mimeType: presetMimeType
      };
      ctx.setValue(fieldKey, presetAttachment);
    }
  }, [
    block.id,
    ctx,
    currentAttachment,
    fieldKey,
    presetFileName,
    presetImageDataUrl,
    presetMimeType
  ]);

  const acceptsImages = acceptList.some(
    (entry) => entry.startsWith('image/') || entry === 'image/*'
  );
  const acceptsPdf = acceptList.some((entry) => entry.includes('pdf'));
  const acceptAttribute = acceptList.join(',');

  const handleFileSelection = async (file: File | null): Promise<void> => {
    setLocalError(null);
    if (!file) return;

    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setLocalError(
        `File exceeds maximum size of ${maxSizeMb} MB (${formatFileSize(file.size)}).`
      );
      return;
    }

    const pdf = isPdfFile(file);
    const img = isImageFile(file);

    if (!pdf && !img) {
      setLocalError('Unsupported file type. Please upload an image or PDF.');
      return;
    }

    if (pdf && !acceptsPdf) {
      setLocalError('PDF uploads are disabled for this stimulus block.');
      return;
    }

    if (img && !acceptsImages) {
      setLocalError('Image uploads are disabled for this stimulus block.');
      return;
    }

    setIsProcessing(true);
    try {
      if (img) {
        const { dataUrl, mimeType } = await compressImageToDataUrl(file);
        const attachment: MediaAttachment = {
          source: 'student',
          dataUrl,
          mimeType,
          fileName: file.name,
          sizeBytes: file.size
        };
        ctx.setValue(fieldKey, attachment);
      } else {
        const dataUrl = await readFileAsDataUrl(file);
        const attachment: MediaAttachment = {
          source: 'student',
          dataUrl,
          mimeType: 'application/pdf',
          fileName: file.name,
          sizeBytes: file.size
        };
        ctx.setValue(fieldKey, attachment);
      }
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Unable to process selected media file.'
      );
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveStudentAttachment = (): void => {
    setLocalError(null);
    if (presetImageDataUrl) {
      ctx.setValue(fieldKey, {
        source: 'preset',
        presetBlockId: block.id,
        fileName: presetFileName,
        mimeType: presetMimeType
      } satisfies MediaAttachment);
    } else {
      ctx.setValue(fieldKey, undefined);
    }
  };

  const showPresetView =
    Boolean(presetImageDataUrl) && currentAttachment?.source !== 'student';
  const showStudentView = currentAttachment?.source === 'student';

  return (
    <div className="space-y-3">
      {block.label && (
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={inputId} className="block text-sm font-medium text-zinc-900">
            {block.label}
            {block.required && <span className="ml-1 text-rose-600">*</span>}
          </label>
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200/80 bg-white/75 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600 backdrop-blur-sm">
            <ImageIcon className="h-3 w-3 text-zinc-500" />
            Direct Visual / PDF Stimulus
          </span>
        </div>
      )}

      {props.description && (
        <p className="text-xs leading-relaxed text-zinc-600">{props.description}</p>
      )}

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={acceptAttribute}
        disabled={ctx.isSubmitting || isProcessing}
        onChange={(e) => {
          void handleFileSelection(e.target.files?.[0] ?? null);
        }}
        className="sr-only"
      />

      {showPresetView && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-md">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Reference Stimulus Attached
            </span>
            {props.allowStudentUpload === true && (
              <button
                type="button"
                disabled={ctx.isSubmitting || isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Replace with your own file
              </button>
            )}
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/70">
            <img
              src={presetImageDataUrl}
              alt={presetFileName}
              className="mx-auto max-h-96 w-auto object-contain"
            />
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">{presetFileName}</p>
        </div>
      )}

      {showStudentView && currentAttachment && (
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/75 p-4 shadow-sm backdrop-blur-md">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 bg-sky-50/90 px-2.5 py-1 text-xs font-medium text-sky-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Attached for AI Examiner
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={ctx.isSubmitting || isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Change
              </button>
              <button
                type="button"
                disabled={ctx.isSubmitting || isProcessing}
                onClick={handleRemoveStudentAttachment}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200/80 bg-rose-50/70 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100/70 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Remove
              </button>
            </div>
          </div>

          {currentAttachment.mimeType === 'application/pdf' ? (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3.5 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-100/80 text-rose-700">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {currentAttachment.fileName}
                </p>
                <p className="text-xs text-zinc-500">
                  PDF Document
                  {typeof currentAttachment.sizeBytes === 'number'
                    ? ` · ${formatFileSize(currentAttachment.sizeBytes)}`
                    : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {currentAttachment.dataUrl && (
                <div className="overflow-hidden rounded-xl border border-zinc-200/70 bg-zinc-50/70">
                  <img
                    src={currentAttachment.dataUrl}
                    alt={currentAttachment.fileName}
                    className="mx-auto max-h-80 w-auto object-contain"
                  />
                </div>
              )}
              <p className="text-[11px] text-zinc-500">
                {currentAttachment.fileName}
                {typeof currentAttachment.sizeBytes === 'number'
                  ? ` · ${formatFileSize(currentAttachment.sizeBytes)}`
                  : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {!showPresetView && !showStudentView && allowStudentUpload && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (!ctx.isSubmitting && !isProcessing) {
              fileInputRef.current?.click();
            }
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !ctx.isSubmitting && !isProcessing) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!ctx.isSubmitting && !isProcessing) {
              setIsDragging(true);
            }
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (!ctx.isSubmitting && !isProcessing) {
              void handleFileSelection(e.dataTransfer.files?.[0] ?? null);
            }
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all duration-200 backdrop-blur-md ${
            isDragging
              ? 'border-sky-400 bg-sky-50/70'
              : 'border-zinc-300/80 bg-white/60 hover:border-zinc-400 hover:bg-white/80'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mb-2.5 h-8 w-8 animate-spin text-zinc-600" />
              <p className="text-sm font-medium text-zinc-800">Preparing media...</p>
            </>
          ) : (
            <>
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white/90 text-zinc-700 shadow-sm">
                <UploadCloud className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-zinc-800">
                Drop an image or PDF here, or click to browse
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Sent directly to the AI Examiner (max {maxSizeMb} MB, no OCR)
              </p>
            </>
          )}
        </div>
      )}

      {!showPresetView && !showStudentView && !allowStudentUpload && (
        <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 px-4 py-3 text-xs text-zinc-500">
          No stimulus media configured for this block.
        </div>
      )}

      {(localError || fieldError) && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50/80 px-3.5 py-2.5 text-xs font-medium text-rose-700 backdrop-blur-md">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{localError || fieldError}</span>
        </div>
      )}
    </div>
  );
}

export const mediaUploadBlockDefinition: BlockDefinition = {
  type: 'media_upload',
  name: 'Media Upload (Image / PDF)',
  description:
    'Attach an image or PDF visual stimulus (no OCR) sent directly to the AI Examiner with the student response.',
  category: 'input',
  icon: 'Image',
  defaultWidth: 'full',
  defaultProps: {
    description:
      'Upload an image or PDF stimulus for the AI Examiner to reference while grading your response.',
    accept: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxSizeMb: 10,
    allowStudentUpload: true
  },
  propsSchema: MediaUploadPropsSchema,
  RuntimeComponent: MediaUploadBlockRuntime
};
