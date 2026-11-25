'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, LogOut } from 'lucide-react';
import { changeMyPassword } from '../../lib/api';
import { Banner, Field, SectionTitle, errorMessage } from './shared';

export interface SecurityTabProps {
  onLogout: () => Promise<void>;
}

export function SecurityTab({ onLogout }: SecurityTabProps): React.ReactElement {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSuccess(null);
    setError(null);

    if (currentPassword.length === 0) {
      setError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Your new password must be at least 8 characters long.');
      return;
    }
    if (newPassword.length > 128) {
      setError('Your new password must be 128 characters or fewer.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await changeMyPassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Your password has been updated.');
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not change your password. Please check your current password.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setSigningOut(true);
    try {
      await onLogout();
      router.replace('/login');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={(event) => {
          void handlePasswordSubmit(event);
        }}
        className="glass-panel space-y-5 p-5 sm:p-6"
        noValidate
      >
        <SectionTitle
          title="Change password"
          description="Choose a strong password with at least 8 characters."
        />

        {success ? <Banner kind="success">{success}</Banner> : null}
        {error ? <Banner kind="error">{error}</Banner> : null}

        <div className="grid max-w-xl gap-4">
          <Field id="security-current-password" label="Current Password">
            <input
              id="security-current-password"
              type="password"
              className="glass-input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <Field
            id="security-new-password"
            label="New Password"
            hint="Minimum 8 characters."
          >
            <input
              id="security-new-password"
              type="password"
              className="glass-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </Field>

          <Field id="security-confirm-password" label="Confirm New Password">
            <input
              id="security-confirm-password"
              type="password"
              className="glass-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
          </Field>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="glass-btn-primary" disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>

      <section className="glass-panel flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-zinc-900">Sign out</h2>
          <p className="mt-1 text-sm text-zinc-600">
            End your current session on this browser. You can sign back in at any time.
          </p>
        </div>
        <button
          type="button"
          className="glass-btn-secondary shrink-0"
          disabled={signingOut}
          onClick={() => {
            void handleSignOut();
          }}
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="h-4 w-4" aria-hidden="true" />
          )}
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  );
}
