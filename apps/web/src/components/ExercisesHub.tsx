'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ExerciseSkill } from '@edumenai/shared';
import {
  ArrowRight,
  BookOpen,
  Headphones,
  Mic,
  PenTool,
  Settings,
  Sparkles
} from 'lucide-react';
import {
  fetchPublishedExercises,
  PUBLIC_CACHE_KEYS,
  type PublishedExerciseSummary
} from '../lib/api';
import { getCached, isCacheFresh } from '../lib/client-cache';

interface SkillTabConfig {
  id: ExerciseSkill;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SKILL_TABS: SkillTabConfig[] = [
  {
    id: 'WRITING',
    label: 'Writing',
    description: 'Articles, essays, and structured writing tasks with AI examiner marking.',
    icon: PenTool
  },
  {
    id: 'READING',
    label: 'Reading',
    description: 'Comprehension passages, inference, and summary practice.',
    icon: BookOpen
  },
  {
    id: 'LISTENING',
    label: 'Listening',
    description: 'Audio-based comprehension and note-taking tasks.',
    icon: Headphones
  },
  {
    id: 'SPEAKING',
    label: 'Speaking',
    description: 'Oral response prompts and pronunciation/fluency evaluation.',
    icon: Mic
  }
];

function isValidSkill(value: string | null): value is ExerciseSkill {
  return (
    value === 'WRITING' ||
    value === 'READING' ||
    value === 'LISTENING' ||
    value === 'SPEAKING'
  );
}

export function ExercisesHub(): React.ReactElement {
  const initialExercises =
    getCached<PublishedExerciseSummary[]>(PUBLIC_CACHE_KEYS.publishedExercises) ?? [];
  const [exercises, setExercises] = useState<PublishedExerciseSummary[]>(initialExercises);
  const [activeSkill, setActiveSkill] = useState<ExerciseSkill>('WRITING');
  const [isLoading, setIsLoading] = useState<boolean>(
    getCached<PublishedExerciseSummary[]>(PUBLIC_CACHE_KEYS.publishedExercises) === null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const skillParam = params.get('skill')?.toUpperCase() ?? null;
    if (isValidSkill(skillParam)) {
      setActiveSkill(skillParam);
    }

    const hasCached =
      getCached<PublishedExerciseSummary[]>(PUBLIC_CACHE_KEYS.publishedExercises) !== null;
    if (hasCached && isCacheFresh(PUBLIC_CACHE_KEYS.publishedExercises, 30_000)) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    if (!hasCached) {
      setIsLoading(true);
    }
    setError(null);

    void fetchPublishedExercises()
      .then((list) => {
        if (cancelled) return;
        setExercises(list);
        if (!isValidSkill(skillParam) && list.length > 0) {
          const hasWriting = list.some((ex) => ex.skill === 'WRITING');
          if (!hasWriting) {
            setActiveSkill(list[0]!.skill);
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!hasCached) {
          setError(err instanceof Error ? err.message : 'Failed to load published exercises.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const countsBySkill = useMemo(() => {
    const counts: Record<ExerciseSkill, number> = {
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

  const filteredExercises = useMemo(
    () => exercises.filter((ex) => ex.skill === activeSkill),
    [exercises, activeSkill]
  );

  const activeTabMeta = SKILL_TABS.find((t) => t.id === activeSkill) ?? SKILL_TABS[0]!;

  return (
    <div className="space-y-6">
      {/* Skill Tabs */}
      <div
        role="tablist"
        aria-label="Exercise skills"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      >
        {SKILL_TABS.map((tab) => {
          const Icon = tab.icon;
          const isSelected = tab.id === activeSkill;
          const count = countsBySkill[tab.id];

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveSkill(tab.id)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
                isSelected
                  ? 'border-brand-navy bg-brand-navy text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-brand-gold/60 hover:bg-brand-cream/40'
              }`}
            >
              <span className="flex items-center gap-2.5 font-semibold text-sm">
                <Icon
                  className={`h-4 w-4 ${isSelected ? 'text-brand-gold' : 'text-slate-500'}`}
                />
                {tab.label}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  isSelected
                    ? 'bg-brand-gold text-brand-navy'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Skill Description */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-lg font-bold text-brand-navy">{activeTabMeta.label} Exercises</h2>
          <p className="text-sm text-slate-600">{activeTabMeta.description}</p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="h-4 w-24 rounded bg-slate-200" />
              <div className="mt-3 h-6 w-3/4 rounded bg-slate-200" />
              <div className="mt-3 h-12 w-full rounded bg-slate-100" />
              <div className="mt-6 h-9 w-32 rounded-lg bg-slate-200" />
            </div>
          ))}
        </div>
      ) : filteredExercises.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cream text-brand-gold">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-brand-navy">
            No published {activeTabMeta.label.toLowerCase()} exercises yet
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Create and publish a {activeTabMeta.label.toLowerCase()} template in Admin Studio to
            make it available for students here.
          </p>
          <div className="mt-5">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-navy bg-white px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-cream"
            >
              <Settings className="h-4 w-4" />
              Open Admin Studio
            </Link>
          </div>
        </div>
      ) : (
        /* Exercise Cards */
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredExercises.map((ex) => {
            const skillMeta = SKILL_TABS.find((t) => t.id === ex.skill) ?? SKILL_TABS[0]!;
            const SkillIcon = skillMeta.icon;
            return (
              <article
                key={ex.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-brand-gold hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-cream px-2.5 py-1 text-xs font-bold text-brand-navy border border-brand-gold/40 whitespace-nowrap shrink-0">
                      <SkillIcon className="h-3.5 w-3.5 text-brand-gold" />
                      {skillMeta.label}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
                        {ex.totalMarks} Marks
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
                        v{ex.activeVersion.version}
                      </span>
                    </div>
                  </div>

                  <h3 className="mt-3 text-lg font-bold text-brand-navy">{ex.title}</h3>
                  {ex.description && (
                    <p className="mt-1.5 line-clamp-3 text-sm text-slate-600">{ex.description}</p>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  <Link
                    href={`/exercises/${encodeURIComponent(ex.code)}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-navy/90"
                  >
                    Start Exercise
                    <ArrowRight className="h-4 w-4 text-brand-gold" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
