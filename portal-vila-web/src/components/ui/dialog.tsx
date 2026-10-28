import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'danger' | 'ok';
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

const toneClasses = {
  brand: 'bg-brand-soft text-brand',
  danger: 'bg-danger-soft text-danger',
  ok: 'bg-ok-soft text-ok'
};

/**
 * The browser's own modal (<dialog>): it keeps the focus inside, closes with Esc and darkens the page behind.
 * Clicking outside closes it too.
 */
export function Dialog({ open, onClose, title, description, icon, tone = 'brand', children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // The browser focuses the first button (the close X); the field marked data-autofocus is where typing starts.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'm-auto w-[calc(100vw-2rem)] overflow-visible rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl',
        'backdrop:bg-[#0b1116]/55 backdrop:backdrop-blur-[2px]',
        size === 'sm' && 'max-w-md',
        size === 'md' && 'max-w-lg',
        size === 'lg' && 'max-w-2xl'
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <div className={cn('flex items-start gap-4 px-6 pt-6', !children && 'pb-6')}>
            {icon && <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', toneClasses[tone])}>{icon}</span>}
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id={titleId} className="text-lg font-semibold leading-snug">
                {title}
              </h2>
              {description && (
                <div id={descriptionId} className="mt-1 text-sm text-muted">
                  {description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="-mr-2 -mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-alt hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
          {children && <div className="overflow-y-auto px-6 py-5">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-2xl border-t border-line bg-surface-alt/60 px-6 py-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
