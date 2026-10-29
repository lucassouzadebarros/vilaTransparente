import { PixKeyType } from '../types';

/** The two check digits of a CPF are right: 11 digits that are a CPF, not a phone number. */
function validCpf(digits: string) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    const sum = digits
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return (rest === 10 ? 0 : rest) === Number(digits[length]);
  };
  return check(9) && check(10);
}

/**
 * The kind of key a person typed, as a bank app guesses it: an e-mail has @, a random key is a UUID, 14 digits are a
 * CNPJ, 11 digits are a CPF when its check digits match (otherwise a cell phone), and a +55 in front is a phone.
 * The same rule as the web panel.
 */
export function guessPixKeyType(raw: string): PixKeyType {
  const text = raw.trim();
  if (text.includes('@')) return 'EMAIL';
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(text)) return 'EVP';
  const digits = text.replace(/\D/g, '');
  if (text.startsWith('+') || digits.length === 13) return 'PHONE';
  if (digits.length === 14) return 'CNPJ';
  if (digits.length === 11) return validCpf(digits) ? 'CPF' : 'PHONE';
  return /[()]/.test(text) ? 'PHONE' : 'CPF';
}

/** A key as people read it: 123.456.789-01, 12.345.678/0001-90, (21) 98765-4321; e-mails and random keys as they are. */
export function pixKeyText(key: string, type: PixKeyType) {
  if (type === 'CPF' && key.length === 11) return key.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (type === 'CNPJ' && key.length === 14) return key.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (type === 'PHONE' && key.length === 11) return key.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  return key;
}

export const PIX_KEY_TYPES: Array<{ key: PixKeyType; label: string }> = [
  { key: 'CPF', label: 'CPF' },
  { key: 'CNPJ', label: 'CNPJ' },
  { key: 'PHONE', label: 'Celular' },
  { key: 'EMAIL', label: 'E-mail' },
  { key: 'EVP', label: 'Aleatória' }
];
