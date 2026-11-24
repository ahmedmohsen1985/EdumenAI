import React from 'react';
import { GraduationCap, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { ExercisesHub } from '../components/ExercisesHub';
import { PageEntrance } from '../components/ui/MotionPrimitives';

export default function HomePage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageEntrance>
        <section className="glass-panel-strong relative mb-10 overflow-hidden px-6 py-10 sm:px-10 sm:py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-white via-zinc-200/60 to-transparent blur-2xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 left-1/4 h-64 w-64 rounded-full bg-zinc-300/30 blur-3xl"
          />
          <div className="relative max-w-3xl">
            <div className="glass-pill">
              <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
              Oxford AQA IGCSE ESL (9280)
            </div>
            <h1 className="mt-5 text-3xl font-extrabold leading-[1.1] tracking-tight text-zinc-950 sm:text-5xl">
              EdumenAI Student
              <br />
              <span className="bg-gradient-to-r from-zinc-900 via-zinc-600 to-zinc-400 bg-clip-text text-transparent">
                Assessment Portal
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
              Select a skill below to complete interactive exercises with instant handwriting OCR,
              examiner-grade marking, and downloadable PDF reports.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="glass-pill">
                <Zap className="h-3.5 w-3.5 text-zinc-500" />
                Instant OCR
              </span>
              <span className="glass-pill">
                <GraduationCap className="h-3.5 w-3.5 text-zinc-500" />
                Examiner-grade marking
              </span>
              <span className="glass-pill">
                <ShieldCheck className="h-3.5 w-3.5 text-zinc-500" />
                PDF reports
              </span>
            </div>
          </div>
        </section>
      </PageEntrance>

      <ExercisesHub />
    </div>
  );
}
