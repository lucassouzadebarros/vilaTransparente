import { Platform } from 'react-native';
import { MonthlyReport } from '../types';
import { formatDateBR, formatMoneyBR, monthTitle } from './format';

const decimal = (value: number) => value.toFixed(2).replace('.', ',');
const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

/** Spreadsheet-friendly CSV for Brazilian Excel: semicolon separated, comma decimals, with a BOM for accents. */
export function buildReportCsv(report: MonthlyReport) {
  const rows: Array<Array<string | number>> = [
    [`Prestação de contas - ${monthTitle(report.month)}`],
    [],
    ['Resumo'],
    ['Saldo inicial', decimal(report.openingBalance)],
    ['Entradas', decimal(report.totalIncome)],
    ['Saídas', decimal(report.totalExpenses)],
    ['Saldo final', decimal(report.closingBalance)],
    [],
    ['Entradas'],
    ['Data', 'Origem', 'Descrição', 'Valor'],
    ...report.incomes.map((income) => [formatDateBR(income.date), income.source, income.description, decimal(income.amount)]),
    [],
    ['Saídas'],
    ['Data', 'Categoria', 'Descrição', 'Fornecedor', 'Valor', 'Comprovante'],
    ...report.expenses.map((expense) => [
      formatDateBR(expense.date),
      expense.category,
      expense.description,
      expense.supplier ?? '',
      decimal(expense.amount),
      expense.hasDocument ? 'Sim' : 'Não'
    ])
  ];
  return `﻿${rows.map((row) => row.map(cell).join(';')).join('\r\n')}`;
}

export function downloadReportCsv(report: MonthlyReport): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return false;
  }
  const blob = new Blob([buildReportCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `prestacao-de-contas-${report.month}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

/** A clean page to print or save as PDF from the browser. */
export function buildReportHtml(report: MonthlyReport, villageName = 'Portal da Vila') {
  const lines = (items: Array<{ label: string; amount: number; count: number }>) =>
    items.map((item) => `<tr><td>${escapeHtml(item.label)} <small>(${item.count})</small></td><td class="n">${formatMoneyBR(item.amount)}</td></tr>`).join('');
  const incomes = report.incomes
    .map((income) => `<tr><td>${formatDateBR(income.date)}</td><td>${escapeHtml(income.source)}</td><td>${escapeHtml(income.description)}</td><td class="n">${formatMoneyBR(income.amount)}</td></tr>`)
    .join('');
  const expenses = report.expenses
    .map((expense) => `<tr><td>${formatDateBR(expense.date)}</td><td>${escapeHtml(expense.category)}</td><td>${escapeHtml(expense.description)}${expense.supplier ? ` <small>- ${escapeHtml(expense.supplier)}</small>` : ''}</td><td>${expense.hasDocument ? 'Sim' : '<b>Não</b>'}</td><td class="n">${formatMoneyBR(expense.amount)}</td></tr>`)
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Prestação de contas - ${monthTitle(report.month)}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#15202b;margin:32px;font-size:13px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #d9e2ec;padding-bottom:4px}
table{width:100%;border-collapse:collapse}td,th{padding:5px 6px;text-align:left;border-bottom:1px solid #eef2f6;vertical-align:top}
.n{text-align:right;white-space:nowrap}.sum td{font-size:14px}.sum tr:last-child td{font-weight:bold;border-top:2px solid #15202b}
small{color:#667085}.muted{color:#667085}
@media print{body{margin:12mm}}
</style></head><body>
<h1>${escapeHtml(villageName)} - prestação de contas</h1>
<p class="muted">${monthTitle(report.month)}</p>
<h2>Resumo</h2>
<table class="sum">
<tr><td>Saldo no início do mês</td><td class="n">${formatMoneyBR(report.openingBalance)}</td></tr>
<tr><td>Entradas</td><td class="n">${formatMoneyBR(report.totalIncome)}</td></tr>
<tr><td>Saídas</td><td class="n">-${formatMoneyBR(report.totalExpenses)}</td></tr>
<tr><td>Saldo no fim do mês</td><td class="n">${formatMoneyBR(report.closingBalance)}</td></tr>
</table>
<h2>De onde veio o dinheiro</h2><table>${lines(report.incomeBySource) || '<tr><td>Nenhuma entrada no mês.</td></tr>'}</table>
<h2>Para onde foi</h2><table>${lines(report.expensesByCategory) || '<tr><td>Nenhuma saída no mês.</td></tr>'}</table>
<h2>Entradas</h2><table><tr><th>Data</th><th>Origem</th><th>Descrição</th><th class="n">Valor</th></tr>${incomes}</table>
<h2>Saídas</h2><table><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Comprovante</th><th class="n">Valor</th></tr>${expenses}</table>
${report.expensesWithoutDocument > 0 ? `<p class="muted">${report.expensesWithoutDocument} saída(s) deste mês ainda sem comprovante anexado.</p>` : ''}
</body></html>`;
}

export function printReport(report: MonthlyReport): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }
  const page = window.open('', '_blank');
  if (!page) {
    return false;
  }
  page.document.write(buildReportHtml(report));
  page.document.close();
  page.focus();
  page.print();
  return true;
}
