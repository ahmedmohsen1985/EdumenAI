'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { ReportView } from '../../../components/ReportView';

export default function ReportDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  if (!id) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-sm text-slate-600">
        Invalid report ID.
      </div>
    );
  }

  return <ReportView reportId={id} />;
}
