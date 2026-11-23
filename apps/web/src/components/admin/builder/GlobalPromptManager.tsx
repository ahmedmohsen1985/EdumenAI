'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  buildMarkingJsonSchema,
  DEFAULT_TASK_EXTRACTION_PROMPT,
  TRANSCRIPTION_JSON_SCHEMA,
  type AiTaskType,
  type MarkingMarksLimits,
  type PromptEntry,
  type TemplateBlock
} from '@edumenai/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileCode2,
  Plus,
  Sparkles,
  Trash2
} from 'lucide-react';

interface GlobalPromptManagerProps {
  promptEntries: PromptEntry[];
  canvasBlocks: TemplateBlock[];
  marksLimits?: Partial<MarkingMarksLimits>;
  onValidationChange?: (error: string | null) => void;
  onChangePrompts: (next: PromptEntry[]) => void;
}

interface StarterPreset {
  key: string;
  label: string;
  taskType: AiTaskType;
  content: string;
  outputSchema: Record<string, unknown> | null;
}

function getStarterPresets(
  marksLimits?: Partial<MarkingMarksLimits>
): ReadonlyArray<StarterPreset> {
  return [
    {
      key: 'task_extraction_prompt',
      label: 'Task Question OCR Prompt',
      taskType: 'vision',
      content: DEFAULT_TASK_EXTRACTION_PROMPT,
      outputSchema: null
    },
    {
      key: 'transcription_prompt',
      label: 'Forensic Handwriting OCR Prompt',
      taskType: 'vision',
      content:
        'Transcribe the student handwriting verbatim character-by-character without autocorrecting spelling or grammar mistakes.',
      outputSchema: TRANSCRIPTION_JSON_SCHEMA as unknown as Record<string, unknown>
    },
    {
      key: 'marking_protocol',
      label: 'Core Marking Protocol',
      taskType: 'evaluation',
      content:
        'Evaluate the student response strictly against the rubric and return structured JSON marks, justifications, error items, content feedback, and corrected version.',
      outputSchema: buildMarkingJsonSchema(marksLimits) as unknown as Record<string, unknown>
    },
    {
      key: 'rubric_and_anchors',
      label: 'Rubric & Band Descriptors',
      taskType: 'evaluation',
      content:
        'Provide band descriptors, mark allocation boundaries, and anchor examples here.',
      outputSchema: null
    }
  ];
}

function getUniqueKey(base: string, existing: readonly PromptEntry[]): string {
  const existingKeys = new Set(existing.map((e) => e.key));
  if (!existingKeys.has(base)) return base;
  let i = 2;
  while (existingKeys.has(`${base}_${i}`)) {
    i += 1;
  }
  return `${base}_${i}`;
}

export function GlobalPromptManager({
  promptEntries,
  canvasBlocks,
  marksLimits,
  onValidationChange,
  onChangePrompts
}: GlobalPromptManagerProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [schemaDrafts, setSchemaDrafts] = useState<Record<number, string>>({});
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);

  const safeSelectedIndex =
    promptEntries.length === 0
      ? -1
      : Math.min(Math.max(selectedIndex, 0), promptEntries.length - 1);

  const selectedEntry =
    safeSelectedIndex >= 0 ? promptEntries[safeSelectedIndex] ?? null : null;

  const starterPresets = useMemo(() => getStarterPresets(marksLimits), [marksLimits]);

  const referencedBlocksByPromptKey = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of canvasBlocks) {
      const name = b.label || b.id;
      if (b.bindings?.promptKey) {
        const list = map.get(b.bindings.promptKey) ?? [];
        list.push(name);
        map.set(b.bindings.promptKey, list);
      }
      for (const pk of b.bindings?.promptKeys ?? []) {
        const list = map.get(pk) ?? [];
        list.push(name);
        map.set(pk, list);
      }
    }
    return map;
  }, [canvasBlocks]);

  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of promptEntries) {
      counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
    }
    return counts;
  }, [promptEntries]);

  const schemaValidationByIndex = useMemo(() => {
    const map = new Map<number, { valid: boolean; error?: string }>();
    promptEntries.forEach((entry, idx) => {
      const draftText =
        schemaDrafts[idx] ??
        (entry.outputSchema ? JSON.stringify(entry.outputSchema, null, 2) : '');
      if (!draftText.trim()) {
        map.set(idx, { valid: true });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(draftText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          map.set(idx, { valid: false, error: 'Output schema must be a JSON object.' });
        } else {
          map.set(idx, { valid: true });
        }
      } catch (err) {
        map.set(idx, {
          valid: false,
          error: err instanceof Error ? err.message : 'Invalid JSON syntax.'
        });
      }
    });
    return map;
  }, [promptEntries, schemaDrafts]);

  const overallValidationError = useMemo((): string | null => {
    for (let idx = 0; idx < promptEntries.length; idx += 1) {
      const entry = promptEntries[idx]!;
      const trimmedKey = entry.key.trim();
      if (!trimmedKey || !/^[a-z0-9_]+$/.test(trimmedKey)) {
        return `Prompt "${entry.label || `#${idx + 1}`}" has an empty or invalid key.`;
      }
      if ((duplicateKeys.get(entry.key) ?? 0) > 1) {
        return `Duplicate prompt key "${entry.key}".`;
      }
      const schemaState = schemaValidationByIndex.get(idx);
      if (schemaState && !schemaState.valid) {
        return `Invalid JSON output schema in "${entry.key}": ${schemaState.error ?? 'Invalid JSON'}`;
      }
    }
    return null;
  }, [duplicateKeys, promptEntries, schemaValidationByIndex]);

  useEffect(() => {
    onValidationChange?.(overallValidationError);
  }, [onValidationChange, overallValidationError]);

  const handleSelect = (idx: number): void => {
    setSelectedIndex(idx);
    setConfirmDeleteIndex(null);
  };

  const handleAddBlank = (): void => {
    const key = getUniqueKey('custom_prompt', promptEntries);
    const created: PromptEntry = {
      key,
      label: 'New Prompt Entry',
      taskType: 'evaluation',
      content: 'Write your system instructions here...',
      outputSchema: null
    };
    const next = [...promptEntries, created];
    onChangePrompts(next);
    setSelectedIndex(next.length - 1);
  };

  const handleAddPreset = (preset: StarterPreset): void => {
    const key = getUniqueKey(preset.key, promptEntries);
    const created: PromptEntry = {
      key,
      label: preset.label,
      taskType: preset.taskType,
      content: preset.content,
      outputSchema: preset.outputSchema
    };
    const next = [...promptEntries, created];
    onChangePrompts(next);
    setSelectedIndex(next.length - 1);
  };

  const handleClone = (entry: PromptEntry): void => {
    const key = getUniqueKey(`${entry.key}_copy`, promptEntries);
    const cloned: PromptEntry = {
      ...entry,
      key,
      label: `${entry.label} (Copy)`
    };
    const next = [...promptEntries, cloned];
    onChangePrompts(next);
    setSelectedIndex(next.length - 1);
  };

  const handleDelete = (idxToRemove: number): void => {
    const next = promptEntries.filter((_, idx) => idx !== idxToRemove);
    setSchemaDrafts((prev) => {
      const remapped: Record<number, string> = {};
      for (const [rawKey, val] of Object.entries(prev)) {
        const idx = Number(rawKey);
        if (idx < idxToRemove) remapped[idx] = val;
        else if (idx > idxToRemove) remapped[idx - 1] = val;
      }
      return remapped;
    });
    onChangePrompts(next);
    setConfirmDeleteIndex(null);
    if (safeSelectedIndex >= next.length) {
      setSelectedIndex(Math.max(0, next.length - 1));
    }
  };

  const updateSelected = (patch: Partial<PromptEntry>): void => {
    if (safeSelectedIndex < 0) return;
    const next = promptEntries.map((p, idx) =>
      idx === safeSelectedIndex ? { ...p, ...patch } : p
    );
    onChangePrompts(next);
  };

  const activeSchemaText =
    safeSelectedIndex >= 0 && selectedEntry
      ? schemaDrafts[safeSelectedIndex] ??
        (selectedEntry.outputSchema
          ? JSON.stringify(selectedEntry.outputSchema, null, 2)
          : '')
      : '';

  const schemaValidation =
    safeSelectedIndex >= 0
      ? schemaValidationByIndex.get(safeSelectedIndex) ?? { valid: true }
      : { valid: true };

  const handleSchemaChange = (rawText: string): void => {
    if (safeSelectedIndex < 0) return;
    setSchemaDrafts((prev) => ({ ...prev, [safeSelectedIndex]: rawText }));

    if (!rawText.trim()) {
      updateSelected({ outputSchema: null });
      return;
    }

    try {
      const parsed: unknown = JSON.parse(rawText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        updateSelected({ outputSchema: parsed as Record<string, unknown> });
      }
    } catch {
      // Keep draft text visible while user finishes typing valid JSON
    }
  };

  const handleLoadDefaultMarkingSchema = (): void => {
    if (safeSelectedIndex < 0) return;
    const schemaObj = buildMarkingJsonSchema(marksLimits) as unknown as Record<string, unknown>;
    const formatted = JSON.stringify(schemaObj, null, 2);
    setSchemaDrafts((prev) => ({ ...prev, [safeSelectedIndex]: formatted }));
    updateSelected({ outputSchema: schemaObj });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Prompt List */}
      <div className="space-y-4 lg:col-span-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-brand-navy">Global Prompts</h2>
              <p className="text-xs text-slate-500">{promptEntries.length} entries</p>
            </div>
            <button
              type="button"
              onClick={handleAddBlank}
              className="inline-flex items-center gap-1 rounded-xl bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy/90"
            >
              <Plus className="h-3.5 w-3.5 text-brand-gold" />
              New Prompt
            </button>
          </div>

          <div className="space-y-2">
            {promptEntries.map((entry, idx) => {
              const isSelected = idx === safeSelectedIndex;
              const refs = referencedBlocksByPromptKey.get(entry.key) ?? [];

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelect(idx)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? 'border-brand-navy bg-brand-cream/50 ring-2 ring-brand-navy/15'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-slate-900">
                      {entry.label || '(Untitled Prompt)'}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                      {entry.taskType}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-slate-500">
                    {entry.key || '(missing key)'}
                  </div>
                  {refs.length > 0 && (
                    <div className="mt-1.5 text-[10px] font-medium text-emerald-700">
                      Bound to: {refs.join(', ')}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Starter Presets */}
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Quick Starter Presets
            </div>
            <div className="flex flex-wrap gap-1.5">
              {starterPresets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => handleAddPreset(preset)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-brand-cream hover:border-brand-gold"
                >
                  <Sparkles className="h-3 w-3 text-brand-gold" />
                  {preset.key}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Prompt Editor */}
      <div className="lg:col-span-8">
        {!selectedEntry ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <FileCode2 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-700">No prompt selected</p>
            <p className="mt-1 text-xs text-slate-500">
              Add a new prompt or select one from the list to edit its instructions and schema.
            </p>
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-brand-navy">
                  {selectedEntry.label || '(Untitled Prompt)'}
                </h3>
                <p className="font-mono text-xs text-slate-500">
                  {selectedEntry.key || '(missing key)'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleClone(selectedEntry)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Clone
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteIndex(safeSelectedIndex)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>

            {confirmDeleteIndex === safeSelectedIndex && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900 space-y-2">
                <div className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <p>Delete prompt &quot;{selectedEntry.key || selectedEntry.label}&quot;?</p>
                    {(referencedBlocksByPromptKey.get(selectedEntry.key)?.length ?? 0) > 0 && (
                      <p className="mt-1 font-normal text-red-800">
                        Warning: This prompt is currently referenced by canvas blocks:{' '}
                        <strong>
                          {referencedBlocksByPromptKey.get(selectedEntry.key)?.join(', ')}
                        </strong>
                        .
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleDelete(safeSelectedIndex)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteIndex(null)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Key *</label>
                <input
                  type="text"
                  value={selectedEntry.key}
                  onChange={(e) =>
                    updateSelected({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
                />
                {!selectedEntry.key.trim() ? (
                  <p className="text-[11px] font-medium text-red-600">
                    Key is required (a-z, 0-9, _).
                  </p>
                ) : (duplicateKeys.get(selectedEntry.key) ?? 0) > 1 ? (
                  <p className="text-[11px] font-medium text-red-600">
                    Key must be unique across prompts.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">Label *</label>
                <input
                  type="text"
                  value={selectedEntry.label}
                  onChange={(e) => updateSelected({ label: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-brand-navy focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">AI Task Type</label>
                <select
                  value={selectedEntry.taskType}
                  onChange={(e) => updateSelected({ taskType: e.target.value as AiTaskType })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900"
                >
                  <option value="vision">vision (OCR / Image / PDF)</option>
                  <option value="evaluation">evaluation (Marking / Rubric)</option>
                  <option value="audio">audio (Whisper / Speech)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                Description (optional)
              </label>
              <input
                type="text"
                value={selectedEntry.description ?? ''}
                onChange={(e) =>
                  updateSelected({ description: e.target.value || undefined })
                }
                placeholder="Brief note about when this prompt runs..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">
                  Prompt Content (Verbatim System Instructions) *
                </label>
                <span className="text-[11px] text-slate-400">
                  {selectedEntry.content.length} chars
                </span>
              </div>
              <textarea
                rows={11}
                value={selectedEntry.content}
                onChange={(e) => updateSelected({ content: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs leading-relaxed text-slate-900 focus:border-brand-navy focus:outline-none"
              />
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Structured Output JSON Schema (optional)
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadDefaultMarkingSchema}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-brand-cream"
                  >
                    Load Default Marking Schema
                  </button>
                  {schemaValidation.valid ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Valid JSON
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-red-600">
                      {schemaValidation.error}
                    </span>
                  )}
                </div>
              </div>

              <textarea
                rows={6}
                value={activeSchemaText}
                onChange={(e) => handleSchemaChange(e.target.value)}
                placeholder="Leave blank for plain text output, or paste a JSON Schema object..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-800 focus:border-brand-navy focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
