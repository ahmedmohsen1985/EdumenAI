'use client';

import type React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { listBlocks, type BlockDefinition } from '@edumenai/blocks';
import {
  AlignLeft,
  ChevronDown,
  FileText,
  GripVertical,
  Plus,
  ScanText,
  Send,
  Sparkles,
  Type
} from 'lucide-react';

function renderBlockIcon(iconName: string): React.ReactElement {
  switch (iconName) {
    case 'Type':
      return <Type className="h-4 w-4" />;
    case 'ChevronDown':
      return <ChevronDown className="h-4 w-4" />;
    case 'AlignLeft':
      return <AlignLeft className="h-4 w-4" />;
    case 'FileText':
      return <FileText className="h-4 w-4" />;
    case 'ScanText':
      return <ScanText className="h-4 w-4" />;
    case 'Sparkles':
      return <Sparkles className="h-4 w-4" />;
    case 'Send':
      return <Send className="h-4 w-4" />;
    default:
      return <Type className="h-4 w-4" />;
  }
}

const CATEGORY_ORDER: ReadonlyArray<{ id: BlockDefinition['category']; title: string }> = [
  { id: 'input', title: 'Input Fields' },
  { id: 'content', title: 'Content & Instructions' },
  { id: 'ai', title: 'AI & OCR Engines' },
  { id: 'action', title: 'Actions' }
];

function DraggablePaletteCard({
  definition,
  onAdd
}: {
  definition: BlockDefinition;
  onAdd: (def: BlockDefinition) => void;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${definition.type}`,
    data: {
      source: 'palette',
      blockType: definition.type
    }
  });

  // Intentionally omit transform on the stationary palette tile: only <DragOverlay> moves.
  return (
    <div
      ref={setNodeRef}
      className={`group rounded-xl border border-white/80 bg-white/75 p-3 shadow-sm backdrop-blur-md transition-[opacity,transform,border-color,background-color,box-shadow] duration-150 hover:border-zinc-300/90 hover:bg-white/95 hover:shadow ${
        isDragging ? 'scale-[0.98] opacity-40 ring-1 ring-zinc-400/50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          {...listeners}
          {...attributes}
          className="flex min-w-0 flex-1 cursor-grab select-none items-start gap-2.5 active:cursor-grabbing"
          title="Drag onto canvas"
        >
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-900/10 bg-zinc-900/5 text-zinc-800">
            {renderBlockIcon(definition.icon)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-bold text-zinc-900">
                {definition.name}
              </span>
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500" />
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-zinc-500">
              {definition.description}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onAdd(definition)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200/80 bg-white/85 px-2 py-1 text-[11px] font-semibold text-zinc-800 shadow-sm transition-colors hover:border-zinc-900 hover:bg-zinc-900 hover:text-white"
          title={`Add ${definition.name}`}
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      </div>
    </div>
  );
}

export function BlockPalette({
  onAddBlock
}: {
  onAddBlock: (definition: BlockDefinition) => void;
}): React.ReactElement {
  const definitions = listBlocks();

  return (
    <aside className="glass-panel space-y-4 rounded-2xl p-4">
      <div className="border-b border-zinc-200/70 pb-3">
        <h2 className="text-sm font-bold tracking-tight text-zinc-900">Lego Block Palette</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Drag a block onto the canvas or click Add.
        </p>
      </div>

      <div className="space-y-4">
        {CATEGORY_ORDER.map((cat) => {
          const items = definitions.filter((d) => d.category === cat.id);
          if (items.length === 0) return null;

          return (
            <div key={cat.id} className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                {cat.title}
              </h3>
              <div className="space-y-2">
                {items.map((def) => (
                  <DraggablePaletteCard key={def.type} definition={def} onAdd={onAddBlock} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
