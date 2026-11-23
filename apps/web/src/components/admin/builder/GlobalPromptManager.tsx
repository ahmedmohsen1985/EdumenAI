'use client';

import React, { useMemo, useState } from 'react';
import {
  EX4_TASK_EXTRACTION_PROMPT,
  MARKING_JSON_SCHEMA,
  TRANSCRIPTION_JSON_SCHEMA,
  type AiTaskType,
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
  onChangePrompts: (next: PromptEntry[]) => void;
}

const STARTER_PRESETS: ReadonlyArray<{
  key: string;
  label: string;
  taskType: AiTaskType;
  content: string;
  outputSchema: Record<string, unknown> | null;
}> = [
  {
    key: 'task_extraction_prompt',
    label: 'Task Question OCR Prompt',
    taskType: 'vision',
    content: EX4_TASK_EXTRACTION_PROMPT,
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
    outputSchema: MARKING_JSON_SCHEMA as unknown as Record<string, unknown>
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
  onChangePrompts
}: GlobalPromptManagerProps): React.ReactElement {
  const [selectedKey, setSelectedKey] = useState<string>(promptEntries[0]?.key ?? '');
  const [schemaDrafts, setSchemaDrafts] = useState<Record<string, string>>({});
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const selectedEntry = useMemo(
    () => promptEntries.find((p) => p.key === selectedKey) ?? promptEntries[0] ?? null,
    [promptEntries, selectedKey]
  );

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

  const handleSelect = (entry: PromptEntry): void => {
    setSelectedKey(entry.key);
    setConfirmDeleteKey(null);
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
    onChangePrompts([...promptEntries, created]);
    setSelectedKey(created.key);
  };

  const handleAddPreset = (preset: (typeof STARTER_PRESETS)[number]): void => {
    const key = getUniqueKey(preset.key, promptEntries);
    const created: PromptEntry = {
      key,
      label: preset.label,
      taskType: preset.taskType,
      content: preset.content,
      outputSchema: preset.outputSchema
    };
    onChangePrompts([...promptEntries, created]);
    setSelectedKey(created.key);
  };

  const handleClone = (entry: PromptEntry): void => {
    const key = getUniqueKey(`${entry.key}_copy`, promptEntries);
    const cloned: PromptEntry = {
      ...entry,
      key,
      label: `${entry.label} (Copy)`
    };
    onChangePrompts([...promptEntries, cloned]);
    setSelectedKey(cloned.key);
  };

  const handleDelete = (key: string): void => {
    const next = promptEntries.filter((p) => p.key !== key);
    onChangePrompts(next);
    setConfirmDeleteKey(null);
    if (selectedKey === key) {
      setSelectedKey(next[0]?.key ?? '');
    }
  };

  const updateSelected = (patch: Partial<PromptEntry>): void => {
    if (!selectedEntry) return;
    const oldKey = selectedEntry.key;
    const next = promptEntries.map((p) => (p.key === oldKey ? { ...p, ...patch } : p));
    onChangePrompts(next);
    if (patch.key && patch.key !== oldKey) {
      setSelectedKey(patch.key);
    }
  };

  const activeSchemaText = selectedEntry
    ? schemaDrafts[selectedEntry.key] ??
      (selectedEntry.outputSchema
        ? JSON.stringify(selectedEntry.outputSchema, null, 2)
        : '')
    : '';

  const schemaValidation = useMemo((): { valid: boolean; error?: string } => {
    if (!activeSchemaText.trim()) return { valid: true };
    try {
      const parsed: unknown = JSON.parse(activeSchemaText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { valid: false, error: 'Output schema must be a JSON object.' };
      }
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : 'Invalid JSON syntax.'
      };
    }
  }, [activeSchemaText]);

  const handleSchemaChange = (rawText: string): void => {
    if (!selectedEntry) return;
    setSchemaDrafts((prev) => ({ ...prev, [selectedEntry.key]: rawText }));

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
    if (!selectedEntry) return;
    const schemaObj = MARKING_JSON_SCHEMA as unknown as Record<string, unknown>;
    const formatted = JSON.stringify(schemaObj, null, 2);
    setSchemaDrafts((prev) => ({ ...prev, [selectedEntry.key]: formatted }));
    updateSelected({ outputSchema: schemaObj });
  };

  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of promptEntries) {
      counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
    }
    return counts;
  }, [promptEntries]);

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
            {promptEntries.map((entry) => {
              const isSelected = selectedEntry?.key === entry.key;
              const refs = referencedBlocksByPromptKey.get(entry.key) ?? [];

              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => handleSelect(entry)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? 'border-brand-navy bg-brand-cream/50 ring-2 ring-brand-navy/15'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold text-slate-900">
                      {entry.label}
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                      {entry.taskType}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-slate-500">
                    {entry.key}
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
              {STARTER_PRESETS.map((preset) => (
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
                <h3 className="text-base font-bold text-brand-navy">{selectedEntry.label}</h3>
                <p className="font-mono text-xs text-slate-500">{selectedEntry.key}</p>
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
                  onClick={() => setConfirmDeleteKey(selectedEntry.key)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>

            {confirmDeleteKey === selectedEntry.key && (
              <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs text-red-900 space-y-2">
                <div className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <p>Delete prompt &quot;{selectedEntry.key}&quot;?</p>
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
                    onClick={() => handleDelete(selectedEntry.key)}
                    className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteKey(null)}
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
                {(duplicateKeys.get(selectedEntry.key) ?? 0) > 1 && (
                  <p className="text-[11px] font-medium text-red-600">
                    Key must be unique across prompts.
                  </p>
                )}
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
                spellCheck={false}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 font-mono text-xs leading-relaxed text-slate-900 focus:border-brand-navy focus:bg-white focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Optional JSON Output Schema
                  </label>
                  {schemaValidation.valid ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" />
                      {activeSchemaText.trim() ? 'Valid JSON' : 'None (Plain Text)'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      {schemaValidation.error}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleLoadDefaultMarkingSchema}
                  className="inline-flex items-center gap-1 rounded-lg border border-brand-gold/50 bg-brand-cream px-2.5 py-1 text-[11px] font-semibold text-brand-navy hover:bg-brand-gold/20"
                >
                  Load Default Marking Schema
                </button>
              </div>

              <textarea
                rows={7}
                value={activeSchemaText}
                onChange={(e) => handleSchemaChange(e.target.value)}
                placeholder="Leave blank for plain text output, or paste a strict JSON Schema object..."
                spellCheck={false}
                className={`w-full rounded-xl border bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:bg-white focus:outline-none ${
                  schemaValidation.valid
                    ? 'border-slate-300 focus:border-brand-navy'
                    : 'border-red-400 focus:border-red-500'
                }`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
