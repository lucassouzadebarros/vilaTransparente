import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../utils/alert';
import { formatDateBR } from '../utils/format';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CheckCircle2, ChevronRight, ClipboardList, Circle, CircleAlert, Clock3, ExternalLink, FileText, Pencil, RefreshCw, XCircle } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value, formatMoney, SectionTitle } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, BudgetVoting, Expense, PortalDocument, ProblemReport, ServiceOrder } from '../types';
import { budgetBadgeStatus, lowestQuoteId, votingScore } from '../utils/budgetVoting';

type StepState = 'done' | 'current' | 'todo' | 'skipped' | 'warn';

type Step = {
  key: string;
  title: string;
  detail: string;
  state: StepState;
  onPress?: () => void;
};

export function ServiceDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { isAdmin, canManageBudgets } = useAuth();
  const id = Number(route.params?.id ?? 1);
  const [service, setService] = useState<ServiceOrder | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [legacyQuotes, setLegacyQuotes] = useState<Budget[]>([]);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [origin, setOrigin] = useState<ProblemReport | null>(null);
  const [votings, setVotings] = useState<Record<number, BudgetVoting>>({});
  const [expenses, setExpenses] = useState<Expense[]>([]);

  async function load() {
    const [nextService, nextQuotes, allBudgets, nextDocuments, reports, nextVotings, nextExpenses] = await Promise.all([
      api.service(id),
      api.serviceBudgets(id).catch(() => [] as Budget[]),
      api.budgets().catch(() => [] as Budget[]),
      api.documents('SERVICE', id),
      api.problemReports().catch(() => [] as ProblemReport[]),
      api.budgetVotings().catch(() => [] as BudgetVoting[]),
      api.expenses().catch(() => [] as Expense[])
    ]);
    setService(nextService);
    // Budgets of the same problem (the new flow); quotes registered inside the service are the older way.
    const ofProblem = nextService.problemReportId
      ? allBudgets.filter((budget) => budget.problemReportId === nextService.problemReportId && budget.status !== 'CANCELADO')
      : [];
    setBudgets([...ofProblem, ...nextQuotes.filter((quote) => !ofProblem.some((budget) => budget.id === quote.id))]);
    setLegacyQuotes(nextQuotes);
    setDocuments(nextDocuments);
    setOrigin(nextService.problemReportId ? reports.find((report) => report.id === nextService.problemReportId) ?? null : null);
    setVotings(Object.fromEntries(nextVotings.map((voting) => [voting.budgetId, voting])));
    setExpenses(nextExpenses.filter((expense) => expense.serviceOrderId === id));
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [id, route.params?.refreshKey])
  );

  const approvedBudget = useMemo(() => {
    if (!service) {
      return undefined;
    }
    return budgets.find((budget) => budget.id === service.approvedBudgetId)
      ?? legacyQuotes.find((budget) => budget.id === service.approvedBudgetId || budget.status === 'APROVADO');
  }, [budgets, legacyQuotes, service]);

  const fiscalDocument = useMemo(() => {
    return documents.find((doc) => doc.type === 'NOTA_FISCAL' || doc.type === 'RECIBO') ?? documents[0];
  }, [documents]);

  const steps = useMemo(
    () => (service ? buildSteps(service, origin, budgets, approvedBudget, expenses, Boolean(fiscalDocument), navigation) : []),
    [service, origin, budgets, approvedBudget, expenses, fiscalDocument, navigation]
  );

  function openDocument(document?: PortalDocument) {
    if (!document?.url) {
      Alert.alert('Documento', 'Nenhum documento fiscal foi vinculado a este serviço.');
      return;
    }
    api.openDocument(document.url).catch(() => Alert.alert('Documento', 'Não foi possível abrir este documento.'));
  }

  function confirmCancel() {
    Alert.alert('Cancelar serviço', 'O serviço deixa de aparecer como em andamento e não poderá ser finalizado. Deseja cancelar?', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar serviço',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelService(id);
            await load();
          } catch (err) {
            Alert.alert('Cancelar serviço', apiErrorMessage(err, 'Não consegui cancelar o serviço.'));
          }
        }
      }
    ]);
  }

  const isOpen = service ? service.status !== 'FINALIZADO' && service.status !== 'CANCELADO' : false;
  const lowestId = lowestQuoteId(budgets.filter((budget) => budget.competes !== false));
  const started = service?.status === 'EM_ANDAMENTO' || service?.status === 'FINALIZADO';

  return (
    <Screen title={service?.title ?? 'Detalhes do serviço'} subtitle="Detalhes do serviço" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {service ? (
        <>
          {service.emergencyReason ? (
            <View style={styles.emergencyBox}>
              <Text style={styles.emergencyTitle}>Pago sem votação das casas (emergência)</Text>
              <Text style={styles.emergencyText}>{service.emergencyReason}</Text>
              <Text style={styles.emergencyHint}>Esta justificativa fica visível para todos e aparece no relatório mensal.</Text>
            </View>
          ) : null}

          <Card>
            <DetailLine label="Status">
              <View style={styles.statusBlock}>
                <Badge status={service.status} />
                {service.emergencyReason ? (
                  <View style={styles.emergencyPill}>
                    <Text style={styles.emergencyPillText}>GASTO SEM VOTAÇÃO</Text>
                  </View>
                ) : null}
              </View>
            </DetailLine>
            <DetailLine label="Valor previsto">
              <Money value={service.expectedValue ?? approvedBudget?.amount ?? 0} />
            </DetailLine>
            {service.finalValue != null && (service.expectedValue ?? approvedBudget?.amount) != null ? (
              <DetailLine label="Pago x previsto">
                <Value>{differenceLabel(service.finalValue, (service.expectedValue ?? approvedBudget?.amount) as number)}</Value>
              </DetailLine>
            ) : null}
            <DetailLine label="Fornecedor">
              <View style={styles.detailTextBlockRight}>
                <Value>{service.supplier ?? approvedBudget?.supplier ?? 'Não definido'}</Value>
                <Label>{service.supplierDocument ?? approvedBudget?.supplierDocument ?? 'CPF/CNPJ não informado'}</Label>
              </View>
            </DetailLine>
            <DetailLine label="Data do serviço">
              <Value>{formatDateBR(service.completedDate ?? service.plannedDate) || 'A definir'}</Value>
            </DetailLine>
            <DetailLine label="Orçamento vinculado">
              <View style={styles.detailTextBlockRight}>
                <Value>{approvedBudget ? `#${approvedBudget.id} - ${approvedBudget.title}` : 'Nenhum selecionado'}</Value>
                {approvedBudget ? <Label>{approvedBudget.supplier}</Label> : null}
              </View>
            </DetailLine>
            <DetailLine label="Pagamento">
              <View style={styles.detailTextBlockRight}>
                {service.finalValue ? (
                  <Money value={service.finalValue} />
                ) : (
                  <Value>{service.status === 'CANCELADO' ? 'Serviço cancelado' : 'Aguardando finalização'}</Value>
                )}
                {service.completedDate ? <Label>Pago em {formatDateBR(service.completedDate)}</Label> : null}
              </View>
            </DetailLine>
          </Card>

          <Card>
            <SectionTitle>Do problema ao pagamento</SectionTitle>
            <View style={styles.timeline}>
              {steps.map((step, index) => (
                <TimelineStep key={step.key} step={step} last={index === steps.length - 1} />
              ))}
            </View>
          </Card>

          {budgets.length > 0 ? (
            <Card>
              <Row>
                <Value>{service.problemReportId ? 'Orçamentos do problema' : 'Cotações'}</Value>
                <Label>{budgets.length} cadastrado(s)</Label>
              </Row>
              {budgets.map((quote) => {
                const voting = quote.id ? votings[quote.id] : undefined;
                return (
                  <Pressable
                    key={quote.id}
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('BudgetDetails', { id: quote.id, refreshKey: Date.now() })}
                    style={[styles.quoteRow, quote.id === approvedBudget?.id ? styles.quoteRowChosen : null]}
                  >
                    <View style={styles.quoteCopy}>
                      <Text style={styles.quoteSupplier}>{quote.supplier}</Text>
                      <View style={styles.quoteTags}>
                        <Badge status={budgetBadgeStatus(quote.status)} />
                        {quote.competes !== false && quote.id === lowestId && budgets.filter((item) => item.competes !== false).length > 1 ? <Badge status="MENOR VALOR" /> : null}
                        {quote.id === approvedBudget?.id ? <Badge status="DESTE SERVIÇO" /> : null}
                        {quote.competes === false ? <Badge status="OUTRO TRABALHO" /> : null}
                      </View>
                      {voting?.open ? <Text style={styles.quoteVotes}>{votingScore(voting)}</Text> : null}
                    </View>
                    <View style={styles.quoteRight}>
                      <Money value={quote.amount} />
                      <ChevronRight color={colors.muted} size={16} />
                    </View>
                  </Pressable>
                );
              })}
              <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <Button title="Todos os orçamentos" icon={ClipboardList} variant="ghost" onPress={() => navigation.navigate('Budgets')} />
              </Row>
            </Card>
          ) : null}

          <SectionTitle>Documento</SectionTitle>
          <DocumentCard document={fiscalDocument} status={service.status} onPress={() => openDocument(fiscalDocument)} />

          {canManageBudgets ? (
            <Card>
              <SectionTitle>Ações administrativas</SectionTitle>
              <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <Button title="Editar" icon={Pencil} variant="ghost" onPress={() => navigation.navigate('ServiceForm', { formMode: 'edit', serviceId: service.id, formKey: Date.now() })} />
                {isAdmin && service.status !== 'CANCELADO' ? <Button title={service.status === 'FINALIZADO' ? 'Corrigir dados / anexar nota' : 'Finalizar / anexar nota'} icon={CheckCircle2} onPress={() => navigation.navigate('FinishService', { id: service.id })} /> : null}
                {isOpen ? <Button title="Cancelar serviço" icon={XCircle} variant="danger" onPress={confirmCancel} /> : null}
              </Row>
              {!isAdmin ? <Label>Finalizar o serviço gera uma despesa no caixa, por isso fica com o admin.</Label> : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function buildSteps(
  service: ServiceOrder,
  origin: ProblemReport | null,
  budgets: Budget[],
  approved: Budget | undefined,
  expenses: Expense[],
  hasDocument: boolean,
  navigation: { navigate: (...args: any[]) => void }
): Step[] {
  const steps: Step[] = [];
  const cancelled = service.status === 'CANCELADO';
  const started = service.status === 'EM_ANDAMENTO' || service.status === 'FINALIZADO';
  const finished = service.status === 'FINALIZADO';
  const live = budgets.filter((budget) => budget.status === 'EM_ANALISE' || budget.status === 'APROVADO');
  const voting = budgets.some((budget) => budget.status === 'EM_ANALISE');

  if (service.problemReportId) {
    steps.push({
      key: 'report',
      title: 'Problema relatado',
      detail: origin ? origin.title : `Relato #${service.problemReportId}`,
      state: 'done',
      onPress: () => navigation.navigate('Mais', { screen: 'ProblemReports' })
    });
  }

  const emergency = Boolean(service.emergencyReason);
  steps.push({
    key: 'quotes',
    title: 'Orçamentos',
    detail: budgets.length === 0
      ? 'Nenhum orçamento: serviço pequeno criado direto'
      : `${budgets.length} do problema${live.length ? `, o menor ${formatMoney(Math.min(...live.map((budget) => budget.amount)))}` : ''}`,
    state: budgets.length > 0 ? 'done' : emergency ? 'warn' : 'skipped'
  });

  steps.push({
    key: 'vote',
    title: 'Votação das casas',
    detail: approved
      ? `Aprovado: ${approved.supplier}, ${formatMoney(approved.amount)}`
      : voting
        ? 'Em votação'
        : emergency
          ? `Pago sem votação (emergência): ${service.emergencyReason}`
          : started
            ? 'Sem votação: dentro do limite para serviço pequeno'
            : cancelled ? 'Sem votação' : 'Não precisa de votação se ficar dentro do limite',
    state: approved ? 'done' : voting ? 'current' : emergency ? 'warn' : started || cancelled ? 'skipped' : 'todo'
  });

  steps.push({
    key: 'work',
    title: 'Execução',
    detail: finished
      ? `Concluído${service.completedDate ? ` em ${formatDateBR(service.completedDate)}` : ''}`
      : cancelled
        ? 'Serviço cancelado'
        : service.status === 'EM_ANDAMENTO'
          ? 'Em andamento'
          : service.plannedDate ? `Planejado para ${formatDateBR(service.plannedDate)}` : 'Ainda não começou',
    state: finished ? 'done' : cancelled ? 'skipped' : service.status === 'EM_ANDAMENTO' ? 'current' : 'todo'
  });

  const booked = expenses.length > 0;
  steps.push({
    key: 'payment',
    title: 'Pagamento no caixa',
    detail: finished
      ? `${formatMoney(service.finalValue ?? 0)}${booked ? ': despesa lançada no Caixa' : ': sem despesa lançada no Caixa'}`
      : cancelled ? 'Sem pagamento' : 'Aguardando finalização',
    state: finished ? (booked ? 'done' : 'warn') : cancelled ? 'skipped' : 'todo'
  });

  steps.push({
    key: 'proof',
    title: 'Nota ou comprovante',
    detail: hasDocument ? 'Anexado' : finished ? 'Não anexado' : 'Anexado ao finalizar',
    state: hasDocument ? 'done' : finished ? 'warn' : cancelled ? 'skipped' : 'todo'
  });

  return steps;
}

function TimelineStep({ step, last }: { step: Step; last: boolean }) {
  const icon =
    step.state === 'done' ? <CheckCircle2 color={colors.green} size={20} />
      : step.state === 'current' ? <Clock3 color={colors.amber} size={20} />
        : step.state === 'warn' ? <CircleAlert color={colors.red} size={20} />
          : <Circle color={colors.muted} size={20} />;
  const content = (
    <View style={styles.stepRow}>
      <View style={styles.stepIconColumn}>
        {icon}
        {last ? null : <View style={styles.stepLine} />}
      </View>
      <View style={styles.stepCopy}>
        <Text style={[styles.stepTitle, step.state === 'skipped' ? styles.stepMuted : null]}>{step.title}</Text>
        <Text style={[styles.stepDetail, step.state === 'warn' ? styles.stepWarn : null, step.state === 'skipped' ? styles.stepMuted : null]}>{step.detail}</Text>
      </View>
      {step.onPress ? <ChevronRight color={colors.muted} size={16} /> : null}
    </View>
  );
  return step.onPress ? (
    <Pressable accessibilityRole="button" onPress={step.onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

function differenceLabel(paid: number, expected: number) {
  const delta = Math.round((paid - expected) * 100) / 100;
  if (delta === 0) {
    return 'Igual ao previsto';
  }
  return `${formatMoney(Math.abs(delta))} ${delta > 0 ? 'acima' : 'abaixo'} do previsto`;
}

function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.detailLine}>
      <Label>{label}</Label>
      <View style={styles.detailValue}>{children}</View>
    </View>
  );
}

function documentHint(status: ServiceOrder['status']) {
  if (status === 'FINALIZADO') {
    return 'Nenhuma nota ou recibo foi anexado a este serviço.';
  }
  if (status === 'CANCELADO') {
    return 'Serviço cancelado, sem documento.';
  }
  return 'A nota fiscal é anexada ao finalizar o serviço.';
}

function DocumentCard({ document, status, onPress }: { document?: PortalDocument; status: ServiceOrder['status']; onPress: () => void }) {
  return (
    <Card>
      <Row>
        <View style={styles.documentLeft}>
          <View style={styles.pdfIcon}>
            <FileText color={colors.red} size={22} />
          </View>
          <View style={styles.detailTextBlock}>
            <Value>{document?.name ?? 'Nota fiscal não anexada'}</Value>
            <Label>{document?.url ? document.url.split('/').pop() : documentHint(status)}</Label>
          </View>
        </View>
        <Button title="" accessibilityLabel="Abrir documento" icon={ExternalLink} variant="ghost" onPress={onPress} disabled={!document?.url} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  detailLine: {
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  detailValue: {
    flex: 1,
    alignItems: 'flex-end'
  },
  detailTextBlock: {
    gap: spacing.xs,
    alignItems: 'flex-start'
  },
  detailTextBlockRight: {
    gap: spacing.xs,
    alignItems: 'flex-end'
  },
  statusBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-end'
  },
  timeline: {
    gap: 0
  },
  stepRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md
  },
  stepIconColumn: {
    width: 22,
    alignItems: 'center',
    alignSelf: 'stretch'
  },
  stepLine: {
    flex: 1,
    width: 2,
    marginTop: 2,
    marginBottom: 2,
    backgroundColor: colors.border
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
    paddingBottom: spacing.md,
    gap: 2
  },
  stepTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700'
  },
  stepDetail: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  stepWarn: {
    color: colors.red,
    fontWeight: '700'
  },
  stepMuted: {
    color: colors.muted
  },
  emergencyBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    padding: spacing.md,
    gap: spacing.xs
  },
  emergencyTitle: {
    color: colors.red,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  emergencyText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  emergencyHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600'
  },
  emergencyPill: {
    borderRadius: 999,
    backgroundColor: colors.redSoft,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  emergencyPillText: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '700'
  },
  quoteRow: {
    minHeight: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  quoteRowChosen: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft
  },
  quoteCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6
  },
  quoteSupplier: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  quoteTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  quoteVotes: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600'
  },
  quoteRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  documentLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  pdfIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
