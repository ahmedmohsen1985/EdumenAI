import React from 'react';
import { ExercisesHub } from '../../components/ExercisesHub';

export default function ExercisesPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">All Exercises</h1>
        <p className="mt-1 text-sm text-slate-600">
          Browse published exercises across Writing, Reading, Listening, and Speaking.
        </p>
      </div>
      <ExercisesHub />
    </div>
  );
}
