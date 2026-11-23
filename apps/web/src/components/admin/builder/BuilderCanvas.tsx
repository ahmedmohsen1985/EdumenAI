'use client';

import type React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getBlock } from '@edumenai/blocks';
import type { TemplateBlock } from '@edumenai/shared';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Layers,
  Lock,
  Sparkles,
  Trash2
} from 'lucide-react';

interface BuilderCanvasProps {
  blocks: TemplateBlock[];
  selectedBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  onDuplicateBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
}

function SortableBlockItem({
  block,
  index,
  total,
  isSelected,
  onSelect,
  onMove,
  onDuplicate,
  onDelete
}: {
  block: TemplateBlock;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: {
      source: 'canvas',
      blockId: block.id
    }
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  const definition = getBlock(block.type);
  const boundPromptKey = block.bindings?.promptKey;
  const boundPromptKeys = block.bindings?.promptKeys ?? [];
  const isLocked = Boolean(block.props?.locked);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`rounded-xl border p-3.5 transition ${
        isDragging ? 'opacity-40' : ''
      } ${
        isSelected
          ? 'border-brand-navy bg-brand-cream/40 ring-2 ring-brand-navy/15'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing"
            title="Drag to reorder"
            aria-label={`Drag ${block.label || block.type}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>

          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded bg-brand-navy px-2 py-0.5 text-[11px] font-bold text-brand-gold">
                {definition?.name ?? block.type}
              </span>
              <span className="text-sm font-bold text-slate-900">
                {block.label || '(No label)'}
              </span>
              {block.required && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200">
                  Required
                </span>
              )}
              {isLocked && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  <Lock className="h-2.5 w-2.5" />
                  Locked
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span>
                Section: <strong className="text-slate-700">{block.section || 'General'}</strong>
              </span>
              <span>·</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                {block.width}
              </span>
              {block.fieldKey && (
                <>
                  <span>·</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700">
                    key: {block.fieldKey}
                  </span>
                </>
              )}
            </div>

            {(boundPromptKey || boundPromptKeys.length > 0) && (
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                <Sparkles className="h-3 w-3 text-brand-gold" />
                {boundPromptKey && (
                  <span className="rounded-md bg-brand-cream px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-navy border border-brand-gold/30">
                    {boundPromptKey}
                  </span>
                )}
                {boundPromptKeys.map((pk) => (
                  <span
                    key={pk}
                    className="rounded-md bg-brand-cream px-2 py-0.5 font-mono text-[10px] font-semibold text-brand-navy border border-brand-gold/30"
                  >
                    {pk}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row Actions */}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={index === 0}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-navy disabled:opacity-30"
            title="Move up"
            aria-label="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={index === total - 1}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-navy disabled:opacity-30"
            title="Move down"
            aria-label="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-navy"
            title="Duplicate block"
            aria-label="Duplicate block"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
            title="Delete block"
            aria-label="Delete block"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function BuilderCanvas({
  blocks,
  selectedBlockId,
  onSelectBlock,
  onMoveBlock,
  onDuplicateBlock,
  onDeleteBlock
}: BuilderCanvasProps): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: 'builder-canvas'
  });

  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[480px] rounded-2xl border-2 p-4 transition ${
        isOver
          ? 'border-brand-gold bg-brand-cream/40'
          : 'border-dashed border-slate-200 bg-slate-50/70'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-brand-navy">Template Canvas</h2>
          <p className="text-xs text-slate-500">
            {sortedBlocks.length} {sortedBlocks.length === 1 ? 'block' : 'blocks'} · Drag to
            reorder or click a block to configure
          </p>
        </div>
      </div>

      {sortedBlocks.length === 0 ? (
        <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/80 p-6 text-center">
          <Layers className="h-9 w-9 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">Canvas is empty</p>
          <p className="mt-1 text-xs text-slate-500">
            Drag blocks from the left palette or click &quot;+ Add&quot; to build your assessment.
          </p>
        </div>
      ) : (
        <SortableContext
          items={sortedBlocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2.5">
            {sortedBlocks.map((block, idx) => (
              <SortableBlockItem
                key={block.id}
                block={block}
                index={idx}
                total={sortedBlocks.length}
                isSelected={block.id === selectedBlockId}
                onSelect={() => onSelectBlock(block.id)}
                onMove={(dir) => onMoveBlock(block.id, dir)}
                onDuplicate={() => onDuplicateBlock(block.id)}
                onDelete={() => onDeleteBlock(block.id)}
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
