'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, FileText, Settings, Sparkles } from 'lucide-react';

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
    <header className="sticky top-0 z-40 border-b-2 border-brand-gold bg-brand-navy text-white shadow-sm print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gold/20 border border-brand-gold/50 text-brand-gold transition-colors group-hover:bg-brand-gold group-hover:text-brand-navy">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-base font-bold tracking-tight text-white">
              Edumen<span className="text-brand-gold">AI</span>
            </div>
            <div className="text-[11px] font-medium text-slate-300">
              Oxford AQA Assessment Platform
            </div>
          </div>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main navigation">
          {NAV_LINKS.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.matchPrefix}/`) ||
              (item.href === '/exercises' && pathname === '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-gold text-brand-navy shadow-sm'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
