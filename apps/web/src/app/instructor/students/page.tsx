'use client';

import React from 'react';
import { useAuth } from '../../../components/auth/AuthProvider';
import { InstructorShell } from '../../../components/instructor/InstructorShell';
import { InstructorStudentsTab } from '../../../components/profile/InstructorStudentsTab';
import { PageEntrance } from '../../../components/ui/MotionPrimitives';

function InstructorStudentsContent(): React.ReactElement {
  const { user, refreshAuth } = useAuth();

  return (
    <PageEntrance className="space-y-6">
      <div>
        <span className="glass-pill">Class Roster</span>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-3xl">
          My Students &amp; Enrollment Requests
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Approve student requests to unlock your custom exercises and receive their submissions.
        </p>
      </div>

      {user && (
        <InstructorStudentsTab accountStatus={user.accountStatus} onChanged={refreshAuth} />
      )}
    </PageEntrance>
  );
}

export default function InstructorStudentsPage(): React.ReactElement {
  return (
    <InstructorShell>
      <InstructorStudentsContent />
    </InstructorShell>
  );
}
