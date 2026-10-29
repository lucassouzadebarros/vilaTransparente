import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Input } from '@/components/ui';
import { Field } from '@/components/ui/page';
import { cn } from '@/lib/utils';

export const selectClass =
  'h-10 w-full rounded-lg border border-line-strong/60 bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={3}
      className={cn(
        'w-full rounded-lg border border-line-strong/60 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/80',
        'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25',
        className
      )}
      {...props}
    />
  );
});

/** A value in reais, typed the Brazilian way ("1.250,00"); read it with parseMoney. */
export function MoneyInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
      <Input inputMode="decimal" className={cn('pl-9 tabular-nums', className)} {...props} />
    </div>
  );
}

export function FileField({
  id,
  label,
  hint,
  file,
  onChange,
  accept = 'image/*,application/pdf'
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={file ? `${file.name} (${Math.ceil(file.size / 1024)} KB)` : hint}>
      <Input
        id={id}
        type="file"
        accept={accept}
        className="py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-surface-alt file:px-3 file:py-1 file:text-sm file:text-ink"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </Field>
  );
}

/** Only the digits of a CPF or CNPJ, or null when nothing was typed. */
export function documentDigits(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? digits : null;
}

/** A CPF has 11 digits and a CNPJ 14; anything else is a typing mistake. */
export function documentError(value: string) {
  const digits = documentDigits(value);
  return digits && digits.length !== 11 && digits.length !== 14 ? 'Um CPF tem 11 números e um CNPJ, 14.' : null;
}
