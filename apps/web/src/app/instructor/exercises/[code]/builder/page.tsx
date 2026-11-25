'use client';

import type React from 'react';
import { useParams } from 'next/navigation';
import { ExerciseBuilderWorkspace } from '../../../../../components/admin/builder/ExerciseBuilderWorkspace';
import { InstructorShell } from '../../../../../components/instructor/InstructorShell';

export default function InstructorExerciseBuilderPage(): React.ReactElement {
  const params = useParams<{ code: string }>();
  const code = typeof params.code === 'string' ? decodeURIComponent(params.code) : '';

  return (
    <InstructorShell>
      <ExerciseBuilderWorkspace code={code} mode="instructor" />
    </InstructorShell>
  );
}
