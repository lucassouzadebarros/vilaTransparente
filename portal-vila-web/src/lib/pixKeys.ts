import type { PixKeyType } from '@/lib/api';

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
