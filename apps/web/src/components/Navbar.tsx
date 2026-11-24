'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, FileText, Settings, Sparkles } from 'lucide-react';
import { SlidingTabButton } from './ui/MotionPrimitives';

interface NavLinkItem {
  href: string;
  label: string;
  matchPrefix: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_LINKS: NavLinkItem[] = [
  {
    href: '/exercises',
    label: 'Exercises',
    matchPrefix: '/exercises',
    icon: BookOpen
  },
  {
    href: '/reports',
    label: 'Reports',
    matchPrefix: '/reports',
    icon: FileText
  },
  {
    href: '/admin',
    label: 'Admin Studio',
    matchPrefix: '/admin',
    icon: Settings
  }
];

export function Navbar(): React.ReactElement {
  const pathname = usePathname() || '/';

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl border border-white/80 bg-white/70 px-3 py-2 shadow-glass ring-1 ring-zinc-900/[0.05] backdrop-blur-2xl sm:px-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_6px_14px_-6px_rgba(15,17,21,0.5)] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-105">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="leading-tight">
            <div className="text-base font-extrabold tracking-tight text-zinc-900">
              Edumen<span className="text-zinc-500">AI</span>
            </div>
            <div className="hidden text-[11px] font-medium text-zinc-500 sm:block">
              Oxford AQA Assessment Platform
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {NAV_LINKS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.matchPrefix}/`) ||
              (item.href === '/exercises' && pathname === '/');

            return (
              <SlidingTabButton
                key={item.href}
                href={item.href}
                layoutId="navbar-active-pill"
                isActive={isActive}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </SlidingTabButton>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
