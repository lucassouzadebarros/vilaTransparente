import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card } from '@/components/ui';
import type { Budget, Priority, ProblemReport, ServiceOrder } from '@/lib/api';
import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'danger' | 'brand' | 'neutral';

const priorities: Record<Priority, { label: string; tone: Tone }> = {
  BAIXA: { label: 'Baixa', tone: 'neutral' },
  MEDIA: { label: 'Média', tone: 'brand' },
  ALTA: { label: 'Alta', tone: 'warn' },
  URGENTE: { label: 'Urgente', tone: 'danger' }
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { label, tone } = priorities[priority] ?? priorities.MEDIA;
  return <Badge tone={tone}>{label}</Badge>;
}

export const problemStatuses: Record<ProblemReport['status'], { label: string; tone: Tone }> = {
  ABERTO: { label: 'Aberto', tone: 'warn' },
  EM_ANALISE: { label: 'Em análise', tone: 'brand' },
  RESOLVIDO: { label: 'Resolvido', tone: 'ok' },
  CANCELADO: { label: 'Cancelado', tone: 'neutral' }
};

export const budgetStatuses: Record<Budget['status'], { label: string; tone: Tone }> = {
  EM_ANALISE: { label: 'Em votação', tone: 'warn' },
  APROVADO: { label: 'Aprovado', tone: 'ok' },
  REJEITADO: { label: 'Recusado', tone: 'danger' },
  CANCELADO: { label: 'Cancelado', tone: 'neutral' }
};

export const serviceStatuses: Record<ServiceOrder['status'], { label: string; tone: Tone }> = {
  PLANEJADO: { label: 'Planejado', tone: 'neutral' },
  APROVADO: { label: 'Aprovado', tone: 'brand' },
  EM_ANDAMENTO: { label: 'Em andamento', tone: 'brand' },
  FINALIZADO: { label: 'Finalizado', tone: 'ok' },
  CANCELADO: { label: 'Cancelado', tone: 'neutral' }
};

export function StatusBadge<K extends string>({ status, table }: { status: K; table: Record<K, { label: string; tone: Tone }> }) {
  const found = table[status];
  return <Badge tone={found?.tone ?? 'neutral'}>{found?.label ?? status}</Badge>;
}

/** Approve, reject and still to vote (or, once closed, who never voted), as one bar: what the units decided. */
export function VotingBar({ approve, reject, pending, closed, className }: { approve: number; reject: number; pending: number; closed?: boolean; className?: string }) {
  const total = Math.max(1, approve + reject + pending);
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-alt" aria-hidden>
        <span className="bg-ok" style={{ width: `${(approve / total) * 100}%` }} />
        <span className="bg-danger" style={{ width: `${(reject / total) * 100}%` }} />
      </div>
      <p className="text-xs text-muted tabular-nums">
        {approve} a favor · {reject} contra · {pending} {closed ? 'não votaram' : 'sem votar'}
      </p>
    </div>
  );
}

/** A label and its value, in the facts list of a detail page. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children ?? '—'}</dd>
    </div>
  );
}

export function SideCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** A link to another demand (the problem of a budget, the service of a problem…), with its status. */
export function LinkRow({ to, title, detail, badge }: { to: string; title: string; detail?: ReactNode; badge?: ReactNode }) {
  return (
    <Link to={to} className="flex items-start justify-between gap-3 rounded-lg px-2 py-2 -mx-2 transition-colors hover:bg-surface-alt">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
      </span>
      {badge}
    </Link>
  );
}
