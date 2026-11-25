'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ExerciseSkill } from '@edumenai/shared';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Copy,
  Eye,
  Headphones,
  Layers,
  Loader2,
  Mic,
  Pencil,
  PenTool,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import type { AdminExerciseSummary } from '../../../lib/admin-exercises-api';
import type { PublishedExerciseSummary } from '../../../lib/api';
import {
  createInstructorExercise,
  deleteInstructorExercise,
  duplicateInstructorExercise,
  fetchInstructorExercises,
  INSTRUCTOR_CACHE_KEYS,
  type InstructorExercisesPayload
} from '../../../lib/instructor-api';
import { getCached, isCacheFresh } from '../../../lib/client-cache';
import { InstructorShell } from '../../../components/instructor/InstructorShell';
import {
  AnimatedModal,
  PageEntrance,
  SlidingTabButton,
  StaggerCard,
  StaggerGrid
} from '../../../components/ui/MotionPrimitives';

type ExercisesTab = 'mine' | 'official';
type SkillFilter = 'ALL' | ExerciseSkill;

const SKILL_OPTIONS: Array<{
  id: SkillFilter;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'ALL', label: 'All Skills', icon: Layers },
  { id: 'WRITING', label: 'Writing', icon: PenTool },
  { id: 'READING', label: 'Reading', icon: BookOpen },
  { id: 'LISTENING', label: 'Listening', icon: Headphones },
  { id: 'SPEAKING', label: 'Speaking', icon: Mic }
];

function slugifyCode(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function InstructorExercisesContent(): React.ReactElement {
  const router = useRouter();
  const initialData = getCached<InstructorExercisesPayload>(INSTRUCTOR_CACHE_KEYS.exercises);

  const [myExercises, setMyExercises] = useState<AdminExerciseSummary[]>(
    initialData?.myExercises ?? []
  );
  const [platformExercises, setPlatformExercises] = useState<PublishedExerciseSummary[]>(
    initialData?.platformExercises ?? []
  );
  const [activeTab, setActiveTab] = useState<ExercisesTab>('mine');
  const [skillFilter, setSkillFilter] = useState<SkillFilter>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(initialData === null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; message: string } | null>(null);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createTitle, setCreateTitle] = useState<string>('');
  const [createCode, setCreateCode] = useState<string>('');
  const [createSkill, setCreateSkill] = useState<ExerciseSkill>('WRITING');
  const [createTotalMarks, setCreateTotalMarks] = useState<number>(23);
  const [createDescription, setCreateDescription] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  // Duplicate modal (own exercises only)
  const [duplicateTarget, setDuplicateTarget] = useState<AdminExerciseSummary | null>(null);
  const [dupTitle, setDupTitle] = useState<string>('');
  const [dupCode, setDupCode] = useState<string>('');
  const [dupError, setDupError] = useState<string | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<boolean>(false);

  // Delete inline confirm
  const [confirmDeleteCode, setConfirmDeleteCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const loadData = useCallback(async (force = false) => {
    if (
      !force &&
      isCacheFresh(INSTRUCTOR_CACHE_KEYS.exercises, 30_000) &&
      getCached<InstructorExercisesPayload>(INSTRUCTOR_CACHE_KEYS.exercises)
    ) {
      setIsLoading(false);
      return;
    }
    setError(null);
    if (!getCached<InstructorExercisesPayload>(INSTRUCTOR_CACHE_KEYS.exercises)) {
      setIsLoading(true);
    }
    try {
      const data = await fetchInstructorExercises({ force });
      setMyExercises(data.myExercises);
      setPlatformExercises(data.platformExercises);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load exercises.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const filteredMyExercises = useMemo(() => {
    if (skillFilter === 'ALL') return myExercises;
    return myExercises.filter((ex) => ex.skill === skillFilter);
  }, [myExercises, skillFilter]);

  const handleCreateSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmedTitle = createTitle.trim();
    const cleanedCode = slugifyCode(createCode || trimmedTitle);
    if (!trimmedTitle || !cleanedCode) {
      setCreateError('Please enter both a title and a valid URL slug.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await createInstructorExercise({
        title: trimmedTitle,
        code: cleanedCode,
        skill: createSkill,
        totalMarks: createTotalMarks,
        description: createDescription.trim() || null
      });
      setShowCreateModal(false);
      setCreateTitle('');
      setCreateCode('');
      setCreateDescription('');
      router.push(`/instructor/exercises/${encodeURIComponent(created.code)}/builder`);
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create exercise.');
    } finally {
      setIsCreating(false);
    }
  };

  const openDuplicateModal = (ex: AdminExerciseSummary): void => {
    setDuplicateTarget(ex);
    setDupTitle(`${ex.title} (Copy)`);
    setDupCode(slugifyCode(`${ex.code}-copy`));
    setDupError(null);
  };

  const handleDuplicateSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!duplicateTarget) return;
    const trimmedTitle = dupTitle.trim();
    const cleanedCode = slugifyCode(dupCode);
    if (!trimmedTitle || !cleanedCode) {
      setDupError('Please enter a valid title and slug.');
      return;
    }

    setIsDuplicating(true);
    setDupError(null);
    try {
      const cloned = await duplicateInstructorExercise(duplicateTarget.code, {
        title: trimmedTitle,
        code: cleanedCode
      });
      setDuplicateTarget(null);
      setBanner({ ok: true, message: `Duplicated "${cloned.title}" successfully.` });
      await loadData(true);
    } catch (err: unknown) {
      setDupError(err instanceof Error ? err.message : 'Failed to duplicate exercise.');
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async (code: string): Promise<void> => {
    setDeletingCode(code);
    setBanner(null);
    try {
      await deleteInstructorExercise(code);
      setConfirmDeleteCode(null);
      setBanner({ ok: true, message: 'Exercise deleted successfully.' });
      await loadData(true);
    } catch (err: unknown) {
      setBanner({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to delete exercise.'
      });
    } finally {
      setDeletingCode(null);
    }
  };

  return (
    <PageEntrance className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="glass-pill">Assessment Library</span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
            Exercises
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Create and publish your own custom assessments, or preview official EdumenAI templates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData(true)}
            className="glass-btn-secondary !px-3 !py-2 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="glass-btn-primary"
          >
            <Plus className="h-4 w-4" />
            Create Exercise
          </button>
        </div>
      </div>

      {/* Segmented Tabs: My Custom Exercises | EdumenAI Official Exercises */}
      <div
        role="tablist"
        aria-label="Exercise library tabs"
        className="glass-panel inline-flex flex-wrap gap-1.5 p-1.5"
      >
        <SlidingTabButton
          asTab
          layoutId="instructor-exercises-tab-pill"
          isActive={activeTab === 'mine'}
          onClick={() => setActiveTab('mine')}
        >
          <Layers className="h-4 w-4" />
          My Custom Exercises
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'mine' ? 'bg-white/20 text-white' : 'bg-zinc-900/[0.06] text-zinc-600'
            }`}
          >
            {myExercises.length}
          </span>
        </SlidingTabButton>

        <SlidingTabButton
          asTab
          layoutId="instructor-exercises-tab-pill"
          isActive={activeTab === 'official'}
          onClick={() => setActiveTab('official')}
        >
          <ShieldCheck className="h-4 w-4" />
          EdumenAI Official Exercises
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'official'
                ? 'bg-white/20 text-white'
                : 'bg-zinc-900/[0.06] text-zinc-600'
            }`}
          >
            {platformExercises.length}
          </span>
        </SlidingTabButton>
      </div>

      {banner && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm backdrop-blur-md ${
            banner.ok
              ? 'border-emerald-200/80 bg-emerald-50/85 text-emerald-800'
              : 'border-rose-200/80 bg-rose-50/85 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            aria-label="Dismiss notice"
            className="rounded-lg p-1 hover:bg-black/5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-rose-200/80 bg-rose-50/85 px-4 py-3 text-sm text-rose-800 backdrop-blur-md"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading ? (
        <div className="glass-panel-strong flex items-center gap-3 p-6">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-700" />
          <span className="text-sm font-medium text-zinc-700">Loading exercises...</span>
        </div>
      ) : activeTab === 'mine' ? (
        <div className="space-y-5">
          {/* Skill Filter */}
          <div
            role="tablist"
            aria-label="Filter custom exercises by skill"
            className="glass-panel inline-flex flex-wrap gap-1 p-1.5"
          >
            {SKILL_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = skillFilter === opt.id;
              return (
                <SlidingTabButton
                  key={opt.id}
                  asTab
                  layoutId="instructor-skill-pill"
                  isActive={selected}
                  onClick={() => setSkillFilter(opt.id)}
                  className="!px-3 !py-1.5 !text-xs"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </SlidingTabButton>
              );
            })}
          </div>

          {filteredMyExercises.length === 0 ? (
            <div className="glass-panel border-dashed px-6 py-14 text-center">
              <Layers className="mx-auto h-8 w-8 text-zinc-400" />
              <h2 className="mt-3 text-base font-bold text-zinc-900">
                No custom exercises yet
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600">
                Build your first custom exercise with EdumenAI&apos;s visual Lego block builder. Only
                your approved students will see exercises you publish.
              </p>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="glass-btn-primary"
                >
                  <Plus className="h-4 w-4" />
                  Create Exercise
                </button>
              </div>
            </div>
          ) : (
            <StaggerGrid
              key={skillFilter}
              className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {filteredMyExercises.map((ex) => {
                const isPublished = Boolean(ex.activeVersion);
                const isConfirmingDelete = confirmDeleteCode === ex.code;
                const isDeleting = deletingCode === ex.code;

                return (
                  <StaggerCard key={ex.id} className="h-full">
                    <article className="glass-card flex h-full flex-col justify-between p-5">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="glass-pill">{ex.skill}</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <span className="glass-pill">{ex.totalMarks} Marks</span>
                            {isPublished ? (
                              <span className="shrink-0 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50/80 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                Published v{ex.activeVersion!.version}
                              </span>
                            ) : (
                              <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50/80 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Draft
                              </span>
                            )}
                          </div>
                        </div>

                        <h3 className="mt-3.5 text-lg font-bold leading-snug tracking-tight text-zinc-950">
                          {ex.title}
                        </h3>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">
                          /exercises/{ex.code}
                        </p>
                        {ex.description && (
                          <p className="mt-2 line-clamp-2 text-sm text-zinc-600">
                            {ex.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-5 space-y-2 border-t border-zinc-900/[0.06] pt-4">
                        {isConfirmingDelete ? (
                          <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200/80 bg-rose-50/85 px-3 py-2 text-xs text-rose-900">
                            <span className="font-semibold">Delete permanently?</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => void handleDelete(ex.code)}
                                className="rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                              >
                                {isDeleting ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setConfirmDeleteCode(null)}
                                className="rounded-lg bg-white/80 px-2.5 py-1 font-semibold text-zinc-700 hover:bg-white"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/instructor/exercises/${encodeURIComponent(ex.code)}/builder`}
                              className="glass-btn-primary flex-1 !py-2 !text-xs"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Open Builder
                            </Link>
                            <button
                              type="button"
                              title="Duplicate exercise"
                              aria-label={`Duplicate ${ex.title}`}
                              onClick={() => openDuplicateModal(ex)}
                              className="glass-btn-secondary !px-2.5 !py-2"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete exercise"
                              aria-label={`Delete ${ex.title}`}
                              onClick={() => setConfirmDeleteCode(ex.code)}
                              className="glass-btn-secondary !px-2.5 !py-2 text-rose-700 hover:!border-rose-200 hover:!bg-rose-50/90"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  </StaggerCard>
                );
              })}
            </StaggerGrid>
          )}
        </div>
      ) : (
        /* EdumenAI Official Exercises — Strict Read-Only */
        <div className="space-y-4">
          <div className="glass-panel flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-zinc-600">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-zinc-700" />
              <span>
                Official EdumenAI exercises are available to all students and protected as
                read-only platform content.
              </span>
            </div>
          </div>

          {platformExercises.length === 0 ? (
            <div className="glass-panel border-dashed px-6 py-12 text-center text-sm text-zinc-600">
              No published official exercises are available right now.
            </div>
          ) : (
            <StaggerGrid className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {platformExercises.map((ex) => (
                <StaggerCard key={ex.id} className="h-full">
                  <article className="glass-card flex h-full flex-col justify-between p-5">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="glass-pill">
                          <ShieldCheck className="h-3.5 w-3.5 text-zinc-500" />
                          EdumenAI Official · Read-Only
                        </span>
                        <span className="glass-pill">{ex.totalMarks} Marks</span>
                      </div>

                      <h3 className="mt-3.5 text-lg font-bold leading-snug tracking-tight text-zinc-950">
                        {ex.title}
                      </h3>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        {ex.skill} · v{ex.activeVersion.version}
                      </p>
                      {ex.description && (
                        <p className="mt-2 line-clamp-3 text-sm text-zinc-600">
                          {ex.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-5 border-t border-zinc-900/[0.06] pt-4">
                      <Link
                        href={`/exercises/${encodeURIComponent(ex.code)}`}
                        className="glass-btn-secondary w-full !py-2 !text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Preview Exercise
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </article>
                </StaggerCard>
              ))}
            </StaggerGrid>
          )}
        </div>
      )}

      {/* Create Custom Exercise Modal */}
      <AnimatedModal
        open={showCreateModal}
        onClose={() => {
          if (!isCreating) setShowCreateModal(false);
        }}
        ariaLabelledBy="create-instructor-exercise-title"
        maxWidthClassName="max-w-lg"
      >
        <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4 p-6">
          <div className="flex items-center justify-between border-b border-zinc-900/[0.06] pb-3">
            <h2
              id="create-instructor-exercise-title"
              className="text-lg font-extrabold tracking-tight text-zinc-950"
            >
              Create Custom Exercise
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              disabled={isCreating}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-900/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {createError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200/80 bg-rose-50/85 px-3.5 py-2.5 text-xs text-rose-800"
            >
              {createError}
            </div>
          )}

          <div>
            <label
              htmlFor="inst-ex-title"
              className="mb-1 block text-xs font-semibold text-zinc-600"
            >
              Exercise Title *
            </label>
            <input
              id="inst-ex-title"
              type="text"
              required
              value={createTitle}
              onChange={(e) => {
                const val = e.target.value;
                setCreateTitle(val);
                if (!createCode) {
                  setCreateCode(slugifyCode(val));
                }
              }}
              placeholder="e.g., Year 10 Persuasive Article Practice"
              className="glass-input"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="inst-ex-code"
                className="mb-1 block text-xs font-semibold text-zinc-600"
              >
                URL Slug *
              </label>
              <input
                id="inst-ex-code"
                type="text"
                required
                value={createCode}
                onChange={(e) => setCreateCode(slugifyCode(e.target.value))}
                placeholder="persuasive-article-1"
                className="glass-input font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                Automatically scoped to your instructor prefix.
              </p>
            </div>

            <div>
              <label
                htmlFor="inst-ex-skill"
                className="mb-1 block text-xs font-semibold text-zinc-600"
              >
                Skill
              </label>
              <select
                id="inst-ex-skill"
                value={createSkill}
                onChange={(e) => setCreateSkill(e.target.value as ExerciseSkill)}
                className="glass-input"
              >
                <option value="WRITING">Writing</option>
                <option value="READING">Reading</option>
                <option value="LISTENING">Listening</option>
                <option value="SPEAKING">Speaking</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="inst-ex-marks"
              className="mb-1 block text-xs font-semibold text-zinc-600"
            >
              Total Marks
            </label>
            <input
              id="inst-ex-marks"
              type="number"
              min={1}
              max={200}
              value={createTotalMarks}
              onChange={(e) => setCreateTotalMarks(Number(e.target.value) || 23)}
              className="glass-input w-32"
            />
          </div>

          <div>
            <label
              htmlFor="inst-ex-desc"
              className="mb-1 block text-xs font-semibold text-zinc-600"
            >
              Description (optional)
            </label>
            <textarea
              id="inst-ex-desc"
              rows={3}
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="Short guidance shown to students before starting."
              className="glass-input"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isCreating}
              onClick={() => setShowCreateModal(false)}
              className="glass-btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={isCreating} className="glass-btn-primary">
              {isCreating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create &amp; Open Builder
            </button>
          </div>
        </form>
      </AnimatedModal>

      {/* Duplicate Own Exercise Modal */}
      <AnimatedModal
        open={duplicateTarget !== null}
        onClose={() => {
          if (!isDuplicating) setDuplicateTarget(null);
        }}
        ariaLabelledBy="dup-instructor-exercise-title"
        maxWidthClassName="max-w-md"
      >
        <form onSubmit={(e) => void handleDuplicateSubmit(e)} className="space-y-4 p-6">
          <div className="flex items-center justify-between border-b border-zinc-900/[0.06] pb-3">
            <h2
              id="dup-instructor-exercise-title"
              className="text-lg font-extrabold tracking-tight text-zinc-950"
            >
              Duplicate Exercise
            </h2>
            <button
              type="button"
              onClick={() => setDuplicateTarget(null)}
              disabled={isDuplicating}
              aria-label="Close modal"
              className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-900/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {dupError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200/80 bg-rose-50/85 px-3.5 py-2.5 text-xs text-rose-800"
            >
              {dupError}
            </div>
          )}

          <div>
            <label
              htmlFor="dup-ex-title"
              className="mb-1 block text-xs font-semibold text-zinc-600"
            >
              New Title *
            </label>
            <input
              id="dup-ex-title"
              type="text"
              required
              value={dupTitle}
              onChange={(e) => setDupTitle(e.target.value)}
              className="glass-input"
            />
          </div>

          <div>
            <label
              htmlFor="dup-ex-code"
              className="mb-1 block text-xs font-semibold text-zinc-600"
            >
              New Slug *
            </label>
            <input
              id="dup-ex-code"
              type="text"
              required
              value={dupCode}
              onChange={(e) => setDupCode(slugifyCode(e.target.value))}
              className="glass-input font-mono text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isDuplicating}
              onClick={() => setDuplicateTarget(null)}
              className="glass-btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={isDuplicating} className="glass-btn-primary">
              {isDuplicating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Duplicate
            </button>
          </div>
        </form>
      </AnimatedModal>
    </PageEntrance>
  );
}

export default function InstructorExercisesPage(): React.ReactElement {
  return (
    <InstructorShell>
      <InstructorExercisesContent />
    </InstructorShell>
  );
}
