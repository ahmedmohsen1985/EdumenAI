'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  QrCode,
  ShieldCheck,
  Smartphone,
  Trash2
} from 'lucide-react';
import {
  beginTotpSetup,
  changeMyPassword,
  confirmTotpSetup,
  disableTotp,
  revokeTrustedDevices
} from '../../lib/api';
import { validateStrongPassword } from '../../lib/validation';
import { useAuth } from '../auth/AuthProvider';
import { PasswordStrengthMeter } from '../auth/PasswordStrengthMeter';
import { Banner, Field, SectionTitle, errorMessage } from './shared';

export interface SecurityTabProps {
  onLogout: () => Promise<void>;
}

export function SecurityTab({ onLogout }: SecurityTabProps): React.ReactElement {
  const router = useRouter();
  const { user, refreshAuth } = useAuth();

  // Change Password
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  // Two-Factor Auth (TOTP wizard & Trusted Devices)
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState<string>('');
  const [totpBusy, setTotpBusy] = useState<boolean>(false);
  const [secretCopied, setSecretCopied] = useState<boolean>(false);
  const [showDisableTotp, setShowDisableTotp] = useState<boolean>(false);
  const [disablePassword, setDisablePassword] = useState<string>('');
  const [revokingDevices, setRevokingDevices] = useState<boolean>(false);
  const [twoFaSuccess, setTwoFaSuccess] = useState<string | null>(null);
  const [twoFaError, setTwoFaError] = useState<string | null>(null);

  const twoFactorMethod = user?.twoFactorMethod ?? 'EMAIL_OTP';
  const isTotpActive = twoFactorMethod === 'TOTP';

  const newPasswordError = newPassword ? validateStrongPassword(newPassword) : null;
  const confirmMismatch =
    confirmPassword.length > 0 && confirmPassword !== newPassword
      ? 'Passwords do not match.'
      : null;

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setSuccess(null);
    setError(null);

    if (currentPassword.length === 0) {
      setError('Please enter your current password.');
      return;
    }
    const pwErr = validateStrongPassword(newPassword);
    if (pwErr) {
      setError(pwErr);
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
      setError(
        errorMessage(err, 'Could not change your password. Please check your current password.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBeginTotpSetup = async (): Promise<void> => {
    setTwoFaError(null);
    setTwoFaSuccess(null);
    setTotpBusy(true);
    try {
      const setup = await beginTotpSetup();
      const qrDataUrl = await QRCode.toDataURL(setup.otpauthUri, {
        width: 220,
        margin: 1,
        color: { dark: '#18181b', light: '#ffffff' }
      });
      setTotpSecret(setup.secret);
      setTotpQrDataUrl(qrDataUrl);
      setTotpCode('');
      setShowDisableTotp(false);
    } catch (err: unknown) {
      setTwoFaError(errorMessage(err, 'Unable to initialize Authenticator App setup.'));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleConfirmTotp = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setTwoFaError(null);
    setTwoFaSuccess(null);

    const cleaned = totpCode.replace(/\D/g, '').slice(0, 6);
    if (cleaned.length !== 6) {
      setTwoFaError('Enter the 6-digit code shown in your Authenticator App.');
      return;
    }

    setTotpBusy(true);
    try {
      await confirmTotpSetup(cleaned);
      await refreshAuth();
      setTotpSecret(null);
      setTotpQrDataUrl(null);
      setTotpCode('');
      setTwoFaSuccess(
        'Authenticator App enabled! Future untrusted sign-ins will use your authenticator code.'
      );
    } catch (err: unknown) {
      setTwoFaError(errorMessage(err, 'Invalid authenticator code. Please try again.'));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleDisableTotp = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setTwoFaError(null);
    setTwoFaSuccess(null);

    if (!disablePassword) {
      setTwoFaError('Enter your current password to switch back to Email OTP.');
      return;
    }

    setTotpBusy(true);
    try {
      await disableTotp(disablePassword);
      await refreshAuth();
      setDisablePassword('');
      setShowDisableTotp(false);
      setTwoFaSuccess('Switched back to Email OTP for two-factor verification.');
    } catch (err: unknown) {
      setTwoFaError(errorMessage(err, 'Unable to switch back to Email OTP.'));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleCopySecret = async (): Promise<void> => {
    if (!totpSecret) return;
    try {
      await navigator.clipboard.writeText(totpSecret);
      setSecretCopied(true);
      window.setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      // Ignore clipboard permission failure
    }
  };

  const handleRevokeDevices = async (): Promise<void> => {
    setTwoFaError(null);
    setTwoFaSuccess(null);
    setRevokingDevices(true);
    try {
      const res = await revokeTrustedDevices();
      setTwoFaSuccess(
        res.revokedCount > 0
          ? `Revoked ${res.revokedCount} trusted device${res.revokedCount === 1 ? '' : 's'}. Next sign-in will require a 2FA code.`
          : 'No active trusted devices found.'
      );
    } catch (err: unknown) {
      setTwoFaError(errorMessage(err, 'Unable to revoke trusted devices.'));
    } finally {
      setRevokingDevices(false);
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
      {/* Two-Factor Authentication (2FA) Management Card */}
      <section className="glass-panel space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle
            title="Two-Factor Authentication (2FA)"
            description="Every EdumenAI account is protected by mandatory 2FA on untrusted devices."
          />
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50/85 px-3 py-1 text-xs font-semibold text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            {isTotpActive ? 'Authenticator App' : 'Email OTP'} Active
          </span>
        </div>

        {twoFaSuccess ? <Banner kind="success">{twoFaSuccess}</Banner> : null}
        {twoFaError ? <Banner kind="error">{twoFaError}</Banner> : null}

        <div className="flex flex-col justify-between gap-4 rounded-xl border border-zinc-900/[0.06] bg-white/60 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white">
              {isTotpActive ? <Smartphone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            </span>
            <div>
              <p className="text-sm font-bold text-zinc-950">
                {isTotpActive ? 'Authenticator App (TOTP)' : 'Email One-Time Passcode'}
              </p>
              <p className="mt-0.5 text-xs text-zinc-600">
                {isTotpActive
                  ? 'Using Google Authenticator, Microsoft Authenticator, or any TOTP app for 6-digit login codes.'
                  : 'Codes are emailed to your verified address. Upgrade to an Authenticator App for instant offline codes.'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!isTotpActive && !totpSecret && (
              <button
                type="button"
                disabled={totpBusy}
                onClick={() => void handleBeginTotpSetup()}
                className="glass-btn-primary !py-2 !text-xs"
              >
                {totpBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <QrCode className="h-3.5 w-3.5" />
                )}
                Enable Authenticator App
              </button>
            )}

            {isTotpActive && !showDisableTotp && (
              <button
                type="button"
                disabled={totpBusy}
                onClick={() => {
                  setTwoFaError(null);
                  setShowDisableTotp(true);
                }}
                className="glass-btn-secondary !py-2 !text-xs"
              >
                Switch Back to Email OTP
              </button>
            )}
          </div>
        </div>

        {/* Offline QR Code TOTP Setup Wizard */}
        {totpSecret && totpQrDataUrl && (
          <form
            onSubmit={(e) => void handleConfirmTotp(e)}
            className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white/75 p-5 shadow-sm"
            noValidate
          >
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <div className="shrink-0 self-center rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-sm sm:self-start">
                <img
                  src={totpQrDataUrl}
                  alt="Scan this QR code with your authenticator app"
                  className="h-44 w-44"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-950">
                    Scan with Google or Microsoft Authenticator
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-600">
                    Open your authenticator app, scan the QR code, or copy the setup key below. Then
                    enter the 6-digit code generated by your app to confirm.
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Manual Setup Key
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 font-mono text-xs font-semibold text-zinc-900">
                      {totpSecret}
                    </code>
                    <button
                      type="button"
                      onClick={() => void handleCopySecret()}
                      className="glass-btn-secondary !px-3 !py-2 !text-xs"
                    >
                      {secretCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="max-w-xs space-y-1">
                  <label
                    htmlFor="totp-confirm-code"
                    className="text-xs font-semibold text-zinc-600"
                  >
                    6-Digit Authenticator Code
                  </label>
                  <input
                    id="totp-confirm-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="glass-input text-center font-mono text-base font-bold tracking-[0.35em]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={totpBusy || totpCode.length !== 6}
                    className="glass-btn-primary !py-2 !text-xs"
                  >
                    {totpBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    Confirm &amp; Activate
                  </button>
                  <button
                    type="button"
                    disabled={totpBusy}
                    onClick={() => {
                      setTotpSecret(null);
                      setTotpQrDataUrl(null);
                      setTotpCode('');
                    }}
                    className="glass-btn-secondary !py-2 !text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Switch Back to Email OTP confirmation */}
        {showDisableTotp && isTotpActive && (
          <form
            onSubmit={(e) => void handleDisableTotp(e)}
            className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/70 p-4"
            noValidate
          >
            <p className="text-xs font-semibold text-amber-950">
              Confirm your current password to switch 2FA back to Email OTP:
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="password"
                autoComplete="current-password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Current password"
                aria-label="Current password to disable authenticator app"
                className="glass-input sm:max-w-xs"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={totpBusy || !disablePassword}
                  className="glass-btn-primary !py-2 !text-xs"
                >
                  {totpBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Confirm Switch
                </button>
                <button
                  type="button"
                  disabled={totpBusy}
                  onClick={() => {
                    setShowDisableTotp(false);
                    setDisablePassword('');
                  }}
                  className="glass-btn-secondary !py-2 !text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Revoke Trusted Devices */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900/[0.06] pt-4">
          <div>
            <p className="text-xs font-bold text-zinc-900">Trusted Devices (30-Day Remember)</p>
            <p className="text-xs text-zinc-500">
              Sign out all remembered browsers so every new login prompts for a 2FA code.
            </p>
          </div>
          <button
            type="button"
            disabled={revokingDevices}
            onClick={() => void handleRevokeDevices()}
            className="glass-btn-secondary !py-2 !text-xs"
          >
            {revokingDevices ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Revoke All Trusted Devices
          </button>
        </div>
      </section>

      {/* Change Password */}
      <form
        onSubmit={(event) => {
          void handlePasswordSubmit(event);
        }}
        className="glass-panel space-y-5 p-5 sm:p-6"
        noValidate
      >
        <SectionTitle
          title="Change password"
          description="Choose a strong password with at least 8 characters including letters and numbers."
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
            hint="Minimum 8 characters with English letters and numbers."
          >
            <input
              id="security-new-password"
              type="password"
              className={`glass-input ${newPasswordError ? '!border-rose-300' : ''}`}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            <PasswordStrengthMeter password={newPassword} />
            {newPasswordError && (
              <p className="mt-1 text-xs font-medium text-rose-700">{newPasswordError}</p>
            )}
          </Field>

          <Field id="security-confirm-password" label="Confirm New Password">
            <input
              id="security-confirm-password"
              type="password"
              className={`glass-input ${confirmMismatch ? '!border-rose-300' : ''}`}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              required
            />
            {confirmMismatch && (
              <p className="mt-1 text-xs font-medium text-rose-700">{confirmMismatch}</p>
            )}
          </Field>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="glass-btn-primary"
            disabled={saving || Boolean(newPasswordError) || Boolean(confirmMismatch)}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            )}
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>

      {/* Sign Out */}
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
