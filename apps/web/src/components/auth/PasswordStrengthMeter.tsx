'use client';

import React from 'react';
import { Check, Circle } from 'lucide-react';
import { getPasswordStrength } from '../../lib/validation';

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({
  password
}: PasswordStrengthMeterProps): React.ReactElement | null {
  if (!password) return null;
  const strength = getPasswordStrength(password);

  const barColors = [
    'bg-zinc-200',
    'bg-rose-500',
    'bg-amber-500',
    'bg-emerald-500',
    'bg-emerald-600'
  ] as const;
  const activeColor = barColors[strength.score];

  const labelTone =
    strength.score <= 1
      ? 'text-rose-700'
      : strength.score === 2
        ? 'text-amber-800'
        : 'text-emerald-700';

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-zinc-200/70 bg-white/60 p-2.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="font-semibold text-zinc-600">Password strength</span>
        <span className={`font-bold ${labelTone}`}>{strength.label}</span>
      </div>

      <div className="grid grid-cols-4 gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((segment) => (
          <div
            key={segment}
            className={`h-1.5 rounded-full transition-colors duration-200 ${
              strength.score >= segment ? activeColor : 'bg-zinc-200/80'
            }`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {[
          { ok: strength.checks.minLength, label: '8+ characters' },
          { ok: strength.checks.hasLetter, label: 'English letter' },
          { ok: strength.checks.hasNumber, label: 'Number' },
          { ok: strength.checks.hasExtra, label: 'Mixed case / symbol' }
        ].map((item) => (
          <span
            key={item.label}
            className={`inline-flex items-center gap-1 ${
              item.ok ? 'font-medium text-emerald-700' : 'text-zinc-500'
            }`}
          >
            {item.ok ? (
              <Check className="h-3 w-3 shrink-0" />
            ) : (
              <Circle className="h-2.5 w-2.5 shrink-0 opacity-50" />
            )}
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
