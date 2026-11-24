'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Transition,
  type Variants
} from 'framer-motion';

/* -------------------------------------------------------------------------- */
/*  Spring presets                                                            */
/* -------------------------------------------------------------------------- */

/** Fast, crisp spring — tabs, pills, toggles, modals. */
export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  stiffness: 520,
  damping: 38,
  mass: 0.8
};

/** Softer spring — page entrances, cards, accordions. */
export const SPRING_GENTLE: Transition = {
  type: 'spring',
  stiffness: 220,
  damping: 26,
  mass: 0.9
};

/* -------------------------------------------------------------------------- */
/*  MotionProvider                                                            */
/* -------------------------------------------------------------------------- */

export interface MotionProviderProps {
  children: React.ReactNode;
}

/** Honors the OS "reduce motion" preference for every descendant animation. */
export function MotionProvider({ children }: MotionProviderProps): React.ReactElement {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/* -------------------------------------------------------------------------- */
/*  PageEntrance                                                              */
/* -------------------------------------------------------------------------- */

export interface PageEntranceProps {
  children: React.ReactNode;
  className?: string;
  /** Delay in seconds before the entrance starts. */
  delay?: number;
}

/** Fades + lifts its content into place on mount. */
export function PageEntrance({
  children,
  className,
  delay = 0
}: PageEntranceProps): React.ReactElement {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_GENTLE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  StaggerGrid / StaggerCard                                                 */
/* -------------------------------------------------------------------------- */

const STAGGER_CONTAINER: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 }
  }
};

const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING_GENTLE }
};

export interface StaggerGridProps {
  children: React.ReactNode;
  className?: string;
}

/** Container that staggers the entrance of its `StaggerCard` children. */
export function StaggerGrid({ children, className }: StaggerGridProps): React.ReactElement {
  return (
    <motion.div
      className={className}
      variants={STAGGER_CONTAINER}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

export interface StaggerCardProps {
  children: React.ReactNode;
  className?: string;
}

/** Child of `StaggerGrid`; inherits the staggered entrance variants. */
export function StaggerCard({ children, className }: StaggerCardProps): React.ReactElement {
  return (
    <motion.div className={className} variants={STAGGER_ITEM}>
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  AnimatedModal                                                             */
/* -------------------------------------------------------------------------- */

export interface AnimatedModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Accessible name for the dialog (use when there is no visible title). */
  ariaLabel?: string;
  /** id of the element that titles the dialog. */
  ariaLabelledBy?: string;
  /** Extra classes for the dialog surface (default: glass-panel-strong). */
  className?: string;
  /** Tailwind max-width class for the dialog surface. */
  maxWidthClassName?: string;
}

/**
 * Frosted-backdrop modal with spring scale. Closes on Escape and backdrop click.
 */
export function AnimatedModal({
  open,
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  className,
  maxWidthClassName = 'max-w-lg'
}: AnimatedModalProps): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef<() => void>(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="animated-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/25 p-4 backdrop-blur-md print:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            tabIndex={-1}
            className={`glass-panel-strong max-h-[90vh] w-full overflow-y-auto outline-none ${maxWidthClassName} ${className ?? ''}`}
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={SPRING_SNAPPY}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*  SlidingTabButton                                                          */
/* -------------------------------------------------------------------------- */

export interface SlidingTabButtonProps {
  /** Shared layout id: every tab in one group must use the same value. */
  layoutId: string;
  isActive: boolean;
  children: React.ReactNode;
  /** When set, renders a Next.js `Link` instead of a `<button>`. */
  href?: string;
  onClick?: () => void;
  className?: string;
  /** Classes for the sliding pill (default: charcoal pill). */
  pillClassName?: string;
  /** Text classes when active. */
  activeClassName?: string;
  /** Text classes when inactive. */
  inactiveClassName?: string;
  /** Set for `role="tab"` usage; also forwards `aria-selected`. */
  asTab?: boolean;
  ariaLabel?: string;
}

/** Tab / nav item whose active background pill springs between siblings. */
export function SlidingTabButton({
  layoutId,
  isActive,
  children,
  href,
  onClick,
  className = '',
  pillClassName = 'bg-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_6px_14px_-6px_rgba(15,17,21,0.45)]',
  activeClassName = 'text-white',
  inactiveClassName = 'text-zinc-600 hover:text-zinc-900',
  asTab = false,
  ariaLabel
}: SlidingTabButtonProps): React.ReactElement {
  const composedClassName = `relative isolate inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/15 ${
    isActive ? activeClassName : inactiveClassName
  } ${className}`;

  const content = (
    <>
      {isActive && (
        <motion.span
          layoutId={layoutId}
          aria-hidden="true"
          className={`absolute inset-0 -z-10 rounded-xl ${pillClassName}`}
          transition={SPRING_SNAPPY}
        />
      )}
      {children}
    </>
  );

  if (href !== undefined) {
    return (
      <Link
        href={href}
        className={composedClassName}
        aria-current={isActive ? 'page' : undefined}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role={asTab ? 'tab' : undefined}
      aria-selected={asTab ? isActive : undefined}
      aria-pressed={asTab ? undefined : isActive}
      aria-label={ariaLabel}
      onClick={onClick}
      className={composedClassName}
    >
      {content}
    </button>
  );
}
