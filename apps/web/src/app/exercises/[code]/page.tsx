'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { ExerciseRunner } from '../../../components/ExerciseRunner';

export default function DynamicExercisePage(): React.ReactElement {
  const params = useParams<{ code: string }>();
  const code = typeof params.code === 'string' ? params.code : '';

  if (!code) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-sm text-slate-600">
        Invalid exercise code.
      </div>
    );
  }

  return <ExerciseRunner code={code} />;
}
