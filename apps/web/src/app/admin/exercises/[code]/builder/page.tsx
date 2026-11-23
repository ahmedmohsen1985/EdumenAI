'use client';

import type React from 'react';
import { useParams } from 'next/navigation';
import { ExerciseBuilderWorkspace } from '../../../../../components/admin/builder/ExerciseBuilderWorkspace';

export default function AdminExerciseBuilderPage(): React.ReactElement {
  const params = useParams<{ code: string }>();
  const code = typeof params.code === 'string' ? decodeURIComponent(params.code) : '';

  return <ExerciseBuilderWorkspace code={code} />;
}
