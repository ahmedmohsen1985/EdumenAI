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

export interface DropIndicator {
  targetId: string | 'canvas-end';
  position: 'before' | 'after';
}

interface BuilderCanvasProps {
  blocks: TemplateBlock[];
  selectedBlockId: string | null;
  dropIndicator?: DropIndicator | null;
  isPaletteDragging?: boolean;
  onSelectBlock: (id: string) => void;
  onMoveBlock: (id: string, direction: 'up' | 'down') => void;
  onDuplicateBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
}

function InsertionLine({
  position
}: {
  position: 'before' | 'after' | 'end';
}): React.ReactElement {
  const positionClass =
    position === 'before'
      ? 'absolute -top-2 inset-x-1 z-20'
      : position === 'after'
        ? 'absolute -bottom-2 inset-x-1 z-20'
        : 'absolute inset-x-1 top-1/2 -translate-y-1/2 z-20';

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none flex items-center ${positionClass}`}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-900 shadow-sm ring-2 ring-white" />
      <div className="insertion-line-glow flex-1" />
      <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-900 shadow-sm ring-2 ring-white" />
    </div>
  );
}

function SortableBlockItem({
  block,
  index,
  total,
  isSelected,
  showBeforeLine,
  showAfterLine,
  onSelect,
  onMove,
  onDuplicate,
  onDelete
}: {
  block: TemplateBlock;
  index: number;
  total: number;
  isSelected: boolean;
  showBeforeLine: boolean;
  showAfterLine: boolean;
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

  // Only dnd-kit owns transform/transition on this outer wrapper; no CSS transition classes here.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition
  };

  const definition = getBlock(block.type);
  const boundPromptKey = block.bindings?.promptKey;
  const boundPromptKeys = block.bindings?.promptKeys ?? [];
  const isLocked = Boolean(block.props?.locked);

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {showBeforeLine && <InsertionLine position="before" />}

      <div
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`rounded-xl border p-3.5 transition-colors transition-shadow duration-150 ${
          isDragging
            ? 'border-dashed border-zinc-400/70 bg-white/40 opacity-30 ring-1 ring-zinc-300/50'
            : isSelected
              ? 'border-zinc-900/80 bg-white/95 shadow-glass ring-2 ring-zinc-900/10'
              : 'border-white/80 bg-white/75 shadow-sm backdrop-blur-md hover:border-zinc-300/90 hover:bg-white/90'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 cursor-grab select-none rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-900/10 hover:text-zinc-800 active:cursor-grabbing"
              title="Drag to reorder"
              aria-label={`Drag ${block.label || block.type}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[11px] font-bold text-white">
                  {definition?.name ?? block.type}
                </span>
                <span className="text-sm font-bold text-zinc-900">
                  {block.label || '(No label)'}
                </span>
                {block.required && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                    Required
                  </span>
                )}
                {isLocked && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <Lock className="h-2.5 w-2.5" />
                    Locked
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500">
                <span>
                  Section: <strong className="text-zinc-700">{block.section || 'General'}</strong>
                </span>
                <span>·</span>
                <span className="rounded border border-zinc-200/70 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700">
                  {block.width}
                </span>
                {block.fieldKey && (
                  <>
                    <span>·</span>
                    <span className="rounded border border-zinc-200/70 bg-zinc-100/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700">
                      key: {block.fieldKey}
                    </span>
                  </>
                )}
              </div>

              {(boundPromptKey || boundPromptKeys.length > 0) && (
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <Sparkles className="h-3 w-3 text-zinc-600" />
                  {boundPromptKey && (
                    <span className="rounded-md border border-zinc-300/70 bg-zinc-100/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-800">
                      {boundPromptKey}
                    </span>
                  )}
                  {boundPromptKeys.map((pk) => (
                    <span
                      key={pk}
                      className="rounded-md border border-zinc-300/70 bg-zinc-100/90 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-800"
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
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900/10 hover:text-zinc-900 disabled:opacity-30"
              title="Move up"
              aria-label="Move up"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onMove('down')}
              disabled={index === total - 1}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900/10 hover:text-zinc-900 disabled:opacity-30"
              title="Move down"
              aria-label="Move down"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDuplicate}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-900/10 hover:text-zinc-900"
              title="Duplicate block"
              aria-label="Duplicate block"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
              title="Delete block"
              aria-label="Delete block"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showAfterLine && <InsertionLine position="after" />}
    </div>
  );
}

export function BuilderCanvas({
  blocks,
  selectedBlockId,
  dropIndicator = null,
  isPaletteDragging = false,
  onSelectBlock,
  onMoveBlock,
  onDuplicateBlock,
  onDeleteBlock
}: BuilderCanvasProps): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: 'builder-canvas'
  });

  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
  const showCanvasDropActive = isOver || dropIndicator !== null;

  return (
    <div
      ref={setNodeRef}
      className={`glass-panel min-h-[480px] rounded-2xl p-4 transition-colors duration-150 ${
        showCanvasDropActive
          ? 'border-zinc-400/80 bg-white/85 ring-1 ring-zinc-900/10'
          : isPaletteDragging
            ? 'border-dashed border-zinc-400/70'
            : ''
      }`}
    >
      <div className="mb-3 flex items-center justify-between border-b border-zinc-200/70 pb-3">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-zinc-900">Template Canvas</h2>
          <p className="text-xs text-zinc-500">
            {sortedBlocks.length} {sortedBlocks.length === 1 ? 'block' : 'blocks'} · Drag to
            reorder or click a block to configure
          </p>
        </div>
      </div>

      {sortedBlocks.length === 0 ? (
        <div
          className={`relative flex h-80 flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center backdrop-blur-sm transition-colors duration-150 ${
            showCanvasDropActive
              ? 'border-zinc-900/50 bg-white/80'
              : 'border-zinc-300/80 bg-white/55'
          }`}
        >
          {dropIndicator?.targetId === 'canvas-end' && (
            <div className="pointer-events-none absolute inset-x-6 top-6">
              <InsertionLine position="end" />
            </div>
          )}
          <Layers className="h-9 w-9 text-zinc-300" />
          <p className="mt-2 text-sm font-semibold text-zinc-800">Canvas is empty</p>
          <p className="mt-1 text-xs text-zinc-500">
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
                showBeforeLine={
                  dropIndicator?.targetId === block.id && dropIndicator.position === 'before'
                }
                showAfterLine={
                  dropIndicator?.targetId === block.id && dropIndicator.position === 'after'
                }
                onSelect={() => onSelectBlock(block.id)}
                onMove={(dir) => onMoveBlock(block.id, dir)}
                onDuplicate={() => onDuplicateBlock(block.id)}
                onDelete={() => onDeleteBlock(block.id)}
              />
            ))}
          </div>
          <div className="relative mt-2 h-2.5">
            {dropIndicator?.targetId === 'canvas-end' && <InsertionLine position="end" />}
          </div>
        </SortableContext>
      )}
    </div>
  );
}
