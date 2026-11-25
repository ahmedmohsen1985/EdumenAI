'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ExerciseSkill } from '@edumenai/shared';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileEdit,
  Layers,
  Loader2,
  Plus,
  Trash2,
  Wrench,
  X
} from 'lucide-react';
import {
  ADMIN_EXERCISES_CACHE_KEYS,
  createAdminExercise,
  deleteAdminExercise,
  duplicateAdminExercise,
  fetchAdminExercises,
  type AdminExerciseSummary
} from '../../lib/admin-exercises-api';
import { getCached, isCacheFresh } from '../../lib/client-cache';
import {
  AnimatedModal,
  PageEntrance,
  SlidingTabButton,
  StaggerCard,
  StaggerGrid
} from '../ui/MotionPrimitives';

type SkillFilter = 'ALL' | ExerciseSkill;

const SKILL_TABS: ReadonlyArray<{ id: SkillFilter; label: string }> = [
  { id: 'ALL', label: 'All Skills' },
  { id: 'WRITING', label: 'Writing' },
  { id: 'READING', label: 'Reading' },
  { id: 'LISTENING', label: 'Listening' },
  { id: 'SPEAKING', label: 'Speaking' }
];

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function AdminExercisesList(): React.ReactElement {
  const router = useRouter();
  const cachedExercises = getCached<AdminExerciseSummary[]>(ADMIN_EXERCISES_CACHE_KEYS.exercises);
  const [exercises, setExercises] = useState<AdminExerciseSummary[]>(cachedExercises ?? []);
  const [skillFilter, setSkillFilter] = useState<SkillFilter>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(cachedExercises === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create Exercise modal state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState<boolean>(false);
  const [skill, setSkill] = useState<ExerciseSkill>('WRITING');
  const [totalMarks, setTotalMarks] = useState<string>('23');
  const [description, setDescription] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Duplicate Exercise modal state
  const [duplicateSource, setDuplicateSource] = useState<AdminExerciseSummary | null>(null);
  const [dupTitle, setDupTitle] = useState<string>('');
  const [dupCode, setDupCode] = useState<string>('');
  const [dupCodeManuallyEdited, setDupCodeManuallyEdited] = useState<boolean>(false);
  const [dupError, setDupError] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<boolean>(false);

  // Delete Exercise inline confirmation state
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadExercises = async (options?: { silent?: boolean; force?: boolean }): Promise<void> => {
    if (!options?.silent) {
      setIsLoading(true);
    }
    setLoadError(null);
    try {
      const list = await fetchAdminExercises({ force: options?.force });
      setExercises(list);
    } catch (err: unknown) {
      if (!options?.silent) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load exercises.');
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const cached = getCached<AdminExerciseSummary[]>(ADMIN_EXERCISES_CACHE_KEYS.exercises);
    if (cached && isCacheFresh(ADMIN_EXERCISES_CACHE_KEYS.exercises, 30_000)) {
      setIsLoading(false);
      return;
    }
    void loadExercises({ silent: cached !== null });
  }, []);

  const filteredExercises = useMemo(() => {
    if (skillFilter === 'ALL') return exercises;
    return exercises.filter((ex) => ex.skill === skillFilter);
  }, [exercises, skillFilter]);

  const countsBySkill = useMemo(() => {
    const counts: Record<SkillFilter, number> = {
      ALL: exercises.length,
      WRITING: 0,
      READING: 0,
      LISTENING: 0,
      SPEAKING: 0
    };
    for (const ex of exercises) {
      counts[ex.skill] += 1;
    }
    return counts;
  }, [exercises]);

  const handleTitleChange = (val: string): void => {
    setTitle(val);
    if (!codeManuallyEdited) {
      setCode(slugifyTitle(val));
    }
  };

  const resetModal = (): void => {
    setTitle('');
    setCode('');
    setCodeManuallyEdited(false);
    setSkill('WRITING');
    setTotalMarks('23');
    setDescription('');
    setCreateError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setCreateError(null);

    const trimmedCode = code.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(trimmedCode)) {
      setCreateError('Exercise code must be a lowercase slug containing only a-z, 0-9, and -.');
      return;
    }

    const parsedMarks = Number(totalMarks);
    if (!Number.isInteger(parsedMarks) || parsedMarks <= 0 || parsedMarks > 500) {
      setCreateError('Total marks must be a positive integer between 1 and 500.');
      return;
    }

    setIsCreating(true);
    try {
      const created = await createAdminExercise({
        code: trimmedCode,
        title: title.trim(),
        skill,
        totalMarks: parsedMarks,
        ...(description.trim() ? { description: description.trim() } : {})
      });
      setIsCreateOpen(false);
      resetModal();
      router.push(`/admin/exercises/${encodeURIComponent(created.code)}/builder`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create exercise.');
    } finally {
      setIsCreating(false);
    }
  };

  const openDuplicateModal = (ex: AdminExerciseSummary): void => {
    const nextTitle = `${ex.title} (Copy)`;
    setDuplicateSource(ex);
    setDupTitle(nextTitle);
    setDupCode(slugifyTitle(nextTitle));
    setDupCodeManuallyEdited(false);
    setDupError(null);
  };

  const handleDuplicateSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!duplicateSource) return;
    setDupError(null);

    const trimmedCode = dupCode.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(trimmedCode)) {
      setDupError('Exercise code must be a lowercase slug containing only a-z, 0-9, and -.');
      return;
    }

    if (!dupTitle.trim()) {
      setDupError('Title is required.');
      return;
    }

    setIsDuplicating(true);
    try {
      const created = await duplicateAdminExercise(duplicateSource.code, {
        code: trimmedCode,
        title: dupTitle.trim()
      });
      setDuplicateSource(null);
      router.push(`/admin/exercises/${encodeURIComponent(created.code)}/builder`);
    } catch (err: unknown) {
      setDupError(err instanceof Error ? err.message : 'Failed to duplicate exercise.');
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleConfirmDelete = async (targetCode: string): Promise<void> => {
    setDeletingCode(targetCode);
    setDeleteError(null);
    try {
      await deleteAdminExercise(targetCode);
      setExercises((prev) => prev.filter((item) => item.code !== targetCode));
      setConfirmDeleteCode(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete exercise.');
    } finally {
      setDeletingCode(null);
    }
  };

  return (
    <PageEntrance className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Exercises &amp; Lego Builder
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage assessments across Writing, Reading, Listening, and Speaking skills.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetModal();
            setIsCreateOpen(true);
          }}
          className="glass-btn-primary"
        >
          <Plus className="h-4 w-4" />
          Create New Exercise
        </button>
      </div>

      {/* Skill Filter Tabs */}
      <div
        role="tablist"
        aria-label="Filter exercises by skill"
        className="glass-panel flex flex-wrap gap-1.5 p-1.5"
      >
        {SKILL_TABS.map((tab) => {
          const isActive = skillFilter === tab.id;
          return (
            <SlidingTabButton
              key={tab.id}
              layoutId="admin-skill-pill"
              asTab
              isActive={isActive}
              onClick={() => setSkillFilter(tab.id)}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold"
              activeClassName="text-white"
              inactiveClassName="text-zinc-600 hover:text-zinc-900"
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-zinc-900/5 text-zinc-600'
                }`}
              >
                {countsBySkill[tab.id]}
              </span>
            </SlidingTabButton>
          );
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="glass-panel flex items-center gap-3 p-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading exercises...</span>
        </div>
      ) : loadError ? (
        <div className="glass-panel-strong flex items-start gap-3 border-rose-200/80 bg-rose-50/75 p-6 text-rose-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="font-bold">Failed to load exercises</p>
            <p className="mt-1 text-sm">{loadError}</p>
          </div>
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="glass-panel border-dashed border-zinc-300/80 p-10 text-center">
          <Layers className="mx-auto h-10 w-10 text-zinc-300" />
          <h2 className="mt-3 text-base font-bold text-zinc-800">
            No exercises in {skillFilter === 'ALL' ? 'the catalog' : skillFilter}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Create a new exercise to open the drag-and-drop Lego Template Builder.
          </p>
          <button
            type="button"
            onClick={() => {
              resetModal();
              if (skillFilter !== 'ALL') setSkill(skillFilter);
              setIsCreateOpen(true);
            }}
            className="glass-btn-primary mt-4"
          >
            <Plus className="h-4 w-4" />
            Create New Exercise
          </button>
        </div>
      ) : (
        <StaggerGrid key={skillFilter} className="grid gap-4 md:grid-cols-2">
          {filteredExercises.map((ex) => (
            <StaggerCard key={ex.id}>
              <div className="glass-card flex h-full flex-col justify-between p-5">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="glass-pill !bg-zinc-900 !text-white !border-zinc-900 uppercase">
                        {ex.skill}
                      </span>
                      <span className="glass-pill">
                        {ex.totalMarks} Marks
                      </span>
                    </div>

                    <span className="text-xs font-medium text-zinc-500 whitespace-nowrap">
                      {ex.versionCount} {ex.versionCount === 1 ? 'version' : 'versions'}
                    </span>
                  </div>

                  <h2 className="mt-3 text-lg font-bold text-zinc-900">{ex.title}</h2>
                  <p
                    className="mt-0.5 truncate font-mono text-xs text-zinc-400"
                    title={ex.code}
                  >
                    /exercises/{ex.code}
                  </p>
                  {ex.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600">{ex.description}</p>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {ex.activeVersion ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50/90 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Published v{ex.activeVersion.version}
                      </span>
                    ) : (
                      <span className="glass-pill">
                        Not Published
                      </span>
                    )}

                    {ex.latestDraft && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50/90 px-2.5 py-0.5 text-xs font-semibold text-amber-800 whitespace-nowrap">
                        <FileEdit className="h-3.5 w-3.5" />
                        Draft v{ex.latestDraft.version}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 space-y-2 border-t border-zinc-200/70 pt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/exercises/${encodeURIComponent(ex.code)}/builder`}
                      className="glass-btn-primary flex-1 !py-2"
                    >
                      <Wrench className="h-4 w-4" />
                      Open Builder
                    </Link>

                    {ex.activeVersion && (
                      <Link
                        href={`/exercises/${encodeURIComponent(ex.code)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="glass-btn-secondary !px-3 !py-2"
                      >
                        <span>Student View</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={() => openDuplicateModal(ex)}
                      title="Duplicate Exercise"
                      aria-label={`Duplicate ${ex.title}`}
                      className="glass-btn-secondary !p-2"
                    >
                      <Copy className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmDeleteCode(ex.code);
                      }}
                      title="Delete Exercise"
                      aria-label={`Delete ${ex.title}`}
                      className="glass-btn-secondary !p-2 text-rose-700 hover:!border-rose-200 hover:!bg-rose-50/90"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {confirmDeleteCode === ex.code && (
                    <div className="rounded-xl border border-rose-200/90 bg-rose-50/85 p-3 text-xs text-rose-900 space-y-2">
                      <p className="font-semibold">
                        Delete &quot;{ex.title}&quot;? All versions, submissions, and evaluation
                        reports for this exercise will be permanently deleted.
                      </p>
                      {deleteError && <p className="font-medium text-rose-700">{deleteError}</p>}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleConfirmDelete(ex.code)}
                          disabled={deletingCode === ex.code}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        >
                          {deletingCode === ex.code && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          )}
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteCode(null);
                            setDeleteError(null);
                          }}
                          className="glass-btn-secondary !rounded-lg !px-3 !py-1.5 !text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </StaggerCard>
          ))}
        </StaggerGrid>
      )}

      {/* Duplicate Exercise Modal */}
      <AnimatedModal
        open={Boolean(duplicateSource)}
        onClose={() => setDuplicateSource(null)}
        ariaLabelledBy="duplicate-exercise-title"
        className="p-6"
      >
        {duplicateSource && (
          <>
            <div className="flex items-center justify-between border-b border-zinc-200/70 pb-3">
              <h2 id="duplicate-exercise-title" className="text-lg font-bold text-zinc-900">
                Duplicate Exercise
              </h2>
              <button
                type="button"
                onClick={() => setDuplicateSource(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-900/5 hover:text-zinc-700"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleDuplicateSubmit(e)} className="mt-4 space-y-4">
              <p className="text-xs text-zinc-600">
                Clones all template blocks, prompt entries, and marking schema from{' '}
                <strong className="text-zinc-900">{duplicateSource.title}</strong> into a new
                draft exercise.
              </p>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">New Title *</label>
                <input
                  type="text"
                  required
                  value={dupTitle}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDupTitle(val);
                    if (!dupCodeManuallyEdited) {
                      setDupCode(slugifyTitle(val));
                    }
                  }}
                  className="glass-input mt-1"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  New URL Slug (code) *
                </label>
                <input
                  type="text"
                  required
                  value={dupCode}
                  onChange={(e) => {
                    setDupCodeManuallyEdited(true);
                    setDupCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  }}
                  className="glass-input mt-1 font-mono"
                />
              </div>

              {dupError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/85 px-3 py-2 text-xs font-medium text-rose-700">
                  {dupError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-zinc-200/70 pt-4">
                <button
                  type="button"
                  onClick={() => setDuplicateSource(null)}
                  className="glass-btn-secondary !py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDuplicating}
                  className="glass-btn-primary !py-2"
                >
                  {isDuplicating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Duplicate &amp; Open Builder
                </button>
              </div>
            </form>
          </>
        )}
      </AnimatedModal>

      {/* Create New Exercise Modal */}
      <AnimatedModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        ariaLabelledBy="create-exercise-title"
        className="overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-zinc-200/70 bg-white/60 px-6 py-4">
          <h2 id="create-exercise-title" className="text-base font-bold text-zinc-900">
            Create New Exercise
          </h2>
          <button
            type="button"
            onClick={() => setIsCreateOpen(false)}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-900/5 hover:text-zinc-700"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4 p-6">
          {createError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/85 px-3.5 py-2.5 text-xs font-medium text-rose-700">
              {createError}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="new-ex-title" className="block text-sm font-semibold text-zinc-800">
              Exercise Title *
            </label>
            <input
              id="new-ex-title"
              type="text"
              required
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. Exercise 3 — Reading Comprehension"
              className="glass-input"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="new-ex-code" className="block text-sm font-semibold text-zinc-800">
                Slug Code *
              </label>
              <input
                id="new-ex-code"
                type="text"
                required
                value={code}
                onChange={(e) => {
                  setCodeManuallyEdited(true);
                  setCode(e.target.value.toLowerCase());
                }}
                placeholder="e.g. ex3-reading"
                className="glass-input font-mono"
              />
              <p className="text-[11px] text-zinc-500">Lowercase a-z, 0-9, and hyphens only.</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-ex-skill" className="block text-sm font-semibold text-zinc-800">
                Skill Category *
              </label>
              <select
                id="new-ex-skill"
                value={skill}
                onChange={(e) => setSkill(e.target.value as ExerciseSkill)}
                className="glass-input"
              >
                <option value="WRITING">Writing</option>
                <option value="READING">Reading</option>
                <option value="LISTENING">Listening</option>
                <option value="SPEAKING">Speaking</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-ex-marks" className="block text-sm font-semibold text-zinc-800">
              Total Marks *
            </label>
            <input
              id="new-ex-marks"
              type="number"
              min={1}
              max={500}
              required
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
              className="glass-input"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-ex-desc" className="block text-sm font-semibold text-zinc-800">
              Description
            </label>
            <textarea
              id="new-ex-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief exam overview and marking focus..."
              className="glass-input"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="glass-btn-secondary !py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="glass-btn-primary !py-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create &amp; Open Builder</span>
              )}
            </button>
          </div>
        </form>
      </AnimatedModal>
    </PageEntrance>
  );
}
