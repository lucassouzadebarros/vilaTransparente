import { Budget } from '../types';
import { formatMoneyBR } from './format';

/**
 * How the supplier will be paid, in words the houses read before voting: "À vista", "Parcelado em 3× de R$ 400,00",
 * "Entrada de R$ 900,00 + restante em 2× de R$ 1.050,00". Null when the budget did not say.
 */
export function paymentTermsText(budget: Pick<Budget, 'amount' | 'paymentMode' | 'downPayment' | 'paymentInstallments'>) {
  const amount = Number(budget.amount ?? 0);
  if (budget.paymentMode === 'A_VISTA') {
    return 'À vista';
  }
  if (budget.paymentMode === 'PARCELADO') {
    const parts = budget.paymentInstallments ?? 2;
    return `Parcelado em ${parts}× de ${formatMoneyBR(amount / parts)}`;
  }
  if (budget.paymentMode === 'ENTRADA') {
    const down = Number(budget.downPayment ?? 0);
    const parts = budget.paymentInstallments ?? 1;
    const rest = amount - down;
    return parts > 1
      ? `Entrada de ${formatMoneyBR(down)} + restante em ${parts}× de ${formatMoneyBR(rest / parts)}`
      : `Entrada de ${formatMoneyBR(down)} + restante de ${formatMoneyBR(rest)}`;
  }
  return null;
}
