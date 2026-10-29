import type { PaymentTerms } from '@/lib/api';
import { formatMoney } from '@/lib/utils';

/**
 * How the supplier will be paid, in the words the units read before voting: "À vista", "Parcelado em 3× de R$ 400,00",
 * "Entrada de R$ 900,00 + restante em 2× de R$ 1.050,00". Null when the budget did not say.
 */
export function paymentTermsText(terms: PaymentTerms & { amount: number }) {
  const amount = Number(terms.amount ?? 0);
  if (terms.paymentMode === 'A_VISTA') return 'À vista';
  if (terms.paymentMode === 'PARCELADO') {
    const parts = terms.paymentInstallments ?? 2;
    return `Parcelado em ${parts}× de ${formatMoney(amount / parts)}`;
  }
  if (terms.paymentMode === 'ENTRADA') {
    const down = Number(terms.downPayment ?? 0);
    const parts = terms.paymentInstallments ?? 1;
    const rest = amount - down;
    return parts > 1
      ? `Entrada de ${formatMoney(down)} + restante em ${parts}× de ${formatMoney(rest / parts)}`
      : `Entrada de ${formatMoney(down)} + restante de ${formatMoney(rest)}`;
  }
  return null;
}

/** The same in a few words, for a table: "à vista", "em 3×", "entrada + 2×". */
export function paymentTermsShort(terms: PaymentTerms) {
  if (terms.paymentMode === 'A_VISTA') return 'à vista';
  if (terms.paymentMode === 'PARCELADO') return `em ${terms.paymentInstallments ?? 2}×`;
  if (terms.paymentMode === 'ENTRADA') return (terms.paymentInstallments ?? 1) > 1 ? `entrada + ${terms.paymentInstallments}×` : 'entrada + restante';
  return null;
}
