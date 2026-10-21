/**
 * Input masks and checks for the forms. They work the same on the web and on the phone (no native picker needed),
 * and they only format what is typed: the screens keep the masked text and convert it when saving.
 */

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const withThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Money typed in reais, with the comma as the decimal separator: "1500" -> "1.500", "1500,5" -> "1.500,5".
 * A single dot followed by one or two digits ("500.50") is read as a decimal point, for pasted values and keyboards
 * that only have the dot; any other dot is a thousands separator and is dropped.
 */
export function maskCurrency(value: string): string {
  let text = value.replace(/[^\d.,]/g, '');
  if (/^\d+\.\d{1,2}$/.test(text)) {
    text = text.replace('.', ',');
  }
  const commaAt = text.indexOf(',');
  const integerDigits = onlyDigits(commaAt >= 0 ? text.slice(0, commaAt) : text).replace(/^0+(?=\d)/, '').slice(0, 10);
  if (commaAt < 0) {
    return withThousands(integerDigits);
  }
  const cents = onlyDigits(text.slice(commaAt + 1)).slice(0, 2);
  return `${withThousands(integerDigits) || '0'},${cents}`;
}

/** Completes the cents when the person leaves the field: "1.500" -> "1.500,00", "2,5" -> "2,50". */
export function finishCurrency(masked: string): string {
  const value = maskCurrency(masked);
  if (!value) {
    return '';
  }
  const [integer, cents = ''] = value.split(',');
  return `${integer || '0'},${cents.padEnd(2, '0')}`;
}

export function currencyFromNumber(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return '';
  }
  return finishCurrency(value.toFixed(2).replace('.', ','));
}

export function parseCurrency(masked: string): number | undefined {
  const normalized = masked.replace(/\./g, '').replace(',', '.').trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** "25122026" -> "25/12/2026". */
export function maskDateBR(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

/** A real calendar date typed as dd/mm/aaaa, returned as aaaa-mm-dd (what the API stores), or undefined. */
export function dateBRToISO(masked: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(masked.trim());
  if (!match) {
    return undefined;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!real || year < 2000 || year > 2100) {
    return undefined;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/** "2026-12-25" -> "25/12/2026"; anything else comes back empty so the field starts clean. */
export function isoToDateBR(iso?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/** "11987654321" -> "(11) 98765-4321"; ten digits (landline) -> "(11) 8765-4321". */
export function maskPhoneBR(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length === 0) {
    return '';
  }
  if (digits.length <= 2) {
    return `(${digits}`;
  }
  const area = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length <= 4) {
    return `(${area}) ${rest}`;
  }
  const split = digits.length === 11 ? 5 : 4;
  return `(${area}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

export function isValidPhoneBR(masked: string): boolean {
  const digits = onlyDigits(masked);
  return digits.length === 10 || digits.length === 11;
}

/** CPF (11 digits) or CNPJ (14 digits) with the dots, slash and dash placed as the digits are typed. */
export function maskDocument(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function checkDigit(digits: string, weights: number[]) {
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

function isValidCpf(digits: string) {
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) {
    return false;
  }
  const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[9]) && second === Number(digits[10]);
}

function isValidCnpj(digits: string) {
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) {
    return false;
  }
  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[12]) && second === Number(digits[13]);
}

/** True when the number has the right check digits. Callers skip the check for an empty field. */
export function isValidDocument(masked: string): boolean {
  const digits = onlyDigits(masked);
  return isValidCpf(digits) || isValidCnpj(digits);
}
