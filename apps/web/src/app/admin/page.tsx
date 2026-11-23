import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Blocks,
  Bot,
  FileCode2,
  MessageSquare,
  Sparkles
} from 'lucide-react';

const UPCOMING_MODULES = [
  {
    title: 'Exercises & Lego Template Builder',
    description:
      'Drag-and-drop block studio for Writing, Reading, Listening, and Speaking exercises with draft/publish versioning.',
    icon: Blocks
  },
  {
    title: 'Global Prompt Manager',
    description:
      'Versioned system prompts, OCR extraction prompts, and structured JSON output schemas.',
    icon: FileCode2
  },
  {
    title: 'AI Providers & Audio/Whisper Routing',
    description:
      'Configure Google, OpenAI, Anthropic, and OpenRouter keys with per-task routing for vision, evaluation, and audio.',
    icon: Bot
  },
  {
    title: 'Telegram Bot & Multi-Group Targets',
    description:
      'Manage encrypted bot credentials, default teacher groups, and live test message delivery.',
    icon: MessageSquare
  }
];

export default function AdminStudioPlaceholderPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 space-y-6">
      <div className="rounded-2xl border border-brand-gold/40 bg-brand-navy p-7 text-white shadow-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/20 px-3 py-1 text-xs font-semibold text-brand-gold">
          <Sparkles className="h-3.5 w-3.5" />
          Step E Preview
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">EdumenAI Admin Studio</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
          The full Admin Studio UI for building dynamic Lego exercise templates, managing prompts,
          routing AI providers, and configuring Telegram targets is arriving in Step E.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/exercises"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-gold px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-brand-goldLight"
          >
            Open Exercises Hub
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
          >
            View Reports Archive
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {UPCOMING_MODULES.map((mod) => {
          const Icon = mod.icon;
          return (
            <div
              key={mod.title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cream text-brand-navy border border-brand-gold/40">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-3 text-base font-bold text-brand-navy">{mod.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{mod.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
