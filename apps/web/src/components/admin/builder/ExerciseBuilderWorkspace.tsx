'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
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
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  FileCode2,
  GripVertical,
  Layers,
  Loader2,
  RefreshCw,
  Rocket,
  Save,
  SlidersHorizontal
} from 'lucide-react';
import {
  ADMIN_EXERCISES_CACHE_KEYS,
  fetchAdminExercise,
  fetchTelegramTargetsSummary,
  publishAdminExercise,
  saveAdminExerciseDraft,
  type AdminExerciseDetail,
  type AdminPromptVersionView
} from '../../../lib/admin-exercises-api';
import {
  fetchInstructorExercise,
  fetchInstructorTelegram,
  INSTRUCTOR_CACHE_KEYS,
  publishInstructorExercise,
  saveInstructorExerciseDraft
} from '../../../lib/instructor-api';
import { getCached, isCacheFresh } from '../../../lib/client-cache';
import {
  PageEntrance,
  SlidingTabButton,
  SPRING_GENTLE
} from '../../ui/MotionPrimitives';
import { BlockInspector, inferInputFieldMapFromCanvas } from './BlockInspector';
import { BlockPalette } from './BlockPalette';
import { BuilderCanvas, type DropIndicator } from './BuilderCanvas';
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

export function ExerciseBuilderWorkspace({
  code,
  mode = 'admin'
}: {
  code: string;
  mode?: 'admin' | 'instructor';
}): React.ReactElement {
  const isInstructorMode = mode === 'instructor';
  const backHref = isInstructorMode ? '/instructor/exercises' : '/admin/exercises';
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

  const [promptValidationError, setPromptValidationError] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BuilderTab>('canvas');
  const [showMetaDrawer, setShowMetaDrawer] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [isPaletteDragging, setIsPaletteDragging] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!code) return false;
    const key = isInstructorMode
      ? INSTRUCTOR_CACHE_KEYS.exercise(code)
      : ADMIN_EXERCISES_CACHE_KEYS.exercise(code);
    return getCached<AdminExerciseDetail>(key) === null;
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const pointerFirstCollisionDetection: CollisionDetection = useCallback((args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) {
      const blockHits = pointerHits.filter((hit) => hit.id !== 'builder-canvas');
      return blockHits.length > 0 ? blockHits : pointerHits;
    }
    return closestCorners(args);
  }, []);

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

  const loadExercise = useCallback(
    async (force = false): Promise<void> => {
      if (!code) {
        setIsLoading(false);
        setLoadError('Invalid exercise code.');
        return;
      }

      const cacheKey = isInstructorMode
        ? INSTRUCTOR_CACHE_KEYS.exercise(code)
        : ADMIN_EXERCISES_CACHE_KEYS.exercise(code);
      const cached = !force ? getCached<AdminExerciseDetail>(cacheKey) : null;
      if (cached) {
        hydrateFromDetail(cached);
        setIsLoading(false);
        if (isCacheFresh(cacheKey, 30_000)) {
          return;
        }
      } else {
        setIsLoading(true);
      }

      setLoadError(null);
      try {
        const detail = isInstructorMode
          ? await fetchInstructorExercise(code, { force })
          : await fetchAdminExercise(code, { force });
        hydrateFromDetail(detail);
      } catch (err: unknown) {
        if (!cached) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load exercise builder.');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [code, hydrateFromDetail, isInstructorMode]
  );

  useEffect(() => {
    void loadExercise(false);
  }, [loadExercise]);

  useEffect(() => {
    let cancelled = false;
    const targetsPromise = isInstructorMode
      ? fetchInstructorTelegram().then((data) => data.targets)
      : fetchTelegramTargetsSummary();
    void targetsPromise
      .catch(() => [] as TelegramTargetView[])
      .then((targets) => {
        if (!cancelled) {
          setTelegramTargets(targets);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isInstructorMode]);

  const saveDraftInternal = async (): Promise<AdminPromptVersionView | null> => {
    if (promptValidationError) {
      setStatusBanner({
        type: 'error',
        message: `Fix prompt validation errors before saving: ${promptValidationError}`
      });
      return null;
    }

    const seenKeys = new Set<string>();
    for (const entry of promptEntries) {
      const trimmedKey = entry.key.trim();
      if (!trimmedKey || !/^[a-z0-9_]+$/.test(trimmedKey)) {
        setStatusBanner({
          type: 'error',
          message: `Fix prompt validation errors before saving: Prompt "${entry.label || '(untitled)'}" has an empty or invalid key.`
        });
        return null;
      }
      if (seenKeys.has(trimmedKey)) {
        setStatusBanner({
          type: 'error',
          message: `Fix prompt validation errors before saving: Duplicate prompt key "${trimmedKey}".`
        });
        return null;
      }
      seenKeys.add(trimmedKey);
    }

    setIsSaving(true);
    setStatusBanner(null);
    try {
      const draftPayload = {
        title: title.trim() || code,
        skill,
        description: description.trim() || null,
        totalMarks,
        templateSchema: {
          ...templateSchema,
          blocks: reindexBlocks(templateSchema.blocks)
        },
        promptEntries
      };
      const saved = isInstructorMode
        ? await saveInstructorExerciseDraft(code, draftPayload)
        : await saveAdminExerciseDraft(code, draftPayload);
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

      const published = isInstructorMode
        ? await publishInstructorExercise(code, targetVersionId)
        : await publishAdminExercise(code, targetVersionId);
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

  const computeDropIndicator = useCallback(
    (event: {
      active: DragOverEvent['active'];
      over: DragOverEvent['over'];
    }): DropIndicator | null => {
      const { active, over } = event;
      if (!over) return null;

      const overId = String(over.id);
      if (overId === 'builder-canvas') {
        return { targetId: 'canvas-end', position: 'after' };
      }

      const activeData = active.data.current as { source?: string } | undefined;
      if (activeData?.source === 'canvas' && active.id === over.id) {
        return null;
      }

      const translated = active.rect.current.translated;
      const activeMidY = translated
        ? translated.top + translated.height / 2
        : over.rect.top + over.rect.height / 2;
      const overMidY = over.rect.top + over.rect.height / 2;

      return {
        targetId: overId,
        position: activeMidY < overMidY ? 'before' : 'after'
      };
    },
    []
  );

  const syncDropIndicator = useCallback(
    (event: {
      active: DragOverEvent['active'];
      over: DragOverEvent['over'];
    }): void => {
      const next = computeDropIndicator(event);
      setDropIndicator((prev) => {
        if (prev?.targetId === next?.targetId && prev?.position === next?.position) {
          return prev;
        }
        return next;
      });
    },
    [computeDropIndicator]
  );

  const handleDragStart = (event: DragStartEvent): void => {
    const data = event.active.data.current as
      | { source?: string; blockType?: string; blockId?: string }
      | undefined;

    if (data?.source === 'palette' && data.blockType) {
      const def = getBlock(data.blockType);
      setActiveDragLabel(def?.name ?? data.blockType);
      setIsPaletteDragging(true);
    } else if (data?.source === 'canvas' && data.blockId) {
      const blk = templateSchema.blocks.find((b) => b.id === data.blockId);
      setActiveDragLabel(blk?.label || blk?.type || 'Block');
      setIsPaletteDragging(false);
    }
  };

  const handleDragOver = (event: DragOverEvent): void => {
    syncDropIndicator(event);
  };

  const handleDragMove = (event: DragMoveEvent): void => {
    syncDropIndicator(event);
  };

  const handleDragCancel = (): void => {
    setActiveDragLabel(null);
    setDropIndicator(null);
    setIsPaletteDragging(false);
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const finalIndicator = computeDropIndicator(event) ?? dropIndicator;
    setActiveDragLabel(null);
    setDropIndicator(null);
    setIsPaletteDragging(false);

    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as
      | { source?: string; blockType?: string }
      | undefined;

    if (activeData?.source === 'palette' && activeData.blockType) {
      const def = getBlock(activeData.blockType);
      if (!def) return;
      const sorted = [...templateSchema.blocks].sort((a, b) => a.order - b.order);
      if (finalIndicator && finalIndicator.targetId !== 'canvas-end') {
        const overIdx = sorted.findIndex((b) => b.id === finalIndicator.targetId);
        const insertIdx =
          overIdx !== -1
            ? finalIndicator.position === 'before'
              ? overIdx
              : overIdx + 1
            : undefined;
        handleAddBlock(def, insertIdx);
      } else {
        handleAddBlock(def);
      }
      return;
    }

    const sorted = [...templateSchema.blocks].sort((a, b) => a.order - b.order);
    const oldIdx = sorted.findIndex((b) => b.id === active.id);
    if (oldIdx === -1) return;

    let finalIdx = -1;
    if (finalIndicator?.targetId === 'canvas-end') {
      finalIdx = sorted.length - 1;
    } else if (finalIndicator) {
      const overIdx = sorted.findIndex((b) => b.id === finalIndicator.targetId);
      if (overIdx === -1) return;
      const insertIdx = finalIndicator.position === 'before' ? overIdx : overIdx + 1;
      finalIdx =
        oldIdx < insertIdx
          ? Math.max(0, Math.min(sorted.length - 1, insertIdx - 1))
          : Math.max(0, Math.min(sorted.length - 1, insertIdx));
    } else if (active.id !== over.id) {
      finalIdx = sorted.findIndex((b) => b.id === over.id);
    }

    if (finalIdx !== -1 && oldIdx !== finalIdx) {
      const reordered = arrayMove(sorted, oldIdx, finalIdx);
      setTemplateSchema((prev) => ({ ...prev, blocks: reindexBlocks(reordered) }));
      setIsDirty(true);
    }
  };

  if (isLoading) {
    return (
      <div className="glass-panel flex items-center gap-3 rounded-2xl p-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-900" />
        <span className="text-sm font-medium text-zinc-700">
          Loading Exercise Builder...
        </span>
      </div>
    );
  }

  if (loadError || !exercise || !activeVersion) {
    return (
      <div className="rounded-2xl border border-rose-200/85 bg-rose-50/90 p-6 text-rose-900 backdrop-blur-md">
        <h2 className="font-bold">Unable to load Exercise Builder</h2>
        <p className="mt-1 text-sm">{loadError || 'Exercise or version not found.'}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void loadExercise(true)}
            className="glass-btn-primary !inline-flex !items-center !gap-1.5 !px-4 !py-2 !text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
          <Link
            href={backHref}
            className="glass-btn-secondary !inline-flex !items-center !gap-1.5 !px-3.5 !py-2 !text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Exercises
          </Link>
        </div>
      </div>
    );
  }

  const selectedBlock =
    templateSchema.blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <PageEntrance className="space-y-5">
      {/* Top Builder Toolbar */}
      <div className="glass-panel space-y-4 rounded-2xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={backHref}
              className="glass-btn-secondary !inline-flex !items-center !gap-1.5 !px-3 !py-1.5 !text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Exercises
            </Link>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-zinc-900">
                  {title || exercise.title}
                </h1>
                <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[11px] font-bold uppercase text-white">
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
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                    Unsaved changes
                  </span>
                )}
              </div>
              <p className="font-mono text-xs text-zinc-500">code: {exercise.code}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowMetaDrawer((prev) => !prev)}
              className={`glass-btn-secondary !inline-flex !items-center !gap-1.5 !px-3 !py-2 !text-xs ${
                showMetaDrawer ? '!border-zinc-900/30 !bg-white ring-1 ring-zinc-900/10' : ''
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Metadata &amp; Badges
            </button>

            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={isSaving || isPublishing}
              className="glass-btn-secondary !inline-flex !items-center !gap-1.5 !px-3.5 !py-2 !text-xs disabled:opacity-60"
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
              className="glass-btn-secondary !inline-flex !items-center !gap-1.5 !border-zinc-300/90 !px-3.5 !py-2 !text-xs disabled:opacity-60"
            >
              <Eye className="h-3.5 w-3.5" />
              Live Preview
            </button>

            <button
              type="button"
              onClick={() => void handlePublish()}
              disabled={isSaving || isPublishing}
              className="glass-btn-primary !inline-flex !items-center !gap-1.5 !px-4 !py-2 !text-xs disabled:opacity-60"
            >
              {isPublishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Rocket className="h-3.5 w-3.5" />
              )}
              Publish
            </button>
          </div>
        </div>

        {/* Collapsible Metadata & Settings Drawer */}
        <AnimatePresence initial={false}>
          {showMetaDrawer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={SPRING_GENTLE}
              className="overflow-hidden"
            >
              <div className="grid gap-4 border-t border-zinc-200/70 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setIsDirty(true);
                    }}
                    className="glass-input w-full !px-3 !py-1.5 !text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">Skill</label>
                  <select
                    value={skill}
                    onChange={(e) => {
                      setSkill(e.target.value as ExerciseSkill);
                      setIsDirty(true);
                    }}
                    className="glass-input w-full !px-3 !py-1.5 !text-xs"
                  >
                    <option value="WRITING">WRITING</option>
                    <option value="READING">READING</option>
                    <option value="LISTENING">LISTENING</option>
                    <option value="SPEAKING">SPEAKING</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">Total Marks</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={totalMarks}
                    onChange={(e) => {
                      setTotalMarks(Number(e.target.value) || 1);
                      setIsDirty(true);
                    }}
                    className="glass-input w-full !px-3 !py-1.5 !text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
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
                    className="glass-input w-full !px-3 !py-1.5 !text-xs"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-semibold text-zinc-700">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setIsDirty(true);
                    }}
                    className="glass-input w-full !px-3 !py-1.5 !text-xs"
                  />
                </div>

                <div className="flex items-end pb-1.5">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-700">
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
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900"
                    />
                    Show Header Badges
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sub-Tabs */}
        <div className="border-t border-zinc-200/70 pt-3">
          <div
            role="tablist"
            aria-label="Builder workspace views"
            className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-zinc-200/70 bg-white/55 p-1 backdrop-blur-sm"
          >
            <SlidingTabButton
              layoutId="builder-tab-pill"
              isActive={activeTab === 'canvas'}
              onClick={() => setActiveTab('canvas')}
              asTab
              className="!py-2 !text-xs"
            >
              <Layers className="h-3.5 w-3.5" />
              Canvas Builder ({templateSchema.blocks.length})
            </SlidingTabButton>

            <SlidingTabButton
              layoutId="builder-tab-pill"
              isActive={activeTab === 'prompts'}
              onClick={() => setActiveTab('prompts')}
              asTab
              className="!py-2 !text-xs"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Global Prompt Manager ({promptEntries.length})
            </SlidingTabButton>

            <SlidingTabButton
              layoutId="builder-tab-pill"
              isActive={activeTab === 'preview'}
              onClick={() => void handleOpenPreview()}
              asTab
              className="!py-2 !text-xs"
            >
              <Eye className="h-3.5 w-3.5" />
              Live Interactive Preview
            </SlidingTabButton>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {statusBanner && (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium backdrop-blur-sm ${
            statusBanner.type === 'success'
              ? 'border-emerald-200/90 bg-emerald-50/90 text-emerald-800'
              : 'border-rose-200/90 bg-rose-50/90 text-rose-800'
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
          collisionDetection={pointerFirstCollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragMove={handleDragMove}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
        >
          <div className="grid items-start gap-5 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <BlockPalette onAddBlock={(def) => handleAddBlock(def)} />
            </div>

            <div className="lg:col-span-5">
              <BuilderCanvas
                blocks={templateSchema.blocks}
                selectedBlockId={selectedBlockId}
                dropIndicator={dropIndicator}
                isPaletteDragging={isPaletteDragging}
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

          <DragOverlay
            dropAnimation={{
              duration: 180,
              easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
            }}
          >
            {activeDragLabel ? (
              <div className="glass-panel-strong flex scale-[1.02] items-center gap-2 rounded-xl px-4 py-3 text-xs font-bold text-zinc-900 shadow-2xl ring-2 ring-zinc-900/15">
                <GripVertical className="h-4 w-4 text-zinc-400" />
                <span>{activeDragLabel}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {activeTab === 'prompts' && (() => {
        const evalBlock = templateSchema.blocks.find((b) => b.type === 'examiner_evaluation');
        const evalContentMax =
          typeof evalBlock?.props?.contentMax === 'number' && evalBlock.props.contentMax > 0
            ? evalBlock.props.contentMax
            : undefined;
        const evalLanguageMax =
          typeof evalBlock?.props?.languageMax === 'number' && evalBlock.props.languageMax > 0
            ? evalBlock.props.languageMax
            : undefined;
        const evalTotalMarks =
          typeof evalBlock?.props?.totalMarks === 'number' && evalBlock.props.totalMarks > 0
            ? evalBlock.props.totalMarks
            : totalMarks;
        const marksLimits = {
          ...(evalContentMax !== undefined ? { contentMax: evalContentMax } : {}),
          ...(evalLanguageMax !== undefined ? { languageMax: evalLanguageMax } : {}),
          totalMax: evalTotalMarks
        };

        return (
          <GlobalPromptManager
            promptEntries={promptEntries}
            canvasBlocks={templateSchema.blocks}
            marksLimits={marksLimits}
            onValidationChange={setPromptValidationError}
            onChangePrompts={(next) => {
              setPromptEntries(next);
              setIsDirty(true);
            }}
          />
        );
      })()}

      {activeTab === 'preview' && (
        <LivePreviewPane
          code={exercise.code}
          exerciseTitle={title || exercise.title}
          totalMarks={totalMarks}
          versionId={activeVersion.id}
          versionNumber={activeVersion.version}
          templateSchema={templateSchema}
          promptEntries={promptEntries}
          mode={mode}
        />
      )}
    </PageEntrance>
  );
}
