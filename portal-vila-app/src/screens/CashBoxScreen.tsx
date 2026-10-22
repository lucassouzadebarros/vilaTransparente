import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BarChart3, Eye, Home, Lock, Plus, QrCode, RefreshCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { isDemoMode } from '../demo/demoMode';
import { api } from '../services/api';
import { Contribution, Dashboard, Expense, Movement, PixCharge, PortalDocument } from '../types';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme';
import { Alert } from '../utils/alert';
import { reloadIfNewVersion } from '../utils/appVersion';
import { formatDateBR, formatMoneyBR } from '../utils/format';
import { currentMonth, monthLabel } from '../utils/month';

const PREVIEW_COUNT = 8;

type Tab = 'ENTRADAS' | 'SAIDAS' | 'CASAS';

const tabLabels: Record<Tab, string> = {
  ENTRADAS: 'Entradas',
  SAIDAS: 'Saídas',
  CASAS: 'Contribuições'
};

const originLabels: Record<string, string> = {
  PIX_ASAAS: 'Contribuição via Pix',
  PAGAMENTO_MANUAL: 'Pagamento manual',
  RECEBIMENTO_DIRETO: 'Recebimento direto'
};

export function CashBoxScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [charges, setCharges] = useState<PixCharge[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [month] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('ENTRADAS');
  const [showAll, setShowAll] = useState(false);
  const loadInFlight = useRef(false);

  async function load() {
    if (loadInFlight.current) {
      return;
    }
    loadInFlight.current = true;
    setLoading(true);
    try {
      const [dash, list, pixList, expenseList, documentList] = await Promise.all([
        api.dashboard(month),
        api.contributions(month),
        api.pixCharges(month),
        api.expenses().catch(() => [] as Expense[]),
        api.documents().catch(() => [] as PortalDocument[])
      ]);
      setDashboard(dash);
      setContributions(list);
      setCharges(pixList);
      setExpenses(expenseList);
      setDocuments(documentList);
    } finally {
      loadInFlight.current = false;
      setLoading(false);
    }
  }

  async function refreshFromButton() {
    if (await reloadIfNewVersion()) {
      return;
    }
    await load();
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refresh = () => {
        if (active) {
          load().catch(() => undefined);
        }
      };

      refresh();
      const interval = setInterval(refresh, 15000);

      let events: EventSource | null = null;
      if (!isDemoMode() && typeof window !== 'undefined' && typeof window.EventSource === 'function') {
        events = new window.EventSource(api.dashboardEventsUrl());
        events.addEventListener('dashboard-changed', refresh);
      }

      const handleVisible = () => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          refresh();
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('focus', refresh);
      }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisible);
      }

      return () => {
        active = false;
        clearInterval(interval);
        if (events) {
          events.close();
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('focus', refresh);
        }
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisible);
        }
      };
    }, [isAdmin, month])
  );

  const documentsById = useMemo(() => {
    return documents.reduce<Record<number, PortalDocument>>((acc, item) => {
      if (item.id) {
        acc[item.id] = item;
      }
      return acc;
    }, {});
  }, [documents]);

  const hasPaidContribution = contributions.some((contribution) => contribution?.status === 'PAID');
  const hasVisibleFinancialData = (dashboard?.movements?.length ?? 0) > 0
    || Number(dashboard?.collected ?? 0) > 0
    || Number(dashboard?.totalCollected ?? 0) > 0;
  const transparencyUnlocked = isAdmin || dashboard?.transparencyEnabled === true || hasPaidContribution || hasVisibleFinancialData;
  const directReceiptTotal = (dashboard?.movements ?? [])
    .filter((movement) => movement.type === 'RECEBIMENTO_DIRETO' && Number(movement.amount) > 0)
    .reduce((total, movement) => total + Number(movement.amount ?? 0), 0);
  // One list for every received payment, newest first, so direct receipts and house payments interleave by date.
  const received = (dashboard?.movements ?? [])
    .filter((movement) => Object.keys(originLabels).includes(movement.type) && Number(movement.amount) > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const outgoing = [...expenses].sort((a, b) => {
    const byDate = String(b.expenseDate ?? '').localeCompare(String(a.expenseDate ?? ''));
    return byDate !== 0 ? byDate : (b.id ?? 0) - (a.id ?? 0);
  });
  const withoutDocument = outgoing.filter((expense) => !expense.documentId).length;

  function chooseTab(next: Tab) {
    setTab(next);
    setShowAll(false);
  }

  function openDocument(portalDocument?: PortalDocument) {
    if (!portalDocument) {
      return;
    }
    api.openDocument(portalDocument.url).catch(() => Alert.alert('Documento', 'Não foi possível abrir o documento.'));
  }

  const entriesToShow = showAll ? received : received.slice(0, PREVIEW_COUNT);
  const outgoingToShow = showAll ? outgoing : outgoing.slice(0, PREVIEW_COUNT);
  const listSize = tab === 'ENTRADAS' ? received.length : tab === 'SAIDAS' ? outgoing.length : 0;

  return (
    <Screen
      title="Caixa"
      subtitle="Quanto entrou e quanto saiu"
      right={<Button title="" icon={RefreshCw} variant="ghost" onPress={() => { refreshFromButton().catch(() => undefined); }} disabled={loading} />}
    >
      {!transparencyUnlocked ? (
        <Card>
          <Row>
            <Value>Desbloqueie o caixa</Value>
            <Lock color={colors.muted} size={20} />
          </Row>
          <Label>O caixa é aberto para as casas que contribuem. Faça sua primeira contribuição para ver.</Label>
        </Card>
      ) : (
        <>
          <Card>
            <Label>Saldo acumulado da vila</Label>
            <Text style={styles.balance}>{formatMoneyBR(dashboard?.balance ?? 0)}</Text>
            <View style={styles.divider} />
            <Row><Label>Arrecadado total</Label><Money value={dashboard?.totalCollected ?? dashboard?.collected ?? 0} /></Row>
            <Row><Label>Arrecadado no mês ({monthLabel(month)})</Label><Money value={dashboard?.collected ?? 0} /></Row>
            {directReceiptTotal > 0 ? <Row><Label>Recebimentos diretos</Label><Money value={directReceiptTotal} /></Row> : null}
            <Row><Label>Despesas acumuladas</Label><Money value={-(dashboard?.expenses ?? 0)} /></Row>
            <Button title="Ver prestação de contas do mês" icon={BarChart3} variant="ghost" onPress={() => navigation.navigate('Reports')} />
          </Card>

          <View style={styles.segmented}>
            {(Object.keys(tabLabels) as Tab[]).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === key }}
                onPress={() => chooseTab(key)}
                style={[styles.segment, tab === key ? styles.segmentActive : null]}
              >
                <Text style={[styles.segmentText, tab === key ? styles.segmentTextActive : null]}>{tabLabels[key]}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'ENTRADAS' ? (
            <Card>
              <Value>Entradas</Value>
              {received.length === 0 ? <Label>Nenhuma entrada ainda.</Label> : null}
              {entriesToShow.map((movement: Movement, index) => (
                <View key={`${movement.date}-${movement.amount}-${index}`} style={styles.entry}>
                  <View style={styles.entryText}>
                    <Text style={styles.entryTitle}>{movement.description}</Text>
                    <Label>{formatDateBR(movement.date)} - {originLabels[movement.type] ?? movement.type}</Label>
                  </View>
                  <Money value={movement.amount} />
                </View>
              ))}
            </Card>
          ) : null}

          {tab === 'SAIDAS' ? (
            <>
              {isAdmin ? <Button title="Lançar despesa" icon={Plus} onPress={() => navigation.navigate('Expenses', { openForm: true })} /> : null}
              {withoutDocument > 0 ? (
                <Card style={styles.warningCard}>
                  <Text style={styles.warningText}>
                    {withoutDocument} {withoutDocument === 1 ? 'saída está' : 'saídas estão'} sem comprovante anexado.
                  </Text>
                </Card>
              ) : null}
              <Card>
                <Value>Saídas</Value>
                {outgoing.length === 0 ? <Label>Nenhuma despesa lançada.</Label> : null}
                {outgoingToShow.map((expense) => {
                  const portalDocument = expense.documentId ? documentsById[expense.documentId] : undefined;
                  const category = !expense.category || expense.category === 'Manual' ? 'Outros' : expense.category;
                  return (
                    <View key={expense.id} style={styles.entry}>
                      <View style={styles.entryText}>
                        <Text style={styles.entryTitle}>{expense.description}</Text>
                        <Label>
                          {formatDateBR(expense.expenseDate)} - {category}{expense.supplier ? ` - ${expense.supplier}` : ''}
                        </Label>
                        {portalDocument ? (
                          <Pressable accessibilityRole="button" onPress={() => openDocument(portalDocument)} style={styles.documentLink}>
                            <Eye color={colors.blue} size={14} />
                            <Text style={styles.documentLinkText}>Ver {portalDocument.type === 'NOTA_FISCAL' ? 'nota fiscal' : 'comprovante'}</Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.noDocument}>Sem comprovante anexado</Text>
                        )}
                      </View>
                      <Money value={-expense.amount} />
                    </View>
                  );
                })}
              </Card>
            </>
          ) : null}

          {tab === 'CASAS' ? (
            <>
              {isAdmin ? (
                <>
                  <Button title="Gerar e gerenciar cobranças Pix" icon={QrCode} variant="ghost" onPress={() => navigation.navigate('AdminPixCharges')} />
                  {contributions.length === 0 ? <Card><Label>Nenhuma contribuição gerada neste mês.</Label></Card> : null}
                  {contributions.map((item) => (
                    <HouseCard
                      key={item.id}
                      title={item.houseLabel}
                      name={item.residentName}
                      value={item.amount}
                      status={item.status}
                      pixChargeId={item.pixChargeId}
                      onOpenPix={() => item.pixChargeId ? navigation.navigate('PixPayment', { id: item.pixChargeId }) : undefined}
                    />
                  ))}
                </>
              ) : (
                <>
                  {charges.length === 0 ? <Card><Label>Você ainda não tem contribuição neste mês.</Label></Card> : null}
                  {charges.map((charge) => (
                    <HouseCard
                      key={charge.id}
                      title={charge.houseLabel}
                      name={charge.month ? monthLabel(charge.month) : formatDateBR(charge.dueDate)}
                      description={`Vencimento ${formatDateBR(charge.dueDate)}`}
                      value={charge.value}
                      status={charge.status}
                      pixChargeId={charge.id}
                      onOpenPix={() => navigation.navigate('PixPayment', { id: charge.id })}
                    />
                  ))}
                </>
              )}
            </>
          ) : null}

          {tab !== 'CASAS' && listSize > PREVIEW_COUNT ? (
            <Button
              title={showAll ? 'Ver menos' : `Ver tudo (${listSize})`}
              variant="ghost"
              onPress={() => setShowAll((value) => !value)}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function HouseCard({
  title,
  name,
  description,
  value,
  status,
  pixChargeId,
  onOpenPix
}: {
  title: string;
  name?: string;
  description?: string;
  value: number;
  status: string;
  pixChargeId?: number;
  onOpenPix: () => void;
}) {
  return (
    <Card>
      <View style={styles.houseTop}>
        <View style={styles.houseIcon}>
          <Home color={colors.blue} size={22} />
        </View>
        <View style={styles.entryText}>
          <Text style={styles.entryTitle}>{title}</Text>
          {name ? <Label>{name}</Label> : null}
          {description ? <Label>{description}</Label> : null}
        </View>
        <View style={styles.houseRight}>
          <Badge status={status} />
          <Money value={value} />
        </View>
      </View>
      <Button title={pixChargeId ? 'Ver Pix' : 'Pix não gerado'} icon={QrCode} variant="ghost" onPress={onOpenPix} disabled={!pixChargeId} />
    </Card>
  );
}

const styles = StyleSheet.create({
  balance: { color: colors.ink, fontSize: 32, lineHeight: 38, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.track,
    borderRadius: 10,
    padding: 3,
    gap: 2
  },
  segment: { flex: 1, minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentActive: { backgroundColor: colors.surface, borderColor: colors.border },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: colors.ink, fontWeight: '700' },
  entry: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
  entryText: { flex: 1, minWidth: 0, gap: 2 },
  entryTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  documentLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 2 },
  documentLinkText: { color: colors.blue, fontSize: 12, fontWeight: '700' },
  noDocument: { color: colors.amber, fontSize: 12, fontWeight: '700' },
  warningCard: { backgroundColor: colors.amberSoft, borderColor: colors.amber },
  warningText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  houseTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  houseIcon: { width: 42, height: 42, borderRadius: 9, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  houseRight: { alignItems: 'flex-end', gap: 6 }
});
