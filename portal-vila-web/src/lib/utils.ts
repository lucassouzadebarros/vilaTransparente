import { clsx, type ClassValue } from 'clsx';
import { useEffect } from 'react';
import { twMerge } from 'tailwind-merge';

export function cn(...classes: ClassValue[]) {
  return twMerge(clsx(classes));
}

const numbers = new Intl.NumberFormat('pt-BR');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatMoney(value: number | null | undefined) {
  return money.format(Number(value ?? 0));
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** "2026-10" -> "outubro de 2026" */
export function monthName(month: string) {
  const [year, number] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, number - 1, 1));
}

/** "2026-12" + 1 -> "2027-01" */
export function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** "1.234,56", "1234.56" or "1234" -> 1234.56; empty -> null; anything else -> NaN. */
export function parseMoney(raw: string): number | null {
  const clean = raw.replace(/[^\d,.-]/g, '').trim();
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

/** 1234.5 -> "1234,50", for a field the person edits. */
export function moneyText(value: number | null | undefined) {
  return value == null ? '' : Number(value).toFixed(2).replace('.', ',');
}
const dates = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatNumber(value: number) {
  return numbers.format(value);
}

/** The API sends dates without a zone (São Paulo time); shown as dd/mm/aaaa. */
export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  // A bare day ("2026-10-28") would be read as midnight in London, the day before here: read it as a local day.
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dates.format(date);
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const dateTimes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "agora", "há 5 minutos", "ontem"... and the full date after a week. */
export function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'agora';
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 7 * 86400) return relative.format(Math.round(seconds / 86400), 'day');
  return dateTimes.format(date);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimes.format(date);
}

/** The same rule as the server: no accents, lower case, dashes, at most 60 characters. */
export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 2 || /^[A-ZÀ-Ý]/.test(word));
  const picked = (words.length ? words : [name]).slice(0, 2).map((word) => word.charAt(0).toUpperCase());
  return picked.join('') || '?';
}

export function plural(count: number, one: string, many: string) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`;
}

/** 21988887777 -> (21) 98888-7777; anything else as it came. */
export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return value;
}

/** The browser tab says where you are: "Pedidos · Portal da Vila". */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Portal da Vila`;
  }, [title]);
}
