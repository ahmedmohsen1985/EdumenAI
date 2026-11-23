'use client';

import type React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TemplateBlock, TemplateConfig } from '@edumenai/shared';
import { getBlock } from './registry.js';
import type { BlockRuntimeContext } from './types.js';

interface SectionGroup {
  title: string;
  blocks: TemplateBlock[];
}

function groupBlocksBySection(blocks: readonly TemplateBlock[]): SectionGroup[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const sectionMap = new Map<string, TemplateBlock[]>();
  const orderedTitles: string[] = [];

  for (const block of sorted) {
    const title = block.section?.trim() || 'General';
    const existing = sectionMap.get(title);
    if (existing) {
      existing.push(block);
    } else {
      sectionMap.set(title, [block]);
      orderedTitles.push(title);
    }
  }

  return orderedTitles.map((title) => ({
    title,
    blocks: sectionMap.get(title) ?? []
  }));
}

export function TemplateRenderer({
  template,
  ctx
}: {
  template: TemplateConfig;
  ctx: BlockRuntimeContext;
}): React.ReactElement {
  const sections = groupBlocksBySection(template.blocks);

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section
          key={section.title}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 border-b border-slate-100 pb-3 text-base font-semibold text-brand-navy">
            {section.title}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {section.blocks.map((block) => {
              const colSpanClass = block.width === 'half' ? 'md:col-span-1' : 'md:col-span-2';
              const definition = getBlock(block.type);

              if (!definition) {
                return (
                  <div
                    key={block.id}
                    className={`${colSpanClass} flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800`}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Unknown block plugin: {block.type}</span>
                  </div>
                );
              }

              const RuntimeComponent = definition.RuntimeComponent;
              return (
                <div key={block.id} className={colSpanClass}>
                  <RuntimeComponent block={block} ctx={ctx} />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
