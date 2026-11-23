'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { getBlock, type BlockDefinition } from '@edumenai/blocks';
import type {
  ExerciseSkill,
  PromptEntry,
  TelegramTargetView,
  TemplateBlock,
  TemplateConfig
} from '@edumenai/shared';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileCode2,
  Layers,
  Loader2,
  Rocket,
  Save,
  SlidersHorizontal
} from 'lucide-react';
import {
  fetchAdminExercise,
  fetchTelegramTargetsSummary,
  publishAdminExercise,
  saveAdminExerciseDraft,
  type AdminExerciseDetail,
  type AdminPromptVersionView
} from '../../../lib/admin-exercises-api';
import { BlockInspector, inferInputFieldMapFromCanvas } from './BlockInspector';
import { BlockPalette } from './BlockPalette';
import { BuilderCanvas } from './BuilderCanvas';
import { GlobalPromptManager } from './GlobalPromptManager';
import { LivePreviewPane } from './LivePreviewPane';

type BuilderTab = 'canvas' | 'prompts' | 'preview';

function createBlockInstance(
  definition: BlockDefinition,
  existingBlocks: readonly TemplateBlock[]
): TemplateBlock {
  const uniqueSuffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const id = `${definition.type}_${uniqueSuffix}`;

  const defaultFieldKey = !['richtext', 'examiner_evaluation', 'action_button'].includes(
    definition.type
  )
    ? `${definition.type}_${existingBlocks.length + 1}`
    : undefined;

  let bindings = definition.defaultBindings ? { ...definition.defaultBindings } : undefined;

  if (definition.type === 'examiner_evaluation') {
    bindings = {
      ...(bindings ?? {}),
      inputFieldMap: inferInputFieldMapFromCanvas(existingBlocks)
    };
  } else if (definition.type === 'action_button') {
    const evalBlock = existingBlocks.find((b) => b.type === 'examiner_evaluation');
    if (evalBlock) {
      bindings = {
        ...(bindings ?? {}),
        targetActionBlockId: evalBlock.id
      };
    }
  }

  return {
    id,
    type: definition.type,
    ...(defaultFieldKey ? { fieldKey: defaultFieldKey } : {}),
    label: definition.name,
    section:
      definition.category === 'input'
        ? 'Student Input'
        : definition.category === 'ai'
          ? 'AI Processing'
          : definition.category === 'action'
            ? 'Submission'
            : 'Instructions',
    order: existingBlocks.length,
    width: definition.defaultWidth,
    required: false,
    props: { ...definition.defaultProps },
    ...(bindings ? { bindings } : {})
  };
}

function reindexBlocks(blocks: readonly TemplateBlock[]): TemplateBlock[] {
  return blocks.map((b, idx) => ({ ...b, order: idx }));
}

export function ExerciseBuilderWorkspace({ code }: { code: string }): React.ReactElement {
  const [exercise, setExercise] = useState<AdminExerciseDetail | null>(null);
  const [activeVersion, setActiveVersion] = useState<AdminPromptVersionView | null>(null);
  const [telegramTargets, setTelegramTargets] = useState<TelegramTargetView[]>([]);

  // Editable state
  const [title, setTitle] = useState<string>('');
  const [skill, setSkill] = useState<ExerciseSkill>('WRITING');
  const [description, setDescription] = useState<string>('');
  const [totalMarks, setTotalMarks] = useState<number>(23);
  const [templateSchema, setTemplateSchema] = useState<TemplateConfig>({
    schemaVersion: 1,
    settings: {
      showHeaderBadges: true,
      badges: [],
      submitRedirectMode: 'report_page'
    },
    blocks: []
  });
  const [promptEntries, setPromptEntries] = useState<PromptEntry[]>([]);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BuilderTab>('canvas');
  const [showMetaDrawer, setShowMetaDrawer] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const hydrateFromDetail = useCallback(
    (detail: AdminExerciseDetail, preferredVersion?: AdminPromptVersionView) => {
      setExercise(detail);
      setTitle(detail.title);
      setSkill(detail.skill);
      setDescription(detail.description ?? '');
      setTotalMarks(detail.totalMarks);

      const chosen =
        preferredVersion ??
        detail.versions.find((v) => v.status === 'DRAFT') ??
        detail.versions.find((v) => v.status === 'PUBLISHED' && v.isActive) ??
        detail.versions[0] ??
        null;

      setActiveVersion(chosen);
      if (chosen) {
        setTemplateSchema(chosen.templateSchema);
        setPromptEntries(chosen.promptEntries);
        setSelectedBlockId((prev) =>
          chosen.templateSchema.blocks.some((b) => b.id === prev)
            ? prev
            : (chosen.templateSchema.blocks[0]?.id ?? null)
        );
      }
      setIsDirty(false);
    },
    []
  );

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    void Promise.all([
      fetchAdminExercise(code),
      fetchTelegramTargetsSummary().catch(() => [] as TelegramTargetView[])
    ])
      .then(([detail, targets]) => {
        if (cancelled) return;
        hydrateFromDetail(detail);
        setTelegramTargets(targets);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load exercise builder.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code, hydrateFromDetail]);

  const saveDraftInternal = async (): Promise<AdminPromptVersionView | null> => {
    setIsSaving(true);
    setStatusBanner(null);
    try {
      const saved = await saveAdminExerciseDraft(code, {
        title: title.trim() || code,
        skill,
        description: description.trim() || null,
        totalMarks,
        templateSchema: {
          ...templateSchema,
          blocks: reindexBlocks(templateSchema.blocks)
        },
        promptEntries
      });
      hydrateFromDetail(saved.exercise, saved.draftVersion);
      setStatusBanner({
        type: 'success',
        message: `Saved Draft v${saved.draftVersion.version} successfully.`
      });
      return saved.draftVersion;
    } catch (err: unknown) {
      setStatusBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save draft.'
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDraft = async (): Promise<void> => {
    await saveDraftInternal();
  };

  const handleOpenPreview = async (): Promise<void> => {
    if (isDirty) {
      const saved = await saveDraftInternal();
      if (!saved) return;
    }
    setActiveTab('preview');
  };

  const handlePublish = async (): Promise<void> => {
    setIsPublishing(true);
    setStatusBanner(null);
    try {
      let targetVersionId = activeVersion?.id;
      if (isDirty || activeVersion?.status !== 'DRAFT') {
        const saved = await saveDraftInternal();
        if (!saved) {
          setIsPublishing(false);
          return;
        }
        targetVersionId = saved.id;
      }

      const published = await publishAdminExercise(code, targetVersionId);
      hydrateFromDetail(published.exercise, published.publishedVersion);
      setStatusBanner({
        type: 'success',
        message: `Published Version v${published.publishedVersion.version} live to the student portal!`
      });
    } catch (err: unknown) {
      setStatusBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to publish exercise.'
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleAddBlock = (definition: BlockDefinition, insertIndex?: number): void => {
    const newBlock = createBlockInstance(definition, templateSchema.blocks);
    const nextBlocks = [...templateSchema.blocks].sort((a, b) => a.order - b.order);
    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= nextBlocks.length) {
      nextBlocks.splice(insertIndex, 0, newBlock);
    } else {
      nextBlocks.push(newBlock);
    }

    setTemplateSchema((prev) => ({
      ...prev,
      blocks: reindexBlocks(nextBlocks)
    }));
    setSelectedBlockId(newBlock.id);
    setIsDirty(true);
  };

  const handleMoveBlock = (id: string, direction: 'up' | 'down'): void => {
    const sorted = [...templateSchema.blocks].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    const reordered = arrayMove(sorted, idx, targetIdx);
    setTemplateSchema((prev) => ({ ...prev, blocks: reindexBlocks(reordered) }));
    setIsDirty(true);
  };

  const handleDuplicateBlock = (id: string): void => {
    const sorted = [...templateSchema.blocks].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const orig = sorted[idx]!;
    const suffix = Math.random().toString(36).slice(2, 6);
    const copy: TemplateBlock = {
      ...orig,
      id: `${orig.type}_${suffix}`,
      label: orig.label ? `${orig.label} (Copy)` : undefined,
      ...(orig.fieldKey ? { fieldKey: `${orig.fieldKey}_copy_${suffix}` } : {}),
      props: { ...orig.props },
      ...(orig.bindings ? { bindings: { ...orig.bindings } } : {})
    };
    sorted.splice(idx + 1, 0, copy);
    setTemplateSchema((prev) => ({ ...prev, blocks: reindexBlocks(sorted) }));
    setSelectedBlockId(copy.id);
    setIsDirty(true);
  };

  const handleDeleteBlock = (id: string): void => {
    const remaining = templateSchema.blocks.filter((b) => b.id !== id);
    setTemplateSchema((prev) => ({ ...prev, blocks: reindexBlocks(remaining) }));
    if (selectedBlockId === id) {
      setSelectedBlockId(remaining[0]?.id ?? null);
    }
    setIsDirty(true);
  };

  const handleUpdateBlock = (updated: TemplateBlock): void => {
    setTemplateSchema((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === updated.id ? updated : b))
    }));
    setIsDirty(true);
  };

  const handleDragStart = (event: DragStartEvent): void => {
    const data = event.active.data.current as
      | { source?: string; blockType?: string; blockId?: string }
      | undefined;

    if (data?.source === 'palette' && data.blockType) {
      const def = getBlock(data.blockType);
      setActiveDragLabel(def?.name ?? data.blockType);
    } else if (data?.source === 'canvas' && data.blockId) {
      const blk = templateSchema.blocks.find((b) => b.id === data.blockId);
      setActiveDragLabel(blk?.label || blk?.type || 'Block');
    }
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveDragLabel(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { source?: string; blockType?: string }
      | undefined;

    if (activeData?.source === 'palette' && activeData.blockType) {
      const def = getBlock(activeData.blockType);
      if (!def) return;
      const sorted = [...templateSchema.blocks].sort((a, b) => a.order - b.order);
      const overIdx = sorted.findIndex((b) => b.id === over.id);
      handleAddBlock(def, overIdx !== -1 ? overIdx : undefined);
      return;
    }

    if (active.id !== over.id) {
      const sorted = [...templateSchema.blocks].sort((a, b) => a.order - b.order);
      const oldIdx = sorted.findIndex((b) => b.id === active.id);
      const newIdx = sorted.findIndex((b) => b.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        const reordered = arrayMove(sorted, oldIdx, newIdx);
        setTemplateSchema((prev) => ({ ...prev, blocks: reindexBlocks(reordered) }));
        setIsDirty(true);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
        <span className="text-sm font-medium text-slate-700">
          Loading Exercise Builder...
        </span>
      </div>
    );
  }

  if (loadError || !exercise || !activeVersion) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
        <h2 className="font-bold">Unable to load Exercise Builder</h2>
        <p className="mt-1 text-sm">{loadError || 'Exercise or version not found.'}</p>
        <Link
          href="/admin/exercises"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-navy underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Exercises
        </Link>
      </div>
    );
  }

  const selectedBlock =
    templateSchema.blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div className="space-y-5">
      {/* Top Builder Toolbar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/admin/exercises"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Exercises
            </Link>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-brand-navy">{title || exercise.title}</h1>
                <span className="rounded-md bg-brand-navy px-2 py-0.5 text-[11px] font-bold uppercase text-brand-gold">
                  {skill}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    activeVersion.status === 'DRAFT'
                      ? 'border border-amber-200 bg-amber-50 text-amber-800'
                      : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {activeVersion.status} v{activeVersion.version}
                </span>
                {isDirty && (
                  <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200">
                    Unsaved changes
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-slate-500">code: {exercise.code}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMetaDrawer((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Metadata &amp; Badges
            </button>

            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={isSaving || isPublishing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-brand-navy hover:bg-slate-50 disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Draft
            </button>

            <button
              type="button"
              onClick={() => void handleOpenPreview()}
              disabled={isSaving || isPublishing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-gold bg-brand-cream px-3.5 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-gold/20 disabled:opacity-60"
            >
              <Eye className="h-3.5 w-3.5" />
              Live Preview
            </button>

            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={isSaving || isPublishing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-60"
            >
              {isPublishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-gold" />
              ) : (
                <Rocket className="h-3.5 w-3.5 text-brand-gold" />
              )}
              Publish
            </button>
          </div>
        </div>

        {/* Collapsible Metadata & Settings Drawer */}
        {showMetaDrawer && (
          <div className="grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Skill</label>
              <select
                value={skill}
                onChange={(e) => {
                  setSkill(e.target.value as ExerciseSkill);
                  setIsDirty(true);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
              >
                <option value="WRITING">WRITING</option>
                <option value="READING">READING</option>
                <option value="LISTENING">LISTENING</option>
                <option value="SPEAKING">SPEAKING</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">Total Marks</label>
              <input
                type="number"
                min={1}
                max={500}
                value={totalMarks}
                onChange={(e) => {
                  setTotalMarks(Number(e.target.value) || 1);
                  setIsDirty(true);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700">
                Header Badges (comma-separated)
              </label>
              <input
                type="text"
                value={templateSchema.settings.badges.join(', ')}
                onChange={(e) => {
                  const badges = e.target.value
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  setTemplateSchema((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, badges }
                  }));
                  setIsDirty(true);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="space-y-1 sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold text-slate-700">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIsDirty(true);
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="flex items-end pb-1.5">
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={templateSchema.settings.showHeaderBadges}
                  onChange={(e) => {
                    setTemplateSchema((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, showHeaderBadges: e.target.checked }
                    }));
                    setIsDirty(true);
                  }}
                />
                Show Header Badges
              </label>
            </div>
          </div>
        )}

        {/* Sub-Tabs */}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('canvas')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'canvas'
                ? 'bg-brand-navy text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Canvas Builder ({templateSchema.blocks.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('prompts')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'prompts'
                ? 'bg-brand-navy text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileCode2 className="h-3.5 w-3.5" />
            Global Prompt Manager ({promptEntries.length})
          </button>

          <button
            type="button"
            onClick={() => void handleOpenPreview()}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'preview'
                ? 'bg-brand-navy text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Live Interactive Preview
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {statusBanner && (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${
            statusBanner.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {statusBanner.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{statusBanner.message}</span>
        </div>
      )}

      {/* Active Workspace Tab */}
      {activeTab === 'canvas' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-5 lg:grid-cols-12 items-start">
            <div className="lg:col-span-3">
              <BlockPalette onAddBlock={(def) => handleAddBlock(def)} />
            </div>

            <div className="lg:col-span-5">
              <BuilderCanvas
                blocks={templateSchema.blocks}
                selectedBlockId={selectedBlockId}
                onSelectBlock={setSelectedBlockId}
                onMoveBlock={handleMoveBlock}
                onDuplicateBlock={handleDuplicateBlock}
                onDeleteBlock={handleDeleteBlock}
              />
            </div>

            <div className="lg:col-span-4">
              <BlockInspector
                block={selectedBlock}
                allBlocks={templateSchema.blocks}
                promptEntries={promptEntries}
                telegramTargets={telegramTargets}
                onChangeBlock={handleUpdateBlock}
              />
            </div>
          </div>

          <DragOverlay>
            {activeDragLabel ? (
              <div className="rounded-xl border border-brand-gold bg-brand-navy px-4 py-2 text-xs font-bold text-white shadow-lg">
                {activeDragLabel}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {activeTab === 'prompts' && (
        <GlobalPromptManager
          promptEntries={promptEntries}
          canvasBlocks={templateSchema.blocks}
          onChangePrompts={(next) => {
            setPromptEntries(next);
            setIsDirty(true);
          }}
        />
      )}

      {activeTab === 'preview' && (
        <LivePreviewPane
          code={exercise.code}
          exerciseTitle={title || exercise.title}
          totalMarks={totalMarks}
          versionId={activeVersion.id}
          versionNumber={activeVersion.version}
          templateSchema={templateSchema}
          promptEntries={promptEntries}
        />
      )}
    </div>
  );
}
