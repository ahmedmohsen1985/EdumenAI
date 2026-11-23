'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ExerciseSkill } from '@edumenai/shared';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileEdit,
  Layers,
  Loader2,
  Plus,
  Wrench,
  X
} from 'lucide-react';
import {
  createAdminExercise,
  fetchAdminExercises,
  type AdminExerciseSummary
} from '../../lib/admin-exercises-api';

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
  const [exercises, setExercises] = useState<AdminExerciseSummary[]>([]);
  const [skillFilter, setSkillFilter] = useState<SkillFilter>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
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

  const loadExercises = async (): Promise<void> => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await fetchAdminExercises();
      setExercises(list);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load exercises.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadExercises();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Exercises &amp; Lego Builder</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage assessments across Writing, Reading, Listening, and Speaking skills.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetModal();
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-navy/90"
        >
          <Plus className="h-4 w-4 text-brand-gold" />
          Create New Exercise
        </button>
      </div>

      {/* Skill Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {SKILL_TABS.map((tab) => {
          const isActive = skillFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSkillFilter(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                isActive
                  ? 'bg-brand-navy text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  isActive
                    ? 'bg-brand-gold text-brand-navy'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {countsBySkill[tab.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-brand-navy" />
          <span className="text-sm font-medium text-slate-700">Loading exercises...</span>
        </div>
      ) : loadError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">Failed to load exercises</p>
            <p className="mt-1 text-sm">{loadError}</p>
          </div>
        </div>
      ) : filteredExercises.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Layers className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-base font-bold text-slate-800">
            No exercises in {skillFilter === 'ALL' ? 'the catalog' : skillFilter}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Create a new exercise to open the drag-and-drop Lego Template Builder.
          </p>
          <button
            type="button"
            onClick={() => {
              resetModal();
              if (skillFilter !== 'ALL') setSkill(skillFilter);
              setIsCreateOpen(true);
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90"
          >
            <Plus className="h-4 w-4 text-brand-gold" />
            Create New Exercise
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredExercises.map((ex) => (
            <div
              key={ex.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-brand-navy px-2.5 py-0.5 text-xs font-bold uppercase text-brand-gold">
                      {ex.skill}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                      {ex.code}
                    </span>
                    <span className="rounded-md bg-brand-cream px-2 py-0.5 text-xs font-semibold text-brand-navy border border-brand-gold/30">
                      {ex.totalMarks} Marks
                    </span>
                  </div>

                  <span className="text-xs font-medium text-slate-500">
                    {ex.versionCount} {ex.versionCount === 1 ? 'version' : 'versions'}
                  </span>
                </div>

                <h2 className="mt-3 text-lg font-bold text-brand-navy">{ex.title}</h2>
                {ex.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{ex.description}</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {ex.activeVersion ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Published v{ex.activeVersion.version}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                      Not Published
                    </span>
                  )}

                  {ex.latestDraft && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      <FileEdit className="h-3.5 w-3.5" />
                      Draft v{ex.latestDraft.version}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <Link
                  href={`/admin/exercises/${encodeURIComponent(ex.code)}/builder`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-navy/90"
                >
                  <Wrench className="h-4 w-4 text-brand-gold" />
                  Open Builder
                </Link>

                {ex.activeVersion && (
                  <Link
                    href={`/exercises/${encodeURIComponent(ex.code)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <span>Student View</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create New Exercise Modal */}
      {isCreateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-exercise-title"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between bg-brand-navy px-6 py-4 text-white">
              <h2 id="create-exercise-title" className="text-base font-bold">
                Create New Exercise
              </h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg p-1 text-slate-300 hover:bg-white/10 hover:text-white"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4 p-6">
              {createError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                  {createError}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="new-ex-title" className="block text-sm font-semibold text-slate-800">
                  Exercise Title *
                </label>
                <input
                  id="new-ex-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="e.g. Exercise 3 — Reading Comprehension"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="new-ex-code" className="block text-sm font-semibold text-slate-800">
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
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 font-mono text-sm text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
                  />
                  <p className="text-[11px] text-slate-500">Lowercase a-z, 0-9, and hyphens only.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="new-ex-skill" className="block text-sm font-semibold text-slate-800">
                    Skill Category *
                  </label>
                  <select
                    id="new-ex-skill"
                    value={skill}
                    onChange={(e) => setSkill(e.target.value as ExerciseSkill)}
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
                  >
                    <option value="WRITING">Writing</option>
                    <option value="READING">Reading</option>
                    <option value="LISTENING">Listening</option>
                    <option value="SPEAKING">Speaking</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new-ex-marks" className="block text-sm font-semibold text-slate-800">
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
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new-ex-desc" className="block text-sm font-semibold text-slate-800">
                  Description
                </label>
                <textarea
                  id="new-ex-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief exam overview and marking focus..."
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/15"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create &amp; Open Builder</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
