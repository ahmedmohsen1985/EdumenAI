import type React from 'react';
import { AdminShell } from '../../components/admin/AdminShell';

export default function AdminLayout({
  children
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <AdminShell>{children}</AdminShell>;
}
