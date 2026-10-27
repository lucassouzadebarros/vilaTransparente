import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes));
}

const numbers = new Intl.NumberFormat('pt-BR');
const dates = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatNumber(value: number) {
  return numbers.format(value);
}

/** The API sends dates without a zone (São Paulo time); shown as dd/mm/aaaa. */
export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dates.format(date);
}
