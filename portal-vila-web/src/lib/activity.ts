import {
  Building2,
  CircleDollarSign,
  ClipboardList,
  FileText,
  KeyRound,
  PauseCircle,
  Pencil,
  PlayCircle,
  ShieldCheck,
  UserRound,
  Wrench,
  type LucideIcon
} from 'lucide-react';

type Kind = { label: string; icon: LucideIcon; tone: 'brand' | 'ok' | 'warn' | 'danger' | 'neutral' };

const kinds: Record<string, Kind> = {
  CONDOMINIUM_CREATED: { label: 'Condomínio criado', icon: Building2, tone: 'ok' },
  CONDOMINIUM_RENAMED: { label: 'Nome alterado', icon: Pencil, tone: 'brand' },
  CONDOMINIUM_SUSPENDED: { label: 'Acesso suspenso', icon: PauseCircle, tone: 'warn' },
  CONDOMINIUM_REACTIVATED: { label: 'Acesso reativado', icon: PlayCircle, tone: 'ok' },
  INVITE_CREATED: { label: 'Convite de acesso criado', icon: KeyRound, tone: 'brand' },
  INVITE_USED: { label: 'Morador entrou por convite', icon: UserRound, tone: 'ok' },
  INVITE_REVOKED: { label: 'Convite cancelado', icon: KeyRound, tone: 'neutral' },
  SINDICO_CHANGED: { label: 'Síndico alterado', icon: ShieldCheck, tone: 'brand' },
  HOUSE_RELEASED: { label: 'Unidade liberada', icon: Building2, tone: 'neutral' },
  ACCOUNT_ERASED: { label: 'Conta excluída', icon: UserRound, tone: 'neutral' },
  EXPENSE_CREATED: { label: 'Despesa lançada', icon: CircleDollarSign, tone: 'brand' },
  EXPENSE_UPDATED: { label: 'Despesa alterada', icon: CircleDollarSign, tone: 'neutral' },
  EXPENSE_DELETED: { label: 'Despesa excluída', icon: CircleDollarSign, tone: 'warn' },
  MANUAL_PAYMENT: { label: 'Pagamento registrado', icon: CircleDollarSign, tone: 'ok' },
  PIX_CANCELLED: { label: 'Cobrança Pix cancelada', icon: CircleDollarSign, tone: 'neutral' },
  BUDGET_CREATED: { label: 'Orçamento cadastrado', icon: FileText, tone: 'brand' },
  BUDGET_UPDATED: { label: 'Orçamento alterado', icon: FileText, tone: 'neutral' },
  BUDGET_APROVADO: { label: 'Orçamento aprovado', icon: FileText, tone: 'ok' },
  BUDGET_REJEITADO: { label: 'Orçamento recusado', icon: FileText, tone: 'warn' },
  BUDGET_CANCELADO: { label: 'Orçamento cancelado', icon: FileText, tone: 'neutral' },
  BUDGET_EXPIRED: { label: 'Votação encerrada no prazo', icon: FileText, tone: 'neutral' },
  BUDGET_RULE_CHANGED: { label: 'Regra de orçamento alterada', icon: FileText, tone: 'brand' },
  SERVICE_CREATED: { label: 'Serviço criado', icon: Wrench, tone: 'brand' },
  SERVICE_UPDATED: { label: 'Serviço alterado', icon: Wrench, tone: 'neutral' },
  SERVICE_FINISHED: { label: 'Serviço finalizado', icon: Wrench, tone: 'ok' },
  SERVICE_CANCELLED: { label: 'Serviço cancelado', icon: Wrench, tone: 'neutral' },
  REPORT_RESOLVED: { label: 'Relato resolvido', icon: ClipboardList, tone: 'ok' },
  REPORT_TO_SERVICE: { label: 'Relato virou serviço', icon: ClipboardList, tone: 'brand' }
};

/** What an entry of the audit log means, in words, with an icon; unknown ones are shown readably anyway. */
export function describeActivity(action: string): Kind {
  const known = kinds[action];
  if (known) return known;
  const words = action.toLowerCase().replace(/_/g, ' ');
  return { label: words.charAt(0).toUpperCase() + words.slice(1), icon: ClipboardList, tone: 'neutral' };
}
