import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

type Crumb = { label: string; to?: string };

/** The top of every page: where you are, the title, a line about it and the page's actions. */
export function PageHeader({
  crumbs,
  title,
  description,
  actions,
  leading
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Você está em">
          <ol className="flex min-w-0 items-center gap-1 text-sm text-muted">
            {crumbs.map((crumb, index) => (
              <li key={crumb.label} className={cn('flex items-center gap-1', crumb.to ? 'shrink-0' : 'min-w-0')}>
                {index > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
                {crumb.to ? (
                  <Link to={crumb.to} className="rounded hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate text-ink">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {leading}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
            {description && <div className="mt-1 text-sm text-muted">{description}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-erro`} className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap rounded-lg border border-line bg-surface-alt p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            value === option.value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted hover:text-ink'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A condominium's mark: its initials on the brand color, the same everywhere in the panel. */
export function Monogram({ text, size = 'md' }: { text: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-xl bg-brand-soft font-semibold text-brand ring-1 ring-brand/15',
        size === 'md' ? 'size-9 text-xs' : 'size-14 text-lg'
      )}
    >
      {text}
    </span>
  );
}
