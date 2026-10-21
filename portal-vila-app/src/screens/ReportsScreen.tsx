import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Lock, Printer, RefreshCw, Scale } from 'lucide-react-native';
import { Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { MonthlyReport, Reconciliation, ReportLine } from '../types';
import { Alert } from '../utils/alert';
import { formatDateBR, formatDateTimeBR, formatMoneyBR, monthTitle, shiftMonth } from '../utils/format';
import { currentMonth } from '../utils/month';
import { downloadReportCsv, printReport } from '../utils/reportExport';

export function ReportsScreen() {
  const { isAdmin } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setError('');
    try {
      setReport(await api.monthlyReport(target));
    } catch (failure) {
      setReport(null);
      setError(apiErrorMessage(failure, 'Não consegui carregar a prestação de contas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(month).catch(() => undefined);
    }, [load, month])
  );

  async function checkAsaas() {
    setChecking(true);
    try {
      setReconciliation(await api.reconciliation());
    } catch (failure) {
      Alert.alert('Conferência com o Asaas', apiErrorMessage(failure, 'Não consegui conferir agora.'));
    } finally {
      setChecking(false);
    }
  }

  async function exportCsv() {
    if (!report) {
      return;
    }
    try {
      if (!(await downloadReportCsv(report))) {
        Alert.alert('Baixar planilha', 'Este aparelho não consegue compartilhar arquivos.');
      }
    } catch {
      Alert.alert('Baixar planilha', 'Não consegui gerar a planilha. Tente de novo.');
    }
  }

  async function print() {
    if (!report) {
      return;
    }
    try {
      if (!(await printReport(report))) {
        Alert.alert('PDF', 'Libere pop-ups para este site e tente de novo, ou use um aparelho que compartilhe arquivos.');
      }
    } catch {
      Alert.alert('PDF', 'Não consegui gerar o PDF. Tente de novo.');
    }
  }

  const isCurrent = month >= currentMonth();
  const totalOut = report?.totalExpenses ?? 0;

  return (
    <Screen
      title="Prestação de contas"
      subtitle={monthTitle(month)}
      right={<Button title="" icon={RefreshCw} variant="ghost" onPress={() => load(month)} />}
    >
      <Row style={styles.monthNav}>
        <Button title="Anterior" icon={ChevronLeft} variant="ghost" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Button title="Próximo" icon={ChevronRight} variant="ghost" disabled={isCurrent} onPress={() => setMonth(shiftMonth(month, 1))} />
      </Row>

      {error ? (
        <Card>
          <Value>Não deu para carregar</Value>
          <Label>{error}</Label>
        </Card>
      ) : null}

      {loading && !report ? <Label>Carregando...</Label> : null}

      {report && !report.transparencyEnabled ? (
        <Card>
          <Row>
            <Value>Desbloqueie a prestação de contas</Value>
            <Lock color={colors.muted} size={20} />
          </Row>
          <Label>A prestação de contas é aberta para as casas que contribuem. Faça sua primeira contribuição para ver.</Label>
        </Card>
      ) : null}

      {report && report.transparencyEnabled ? (
        <>
          <Card>
            <Row><Label>Saldo no início do mês</Label><Money value={report.openingBalance} /></Row>
            <Row><Label>Entradas</Label><Money value={report.totalIncome} /></Row>
            <Row><Label>Saídas</Label><Money value={-report.totalExpenses} /></Row>
            <Row><Value>Saldo no fim do mês</Value><Money value={report.closingBalance} strong /></Row>
          </Card>

          {report.expensesWithoutDocument > 0 ? (
            <Card style={styles.warningCard}>
              <Row style={styles.warningRow}>
                <AlertTriangle color={colors.amber} size={20} />
                <Text style={styles.warningText}>
                  {report.expensesWithoutDocument} {report.expensesWithoutDocument === 1 ? 'saída' : 'saídas'} do mês sem comprovante anexado.
                </Text>
              </Row>
            </Card>
          ) : null}

          {(report.unvotedCount ?? 0) > 0 ? (
            <Card style={styles.warningCard}>
              <Row style={styles.warningRow}>
                <AlertTriangle color={colors.amber} size={20} />
                <Text style={styles.warningText}>
                  Gastos sem orçamento votado: {formatMoneyBR(report.unvotedTotal ?? 0)} ({report.unvotedCount}{' '}
                  {report.unvotedCount === 1 ? 'lançamento' : 'lançamentos'}). Serviços pequenos, dentro do limite, e emergências justificadas não passam por votação.
                </Text>
              </Row>
            </Card>
          ) : null}

          <Card>
            <Value>De onde veio o dinheiro</Value>
            {report.incomeBySource.length === 0 ? <Label>Nenhuma entrada neste mês.</Label> : null}
            {report.incomeBySource.map((line) => (
              <LineWithBar key={line.label} line={line} total={report.totalIncome} color={colors.green} />
            ))}
          </Card>

          <Card>
            <Value>Para onde foi</Value>
            {report.expensesByCategory.length === 0 ? <Label>Nenhuma saída neste mês.</Label> : null}
            {report.expensesByCategory.map((line) => (
              <LineWithBar key={line.label} line={line} total={totalOut} color={colors.red} />
            ))}
          </Card>

          <Card>
            <Value>Entradas do mês</Value>
            {report.incomes.length === 0 ? <Label>Nenhuma entrada neste mês.</Label> : null}
            {report.incomes.map((income, index) => (
              <View key={`${income.date}-${index}`} style={styles.entry}>
                <View style={styles.entryText}>
                  <Text style={styles.entryTitle}>{income.description}</Text>
                  <Label>{formatDateBR(income.date)} - {income.source}</Label>
                </View>
                <Money value={income.amount} />
              </View>
            ))}
          </Card>

          <Card>
            <Value>Saídas do mês</Value>
            {report.expenses.length === 0 ? <Label>Nenhuma saída neste mês.</Label> : null}
            {report.expenses.map((expense) => (
              <View key={expense.id} style={styles.entry}>
                <View style={styles.entryText}>
                  <Text style={styles.entryTitle}>{expense.description}</Text>
                  <Label>
                    {formatDateBR(expense.date)} - {expense.category}{expense.supplier ? ` - ${expense.supplier}` : ''}
                  </Label>
                  <Text style={expense.hasDocument ? styles.hasDocument : styles.noDocument}>
                    {expense.hasDocument ? 'Com comprovante' : 'Sem comprovante'}
                  </Text>
                  {expense.exceptionReason ? <Text style={styles.noVote}>Sem votação: {expense.exceptionReason}</Text> : null}
                </View>
                <Money value={-expense.amount} />
              </View>
            ))}
          </Card>

          <Card>
            <Value>Levar com você</Value>
            <Label>Planilha para abrir no Excel ou página para imprimir e salvar em PDF.</Label>
            <Button title="Baixar planilha (CSV)" icon={Download} variant="ghost" onPress={exportCsv} />
            <Button title="Imprimir / salvar em PDF" icon={Printer} variant="ghost" onPress={print} />
          </Card>
        </>
      ) : null}

      {isAdmin ? (
        <Card>
          <Row>
            <Value>Conferência com o Asaas</Value>
            <Scale color={colors.blue} size={20} />
          </Row>
          <Label>Compara o saldo do portal com o saldo que o Asaas informa agora. Só consulta, não altera nada.</Label>
          <Button title={checking ? 'Consultando...' : 'Conferir agora'} icon={Scale} variant="ghost" disabled={checking} onPress={checkAsaas} />
          {reconciliation ? (
            <View style={styles.reconciliation}>
              <Row><Label>Saldo no portal</Label><Value>{formatMoneyBR(reconciliation.portalBalance)}</Value></Row>
              <Row>
                <Label>Saldo no Asaas</Label>
                <Value>{reconciliation.asaasBalance == null ? 'indisponível' : formatMoneyBR(reconciliation.asaasBalance)}</Value>
              </Row>
              <Text style={styles.reconciliationMessage}>{reconciliation.message}</Text>
              <Label>Conferido em {formatDateTimeBR(reconciliation.checkedAt)}</Label>
            </View>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function LineWithBar({ line, total, color }: { line: ReportLine; total: number; color: string }) {
  const percent = total > 0 ? Math.max(2, Math.round((line.amount / total) * 100)) : 0;
  return (
    <View style={styles.lineBlock}>
      <Row>
        <Text style={styles.lineLabel}>{line.label} <Text style={styles.lineCount}>({line.count})</Text></Text>
        <Money value={line.amount} />
      </Row>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  monthNav: { justifyContent: 'space-between' },
  warningCard: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  warningRow: { justifyContent: 'flex-start', gap: spacing.sm, alignItems: 'center' },
  warningText: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '700' },
  entry: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
  entryText: { flex: 1, gap: 2 },
  entryTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  hasDocument: { color: colors.green, fontSize: 12, fontWeight: '700' },
  noDocument: { color: colors.amber, fontSize: 12, fontWeight: '800' },
  noVote: { color: colors.red, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  lineBlock: { gap: 4, paddingVertical: 4 },
  lineLabel: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '700' },
  lineCount: { color: colors.muted, fontWeight: '600' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  reconciliation: { gap: spacing.sm, marginTop: spacing.sm },
  reconciliationMessage: { color: colors.ink, fontSize: 14, fontWeight: '700', lineHeight: 20 }
});
