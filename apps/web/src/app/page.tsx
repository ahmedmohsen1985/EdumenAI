import React from 'react';
import { Sparkles } from 'lucide-react';
import { ExercisesHub } from '../components/ExercisesHub';

export default function HomePage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <section className="mb-8 rounded-2xl border border-brand-gold/40 bg-brand-navy px-6 py-7 text-white shadow-sm sm:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/20 px-3 py-1 text-xs font-semibold text-brand-gold">
              <Sparkles className="h-3.5 w-3.5" />
              Oxford AQA IGCSE ESL (9280)
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              EdumenAI Student Assessment Portal
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
              Select a skill below to complete interactive exercises with instant handwriting OCR,
              examiner-grade marking, and downloadable PDF reports.
            </p>
          </div>
        </div>
      </section>

      <ExercisesHub />
    </div>
  );
}
