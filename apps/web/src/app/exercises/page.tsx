import React from 'react';
import { ExercisesHub } from '../../components/ExercisesHub';
import { PageEntrance } from '../../components/ui/MotionPrimitives';

export default function ExercisesPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageEntrance>
        <div className="mb-8">
          <div className="glass-pill">Student Portal</div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            All Exercises
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
            Browse published exercises across Writing, Reading, Listening, and Speaking.
          </p>
        </div>
      </PageEntrance>
      <ExercisesHub />
    </div>
  );
}
