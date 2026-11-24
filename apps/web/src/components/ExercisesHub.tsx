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
import { SlidingTabButton, StaggerCard, StaggerGrid } from './ui/MotionPrimitives';

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
        className="glass-panel grid grid-cols-2 gap-1.5 p-1.5 sm:grid-cols-4"
      >
        {SKILL_TABS.map((tab) => {
          const Icon = tab.icon;
          const isSelected = tab.id === activeSkill;
          const count = countsBySkill[tab.id];

          return (
            <SlidingTabButton
              key={tab.id}
              asTab
              layoutId="skill-tab-pill"
              isActive={isSelected}
              onClick={() => setActiveSkill(tab.id)}
              className="w-full justify-between py-3 text-left"
            >
              <span className="flex items-center gap-2.5 text-sm font-semibold">
                <Icon
                  className={`h-4 w-4 transition-colors duration-200 ${
                    isSelected ? 'text-zinc-300' : 'text-zinc-500'
                  }`}
                />
                {tab.label}
              </span>
              <span
                className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold transition-colors duration-200 ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-zinc-900/[0.06] text-zinc-600'
                }`}
              >
                {count}
              </span>
            </SlidingTabButton>
          );
        })}
      </div>

      {/* Active Skill Description */}
      <div className="flex items-center justify-between border-b border-zinc-900/[0.06] pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-950">
            {activeTabMeta.label} Exercises
          </h2>
          <p className="mt-0.5 text-sm text-zinc-600">{activeTabMeta.description}</p>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200/80 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 backdrop-blur-md"
        >
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="glass-panel h-52 animate-pulse p-5">
              <div className="h-4 w-24 rounded-full bg-zinc-200/80" />
              <div className="mt-4 h-6 w-3/4 rounded-lg bg-zinc-200/80" />
              <div className="mt-3 h-12 w-full rounded-lg bg-zinc-200/50" />
              <div className="mt-6 h-10 w-full rounded-xl bg-zinc-200/80" />
            </div>
          ))}
        </div>
      ) : filteredExercises.length === 0 ? (
        /* Empty State */
        <div className="glass-panel border-dashed px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 text-zinc-500 shadow-glass ring-1 ring-zinc-900/[0.06]">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-900">
            No published {activeTabMeta.label.toLowerCase()} exercises yet
          </h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-600">
            Create and publish a {activeTabMeta.label.toLowerCase()} template in Admin Studio to
            make it available for students here.
          </p>
          <div className="mt-5">
            <Link href="/admin" className="glass-btn-secondary">
              <Settings className="h-4 w-4" />
              Open Admin Studio
            </Link>
          </div>
        </div>
      ) : (
        /* Exercise Cards */
        <StaggerGrid
          key={activeSkill}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filteredExercises.map((ex) => {
            const skillMeta = SKILL_TABS.find((t) => t.id === ex.skill) ?? SKILL_TABS[0]!;
            const SkillIcon = skillMeta.icon;
            return (
              <StaggerCard key={ex.id} className="h-full">
                <article className="glass-card flex h-full flex-col justify-between p-5">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="glass-pill">
                        <SkillIcon className="h-3.5 w-3.5 text-zinc-500" />
                        {skillMeta.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="glass-pill">{ex.totalMarks} Marks</span>
                        <span className="shrink-0 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50/80 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          v{ex.activeVersion.version}
                        </span>
                      </div>
                    </div>

                    <h3 className="mt-4 text-lg font-bold leading-snug tracking-tight text-zinc-950">
                      {ex.title}
                    </h3>
                    {ex.description && (
                      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-zinc-600">
                        {ex.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-5 border-t border-zinc-900/[0.06] pt-4">
                    <Link
                      href={`/exercises/${encodeURIComponent(ex.code)}`}
                      className="glass-btn-primary group w-full"
                    >
                      Start Exercise
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </article>
              </StaggerCard>
            );
          })}
        </StaggerGrid>
      )}
    </div>
  );
}
