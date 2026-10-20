const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/** 2026-10-15 (or 2026-10-15T10:00:00) -> 15/10/2026. Anything else is returned as it came. */
export function formatDateBR(value?: string | null) {
  if (!value) {
    return '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** The API sends UTC times without a zone; show them in Brasília time. */
export function formatDateTimeBR(value?: string | null) {
  if (!value) {
    return '';
  }
  const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/** 2026-10 -> Outubro de 2026 */
export function monthTitle(month: string) {
  const [year, value] = month.split('-');
  const name = monthNames[Number(value) - 1];
  return name ? `${name} de ${year}` : month;
}

/** 2026-12, +1 -> 2027-01 */
export function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number);
  const index = year * 12 + (value - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export function formatMoneyBR(value?: number | null) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
}
