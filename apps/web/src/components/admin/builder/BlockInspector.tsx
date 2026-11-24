'use client';

import React, { useMemo } from 'react';
import type { PromptEntry, TelegramTargetView, TemplateBlock } from '@edumenai/shared';
import { Settings2, Wand2 } from 'lucide-react';

interface BlockInspectorProps {
  block: TemplateBlock | null;
  allBlocks: TemplateBlock[];
  promptEntries: PromptEntry[];
  telegramTargets: TelegramTargetView[];
  onChangeBlock: (updated: TemplateBlock) => void;
}

const FIELD_MAP_KEYS: ReadonlyArray<{
  key: 'studentName' | 'studentClass' | 'studentSchool' | 'studentTelegram' | 'taskPrompt' | 'studentText';
  label: string;
}> = [
  { key: 'studentName', label: 'Student Name' },
  { key: 'studentClass', label: 'Student Class' },
  { key: 'studentSchool', label: 'Student School' },
  { key: 'studentTelegram', label: 'Student Telegram' },
  { key: 'taskPrompt', label: 'Task Prompt / Question' },
  { key: 'studentText', label: 'Student Response / Article' }
];

export function inferInputFieldMapFromCanvas(
  blocks: readonly TemplateBlock[]
): Record<string, string> {
  const keys = blocks
    .map((b) => b.fieldKey)
    .filter((k): k is string => typeof k === 'string' && k.length > 0);

  const pick = (candidates: string[]): string | undefined =>
    candidates.find((c) => keys.includes(c));

  const map: Record<string, string> = {};
  const studentName = pick(['student_name', 'name', 'full_name']);
  const studentClass = pick(['student_class', 'class_name', 'class']);
  const studentSchool = pick(['student_school', 'school']);
  const studentTelegram = pick(['student_telegram', 'telegram']);
  const taskPrompt = pick(['task_question', 'task_prompt', 'prompt']);
  const studentText = pick(['student_article', 'student_response', 'final_text']);

  if (studentName) map.studentName = studentName;
  if (studentClass) map.studentClass = studentClass;
  if (studentSchool) map.studentSchool = studentSchool;
  if (studentTelegram) map.studentTelegram = studentTelegram;
  if (taskPrompt) map.taskPrompt = taskPrompt;
  if (studentText) map.studentText = studentText;

  return map;
}

export function BlockInspector({
  block,
  allBlocks,
  promptEntries,
  telegramTargets,
  onChangeBlock
}: BlockInspectorProps): React.ReactElement {
  const existingSections = useMemo(() => {
    const set = new Set<string>();
    for (const b of allBlocks) {
      if (b.section?.trim()) set.add(b.section.trim());
    }
    return Array.from(set);
  }, [allBlocks]);

  const canvasFieldKeys = useMemo(
    () =>
      allBlocks
        .filter((b) => typeof b.fieldKey === 'string' && b.fieldKey.trim().length > 0)
        .map((b) => ({
          fieldKey: b.fieldKey as string,
          label: b.label || b.fieldKey || b.id
        })),
    [allBlocks]
  );

  const evaluationBlocks = useMemo(
    () => allBlocks.filter((b) => b.type === 'examiner_evaluation'),
    [allBlocks]
  );

  if (!block) {
    return (
      <aside className="glass-panel rounded-2xl p-6 text-center">
        <Settings2 className="mx-auto h-8 w-8 text-zinc-300" />
        <h3 className="mt-2 text-sm font-bold tracking-tight text-zinc-800">Block Inspector</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Select a block on the canvas to edit its label, field key, props, and AI prompt bindings.
        </p>
      </aside>
    );
  }

  const updateProp = (key: string, value: unknown): void => {
    onChangeBlock({
      ...block,
      props: {
        ...block.props,
        [key]: value
      }
    });
  };

  const updateBinding = (key: string, value: unknown): void => {
    onChangeBlock({
      ...block,
      bindings: {
        ...(block.bindings ?? {}),
        [key]: value
      }
    });
  };

  const fieldKeyInvalid =
    block.fieldKey !== undefined &&
    block.fieldKey !== '' &&
    !/^[a-z0-9_]+$/.test(block.fieldKey);

  const strProp = (key: string): string =>
    typeof block.props?.[key] === 'string' ? String(block.props[key]) : '';

  const numProp = (key: string, fallback: string): string =>
    typeof block.props?.[key] === 'number' ? String(block.props[key]) : fallback;

  const boolProp = (key: string, fallback = false): boolean =>
    typeof block.props?.[key] === 'boolean' ? Boolean(block.props[key]) : fallback;

  const isFieldKeyBlock = !['richtext', 'examiner_evaluation', 'action_button'].includes(
    block.type
  );

  const sectionListId = `sections-${block.id}`;

  return (
    <aside className="glass-panel space-y-5 rounded-2xl p-4">
      <div className="border-b border-zinc-200/70 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-tight text-zinc-900">Block Inspector</h2>
          <span className="rounded-md border border-zinc-200/80 bg-white/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-700">
            {block.type}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-zinc-400">id: {block.id}</p>
      </div>

      {/* Universal Properties */}
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-zinc-700">Label</label>
          <input
            type="text"
            value={block.label ?? ''}
            onChange={(e) => onChangeBlock({ ...block, label: e.target.value })}
            className="glass-input w-full !px-3 !py-1.5 !text-sm"
          />
        </div>

        {isFieldKeyBlock && (
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Field Key</label>
            <input
              type="text"
              value={block.fieldKey ?? ''}
              onChange={(e) =>
                onChangeBlock({
                  ...block,
                  fieldKey: e.target.value.toLowerCase() || undefined
                })
              }
              placeholder="e.g. student_name"
              className={`glass-input w-full !px-3 !py-1.5 font-mono !text-xs ${
                fieldKeyInvalid
                  ? '!border-rose-400 focus:!border-rose-500 focus:!ring-rose-500/15'
                  : ''
              }`}
            />
            {fieldKeyInvalid && (
              <p className="text-[11px] font-medium text-rose-600">
                Use only lowercase letters, numbers, and underscores (^[a-z0-9_]+$).
              </p>
            )}
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-zinc-700">Section</label>
          <input
            type="text"
            list={sectionListId}
            value={block.section ?? ''}
            onChange={(e) => onChangeBlock({ ...block, section: e.target.value })}
            placeholder="e.g. Student Identity"
            className="glass-input w-full !px-3 !py-1.5 !text-sm"
          />
          <datalist id={sectionListId}>
            {existingSections.map((sec) => (
              <option key={sec} value={sec} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Width</label>
            <select
              value={block.width}
              onChange={(e) =>
                onChangeBlock({ ...block, width: e.target.value as 'full' | 'half' })
              }
              className="glass-input w-full !px-2.5 !py-1.5 !text-xs font-medium"
            >
              <option value="full">Full Width</option>
              <option value="half">Half Width</option>
            </select>
          </div>

          <div className="flex items-end pb-1">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
              <input
                type="checkbox"
                checked={block.required}
                onChange={(e) => onChangeBlock({ ...block, required: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/20"
              />
              Required
            </label>
          </div>
        </div>
      </div>

      {/* Block-Specific Props & Bindings */}
      {block.type === 'input' && (
        <div className="space-y-3 border-t border-zinc-200/70 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Input Settings
          </h3>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Input Type</label>
            <select
              value={strProp('inputType') || 'text'}
              onChange={(e) => updateProp('inputType', e.target.value)}
              className="glass-input w-full !px-2.5 !py-1.5 !text-xs"
            >
              <option value="text">Text</option>
              <option value="email">Email</option>
              <option value="number">Number</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Placeholder</label>
            <input
              type="text"
              value={strProp('placeholder')}
              onChange={(e) => updateProp('placeholder', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Helper Text</label>
            <input
              type="text"
              value={strProp('helperText')}
              onChange={(e) => updateProp('helperText', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>
        </div>
      )}

      {block.type === 'dropdown' && (
        <div className="space-y-3 border-t border-zinc-200/70 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Dropdown Options
          </h3>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Placeholder</label>
            <input
              type="text"
              value={strProp('placeholder')}
              onChange={(e) => updateProp('placeholder', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">
              Options (one per line)
            </label>
            <textarea
              rows={5}
              value={
                Array.isArray(block.props?.options)
                  ? (block.props.options as unknown[]).map(String).join('\n')
                  : ''
              }
              onChange={(e) =>
                updateProp(
                  'options',
                  e.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                )
              }
              className="glass-input w-full !px-3 !py-2 !text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Helper Text</label>
            <input
              type="text"
              value={strProp('helperText')}
              onChange={(e) => updateProp('helperText', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>
        </div>
      )}

      {block.type === 'textarea' && (
        <div className="space-y-3 border-t border-zinc-200/70 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Textarea Settings
          </h3>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Placeholder</label>
            <input
              type="text"
              value={strProp('placeholder')}
              onChange={(e) => updateProp('placeholder', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-700">Rows</label>
              <input
                type="number"
                min={2}
                max={30}
                value={numProp('rows', '5')}
                onChange={(e) => updateProp('rows', Number(e.target.value) || 5)}
                className="glass-input w-full !px-3 !py-1.5 !text-xs"
              />
            </div>
            <div className="space-y-2 pt-4">
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={boolProp('showWordCount')}
                  onChange={(e) => updateProp('showWordCount', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                />
                Word Count
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                <input
                  type="checkbox"
                  checked={boolProp('readOnly')}
                  onChange={(e) => updateProp('readOnly', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                />
                Read Only
              </label>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Helper Text</label>
            <input
              type="text"
              value={strProp('helperText')}
              onChange={(e) => updateProp('helperText', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>
        </div>
      )}

      {block.type === 'richtext' && (
        <div className="space-y-3 border-t border-zinc-200/70 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Content Card
          </h3>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Heading</label>
            <input
              type="text"
              value={strProp('heading')}
              onChange={(e) => updateProp('heading', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Tone</label>
            <select
              value={strProp('tone') || 'cream'}
              onChange={(e) => updateProp('tone', e.target.value)}
              className="glass-input w-full !px-2.5 !py-1.5 !text-xs"
            >
              <option value="cream">Soft Silver</option>
              <option value="neutral">Neutral Slate</option>
              <option value="info">Info Blue</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Content</label>
            <textarea
              rows={5}
              value={strProp('content')}
              onChange={(e) => updateProp('content', e.target.value)}
              className="glass-input w-full !px-3 !py-2 !text-xs"
            />
          </div>
        </div>
      )}

      {block.type === 'file_upload_ocr' && (
        <div className="space-y-3 border-t border-zinc-200/70 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            OCR Upload Settings
          </h3>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">
              Bound OCR Prompt
            </label>
            <select
              value={block.bindings?.promptKey ?? ''}
              onChange={(e) => updateBinding('promptKey', e.target.value || undefined)}
              className="glass-input w-full !px-2.5 !py-1.5 !text-xs font-medium"
            >
              <option value="">-- Select a Prompt Entry --</option>
              {promptEntries.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} ({p.key})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Description</label>
            <textarea
              rows={2}
              value={strProp('description')}
              onChange={(e) => updateProp('description', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-700">Button Label</label>
              <input
                type="text"
                value={strProp('extractButtonLabel')}
                onChange={(e) => updateProp('extractButtonLabel', e.target.value)}
                className="glass-input w-full !px-3 !py-1.5 !text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-700">Max Size (MB)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={numProp('maxSizeMb', '15')}
                onChange={(e) => updateProp('maxSizeMb', Number(e.target.value) || 15)}
                className="glass-input w-full !px-3 !py-1.5 !text-xs"
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={boolProp('locked')}
                onChange={(e) => updateProp('locked', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
              />
              Locked Verbatim Mode (disable editing after OCR)
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={boolProp('allowManualEdit', !boolProp('locked'))}
                onChange={(e) => updateProp('allowManualEdit', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
              />
              Allow Manual Edit / Text Entry
            </label>
          </div>

          {boolProp('locked') && (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-700">Locked Notice</label>
              <textarea
                rows={2}
                value={strProp('lockedNotice')}
                onChange={(e) => updateProp('lockedNotice', e.target.value)}
                className="glass-input w-full !px-3 !py-1.5 !text-xs"
              />
            </div>
          )}
        </div>
      )}

      {block.type === 'examiner_evaluation' && (
        <div className="space-y-4 border-t border-zinc-200/70 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Examiner Configuration
          </h3>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Report Title</label>
            <input
              type="text"
              value={strProp('reportTitle')}
              onChange={(e) => updateProp('reportTitle', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-zinc-700">Total</label>
              <input
                type="number"
                min={1}
                value={numProp('totalMarks', '23')}
                onChange={(e) => updateProp('totalMarks', Number(e.target.value) || 23)}
                className="glass-input w-full !px-2.5 !py-1.5 !text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-zinc-700">Content</label>
              <input
                type="number"
                min={1}
                value={numProp('contentMax', '8')}
                onChange={(e) => updateProp('contentMax', Number(e.target.value) || 8)}
                className="glass-input w-full !px-2.5 !py-1.5 !text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-semibold text-zinc-700">Language</label>
              <input
                type="number"
                min={1}
                value={numProp('languageMax', '15')}
                onChange={(e) => updateProp('languageMax', Number(e.target.value) || 15)}
                className="glass-input w-full !px-2.5 !py-1.5 !text-xs"
              />
            </div>
          </div>

          {/* Prompt Keys Multi-Select */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700">
              Bound Evaluation Prompts
            </label>
            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-white/80 bg-white/60 p-2.5 backdrop-blur-sm">
              {promptEntries.length === 0 ? (
                <p className="text-[11px] text-zinc-400">No prompt entries defined yet.</p>
              ) : (
                promptEntries.map((entry) => {
                  const current = block.bindings?.promptKeys ?? [];
                  const checked = current.includes(entry.key);
                  return (
                    <label
                      key={entry.key}
                      className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...current, entry.key]
                            : current.filter((k) => k !== entry.key);
                          updateBinding('promptKeys', next);
                        }}
                        className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                      />
                      <span className="truncate font-medium">{entry.label}</span>
                      <span className="ml-auto font-mono text-[10px] text-zinc-400">
                        {entry.taskType}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Input Field Map */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700">Input Field Mapping</label>
              <button
                type="button"
                onClick={() =>
                  updateBinding('inputFieldMap', inferInputFieldMapFromCanvas(allBlocks))
                }
                className="glass-btn-secondary !inline-flex !items-center !gap-1 !rounded-lg !px-2.5 !py-1 !text-[11px]"
              >
                <Wand2 className="h-3 w-3" />
                Auto-Wire from Canvas
              </button>
            </div>
            <div className="space-y-2 rounded-xl border border-white/80 bg-white/60 p-2.5 backdrop-blur-sm">
              {FIELD_MAP_KEYS.map((item) => {
                const map = block.bindings?.inputFieldMap ?? {};
                return (
                  <div key={item.key} className="grid grid-cols-2 items-center gap-2">
                    <span className="truncate text-[11px] font-medium text-zinc-600">
                      {item.label}
                    </span>
                    <select
                      value={map[item.key] ?? ''}
                      onChange={(e) => {
                        const nextMap = { ...map };
                        if (e.target.value) {
                          nextMap[item.key] = e.target.value;
                        } else {
                          delete nextMap[item.key];
                        }
                        updateBinding('inputFieldMap', nextMap);
                      }}
                      className="glass-input !rounded-lg !px-2 !py-1 !text-[11px]"
                    >
                      <option value="">(Auto fallback)</option>
                      {canvasFieldKeys.map((fk) => (
                        <option key={fk.fieldKey} value={fk.fieldKey}>
                          {fk.fieldKey}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delivery & Telegram Targets */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={block.bindings?.enablePdfDownload ?? true}
                onChange={(e) => updateBinding('enablePdfDownload', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
              />
              Enable PDF Download
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
              <input
                type="checkbox"
                checked={block.bindings?.enableTelegramSend ?? true}
                onChange={(e) => updateBinding('enableTelegramSend', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
              />
              Enable Telegram Dispatch
            </label>

            {telegramTargets.length > 0 && (
              <div className="space-y-1 pt-1">
                <label className="block text-xs font-semibold text-zinc-700">
                  Target Telegram Groups
                </label>
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-xl border border-white/80 bg-white/60 p-2 backdrop-blur-sm">
                  {telegramTargets.map((target) => {
                    const selectedIds = block.bindings?.telegramTargetIds ?? [];
                    const checked = selectedIds.includes(target.id);
                    return (
                      <label
                        key={target.id}
                        className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedIds, target.id]
                              : selectedIds.filter((id) => id !== target.id);
                            updateBinding('telegramTargetIds', next);
                          }}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                        />
                        <span className="truncate">{target.name}</span>
                        {target.isDefault && (
                          <span className="ml-auto text-[10px] font-semibold text-emerald-700">
                            Default
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {block.type === 'action_button' && (
        <div className="space-y-3 border-t border-zinc-200/70 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Action Button Settings
          </h3>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Button Variant</label>
            <select
              value={strProp('variant') || 'primary'}
              onChange={(e) => updateProp('variant', e.target.value)}
              className="glass-input w-full !px-2.5 !py-1.5 !text-xs"
            >
              <option value="primary">Primary (Graphite)</option>
              <option value="secondary">Secondary (Outline)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">Loading Label</label>
            <input
              type="text"
              value={strProp('loadingLabel')}
              onChange={(e) => updateProp('loadingLabel', e.target.value)}
              className="glass-input w-full !px-3 !py-1.5 !text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-700">
              Target Examiner Block
            </label>
            <select
              value={block.bindings?.targetActionBlockId ?? ''}
              onChange={(e) =>
                updateBinding('targetActionBlockId', e.target.value || undefined)
              }
              className="glass-input w-full !px-2.5 !py-1.5 !text-xs"
            >
              <option value="">(First Examiner block on canvas)</option>
              {evaluationBlocks.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label || ev.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </aside>
  );
}
