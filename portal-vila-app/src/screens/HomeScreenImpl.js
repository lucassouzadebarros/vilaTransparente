// @ts-nocheck
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronDown, Lock, LogOut, QrCode, RefreshCw, ShieldCheck, WalletCards, Wrench } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { colors, spacing } from '../theme';
import { currentMonth, monthLabel } from '../utils/month';

const maintenanceOrder = [
  'Portao automatico',
  'Limpeza da vila',
  'Iluminacao comum',
  'Interfone'
];

export function HomeScreen() {
  const navigation = useNavigation();
  const { session, isAdmin, logout } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [charges, setCharges] = useState([]);
  const [services, setServices] = useState([]);
  const [month] = useState(currentMonth());
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const loadInFlight = useRef(false);

  async function load() {
    if (loadInFlight.current) {
      return;
    }
    loadInFlight.current = true;
    setRefreshing(true);
    try {
      const [nextDashboard, nextContributions, nextCharges, nextServices] = await Promise.all([
        api.dashboard(month),
        api.contributions(month),
        api.pixCharges(month),
        api.services()
      ]);
      setDashboard(nextDashboard);
      setContributions(nextContributions);
      setCharges(nextCharges);
      setServices(sortMaintenance(nextServices));
    } finally {
      loadInFlight.current = false;
      setRefreshing(false);
    }
  }

  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 30000);
      let events = null;
      if (typeof window !== 'undefined' && typeof window.EventSource === 'function') {
        events = new window.EventSource(api.dashboardEventsUrl());
        events.addEventListener('dashboard-changed', load);
      }
      return () => {
        clearInterval(interval);
        if (events) {
          events.close();
        }
      };
    }, [month])
  );

  const totals = {
    collected: dashboard?.collected ?? 0,
    checking: dashboard?.pending ?? 0,
    pending: dashboard?.overdue ?? 0
  };
  const movements = dashboard?.movements?.slice(0, 4) ?? [];
  const maintenance = services.slice(0, 4);
  const myContribution = contributions[0];
  const myCharge = charges.find((charge) => charge.id === myContribution?.pixChargeId) ?? charges[0];
  const firstName = session?.name?.split(' ')[0] ?? 'Joao';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={styles.topSpacer} />
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>Portal da Vila</Text>
          <Text style={styles.brandSubtitle}>Mensalidades, Pix, serviços e orçamentos</Text>
        </View>
        <Pressable accessibilityLabel="Atualizar inicio" style={[styles.headerIcon, refreshing ? styles.headerIconBusy : null]} onPress={load} disabled={refreshing}>
          <RefreshCw color={refreshing ? colors.muted : colors.ink} size={20} />
        </Pressable>
      </View>

      <View style={styles.userArea}>
        <Pressable style={styles.greeting} onPress={() => setUserMenuOpen((current) => !current)}>
        <Text style={styles.greetingText}>Ola, {firstName}</Text>
          <ChevronDown color={colors.muted} size={16} />
        </Pressable>
        {userMenuOpen ? (
          <View style={styles.userMenu}>
            <Pressable style={styles.logoutMenuItem} onPress={logout}>
              <LogOut color={colors.red} size={18} />
              <Text style={styles.logoutMenuText}>Sair</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {isAdmin ? (
        <>
          <LocalCard style={styles.balanceCard}>
            <Text style={styles.kicker}>SALDO ATUAL</Text>
            <Text style={styles.balanceValue}>{formatCurrency(dashboard?.balance ?? 0)}</Text>
          </LocalCard>

          <View style={styles.summaryGrid}>
            <SummaryCard title="ARRECADADO" value={totals.collected} />
            <SummaryCard title="A CONFERIR" value={totals.checking} />
            <SummaryCard title="PENDENTE" value={totals.pending} />
          </View>
        </>
      ) : null}

      {isAdmin ? (
        <LocalCard style={styles.contributionCard}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardTitle}>Painel administrativo</Text>
              <Text style={styles.cardSubtitle}>{monthLabel(month)} - {dashboard?.paidHouses ?? 0} casas pagas</Text>
            </View>
            <View style={styles.adminIcon}>
              <ShieldCheck color={colors.blue} size={22} />
            </View>
          </View>
          <View style={styles.inlineActions}>
            <Pressable style={styles.primaryAction} onPress={() => navigation.navigate('AdminPixCharges')}>
              <Text style={styles.primaryActionText}>Cobrancas Pix</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={() => navigation.navigate('Contributions')}>
              <Text style={styles.secondaryActionText}>Contribuicoes</Text>
            </Pressable>
          </View>
        </LocalCard>
      ) : (
        <>
          <LocalCard style={styles.contributionCard}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Minha mensalidade</Text>
                <Text style={styles.cardSubtitle}>{myContribution?.houseLabel ?? 'Minha casa'} - {monthLabel(month)}</Text>
              </View>
              <StatusPill status={myContribution?.status} />
            </View>
            <View style={styles.contributionInfo}>
              <Text style={styles.contributionLabel}>Valor</Text>
              <Text style={styles.contributionValue}>{formatCurrency(myContribution?.amount ?? 0)}</Text>
            </View>
            <Text style={styles.cardSubtitle}>
              {myContribution?.paymentDate
                ? `Confirmado em ${formatDate(myContribution.paymentDate)}`
                : myCharge?.dueDate
                  ? `Vence em ${formatDate(myCharge.dueDate)}`
                  : 'Cobranca Pix ainda nao gerada'}
            </Text>
            <Pressable
              disabled={!myCharge?.id}
              style={[styles.primaryAction, !myCharge?.id ? styles.disabledAction : null]}
              onPress={() => navigation.navigate('PixPayment', { id: myCharge.id })}
            >
              <QrCode color={colors.surface} size={18} />
              <Text style={styles.primaryActionText}>{myCharge?.id ? 'Ver Pix do mes' : 'Pix nao gerado'}</Text>
            </Pressable>
          </LocalCard>

          {dashboard?.transparencyEnabled ? (
            <TransparencyOpenCard dashboard={dashboard} navigation={navigation} />
          ) : (
            <TransparencyLockedCard />
          )}
        </>
      )}

      <SectionTitle title="Manutencoes em destaque" />
      <LocalCard style={styles.listCard}>
        {maintenance.map((item, index) => (
          <ShortcutRow
            key={`${item.id ?? item.title}-${index}`}
            item={item}
            last={index === maintenance.length - 1}
            onPress={() => navigation.navigate('ServiceDetails', { id: item.id })}
          />
        ))}
      </LocalCard>

      <SectionTitle title="Ultimos lancamentos" />
      <LocalCard style={styles.launchCard}>
        {movements.length > 0 ? (
          movements.map((movement, index) => (
            <View key={`${movement.date}-${index}`} style={styles.launchRow}>
              <Text style={styles.launchDate}>{formatDate(movement.date)}</Text>
              <Text style={styles.launchDescription}>{movement.description}</Text>
              <Text style={styles.launchValue}>{formatCurrency(Math.abs(movement.amount))}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>Nenhum lancamento recente.</Text>
        )}
      </LocalCard>
    </ScrollView>
  );
}

function LocalCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function SummaryCard({ title, value }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>{title}</Text>
      <Text style={styles.summaryValue}>{formatCurrency(value)}</Text>
    </View>
  );
}

function TransparencyLockedCard() {
  return (
    <LocalCard style={styles.transparencyCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.transparencyTitleWrap}>
          <Text style={styles.cardTitle}>Transparencia financeira</Text>
          <Text style={styles.cardSubtitle}>Liberada apos sua primeira contribuicao</Text>
        </View>
        <View style={styles.lockIcon}>
          <Lock color={colors.muted} size={21} />
        </View>
      </View>
      <Text style={styles.lockedText}>
        Quando o pagamento for confirmado, voce acompanha saldo acumulado, arrecadacao e despesas da vila.
      </Text>
      <View style={styles.disabledInfo}>
        <Text style={styles.disabledInfoText}>Aguardando pagamento confirmado</Text>
      </View>
    </LocalCard>
  );
}

function TransparencyOpenCard({ dashboard, navigation }) {
  return (
    <LocalCard style={styles.transparencyCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.transparencyTitleWrap}>
          <Text style={styles.cardTitle}>Saldo acumulado da vila</Text>
          <Text style={styles.cardSubtitle}>Transparencia liberada</Text>
        </View>
        <View style={styles.adminIcon}>
          <WalletCards color={colors.blue} size={22} />
        </View>
      </View>
      <Text style={styles.balanceInline}>{formatCurrency(dashboard?.balance ?? 0)}</Text>
      <View style={styles.transparencyRows}>
        <SummaryLine label="Arrecadado" value={dashboard?.collected ?? 0} />
        <SummaryLine label="Despesas" value={dashboard?.expenses ?? 0} />
        <View style={styles.summaryLine}>
          <Text style={styles.summaryLineLabel}>Casas pagas</Text>
          <Text style={styles.summaryLineValue}>{dashboard?.paidHouses ?? 0}</Text>
        </View>
      </View>
      <Pressable style={styles.primaryAction} onPress={() => navigation.navigate('Caixa')}>
        <Text style={styles.primaryActionText}>Ver transparencia</Text>
      </Pressable>
    </LocalCard>
  );
}

function SummaryLine({ label, value }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLineLabel}>{label}</Text>
      <Text style={styles.summaryLineValue}>{formatCurrency(value)}</Text>
    </View>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function StatusPill({ status }) {
  return (
    <View style={[styles.statusPill, status === 'PAID' ? styles.statusPaid : status === 'OVERDUE' ? styles.statusOverdue : styles.statusPending]}>
      <Text style={styles.statusText}>{status === 'PAID' ? 'PAGO' : status === 'OVERDUE' ? 'VENCIDO' : 'PENDENTE'}</Text>
    </View>
  );
}

function ShortcutRow({ item, last, onPress }) {
  const isAttention = item.priority === 'URGENTE' || item.status === 'PLANEJADO';
  return (
    <View style={[styles.shortcutRow, last ? styles.lastRow : null]}>
      <View style={styles.shortcutIcon}>
        <Wrench color={colors.ink} size={22} />
      </View>
      <View style={styles.shortcutText}>
        <Text style={styles.shortcutTitle}>{item.title}</Text>
        <Text style={styles.shortcutSubtitle}>{formatServiceSubtitle(item)}</Text>
      </View>
      {isAttention ? (
        <Pressable onPress={onPress} style={styles.warningBadge}>
          <Text style={styles.warningText}>{formatStatus(item.status)}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onPress} style={styles.rowAction}>
          <Text style={styles.rowActionText}>Detalhes</Text>
        </Pressable>
      )}
    </View>
  );
}

function sortMaintenance(items) {
  return [...items].sort((a, b) => {
    const aIndex = maintenanceOrder.indexOf(a.title);
    const bIndex = maintenanceOrder.indexOf(b.title);
    if (aIndex >= 0 && bIndex >= 0) {
      return aIndex - bIndex;
    }
    if (aIndex >= 0) {
      return -1;
    }
    if (bIndex >= 0) {
      return 1;
    }
    return String(a.title).localeCompare(String(b.title));
  });
}

function formatServiceSubtitle(item) {
  const category = item.category || 'Manutencao';
  const value = item.finalValue ?? item.expectedValue;
  const amount = value ? ` · ${formatCurrency(value)}` : '';
  return `${category} · ${formatStatus(item.status)}${amount}`;
}

function formatStatus(status) {
  const labels = {
    PLANEJADO: 'Planejado',
    APROVADO: 'Aprovado',
    EM_ANDAMENTO: 'Em andamento',
    FINALIZADO: 'Finalizado',
    CANCELADO: 'Cancelado'
  };
  return labels[status] || status || 'Em analise';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) {
    return String(value);
  }
  return `${day}/${month}/${year}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    padding: spacing.md,
    paddingBottom: 96,
    gap: spacing.sm
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  topSpacer: {
    width: 42
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1
  },
  headerIconBusy: {
    opacity: 0.55
  },
  brand: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center'
  },
  brandBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0
  },
  brandSubtitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 1,
    textAlign: 'center'
  },
  greeting: {
    alignSelf: 'flex-start',
    minHeight: 38,
    minWidth: 130,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  userArea: {
    alignSelf: 'flex-start',
    position: 'relative',
    zIndex: 5
  },
  userMenu: {
    position: 'absolute',
    top: 44,
    left: 0,
    minWidth: 130,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4
  },
  logoutMenuItem: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  logoutMenuText: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '900'
  },
  greetingText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 13
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md
  },
  balanceCard: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg
  },
  kicker: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center'
  },
  balanceValue: {
    color: colors.blue,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: spacing.xs
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  summaryCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs
  },
  summaryTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center'
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center'
  },
  contributionCard: {
    gap: spacing.md
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900'
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4
  },
  adminIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  transparencyCard: {
    gap: spacing.md
  },
  transparencyTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  lockIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  lockedText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  disabledInfo: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md
  },
  disabledInfoText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center'
  },
  balanceInline: {
    color: colors.blue,
    fontSize: 28,
    fontWeight: '900'
  },
  transparencyRows: {
    gap: spacing.sm
  },
  summaryLine: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  summaryLineLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  summaryLineValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900'
  },
  contributionInfo: {
    gap: spacing.xs
  },
  contributionLabel: {
    color: colors.muted,
    fontSize: 13
  },
  contributionValue: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '900'
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  primaryAction: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md
  },
  secondaryAction: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '900'
  },
  secondaryActionText: {
    color: colors.blue,
    fontSize: 14,
    fontWeight: '900'
  },
  disabledAction: {
    opacity: 0.5
  },
  statusPill: {
    minHeight: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md
  },
  statusPaid: {
    backgroundColor: colors.greenSoft
  },
  statusPending: {
    backgroundColor: colors.amberSoft
  },
  statusOverdue: {
    backgroundColor: colors.redSoft
  },
  statusText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900'
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
    marginTop: spacing.xs
  },
  listCard: {
    padding: 0,
    gap: 0
  },
  shortcutRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  lastRow: {
    borderBottomWidth: 0
  },
  shortcutIcon: {
    width: 32,
    alignItems: 'center'
  },
  shortcutText: {
    flex: 1,
    minWidth: 0
  },
  shortcutTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  shortcutSubtitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  rowAction: {
    minWidth: 66,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm
  },
  rowActionText: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '900'
  },
  warningBadge: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: colors.redSoft,
    borderWidth: 1,
    borderColor: '#F7B7A8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm
  },
  warningText: {
    color: colors.red,
    fontSize: 12,
    fontWeight: '900'
  },
  launchCard: {
    gap: spacing.sm
  },
  launchRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  launchDate: {
    width: 78,
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700'
  },
  launchDescription: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700'
  },
  launchValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900'
  },
  empty: {
    color: colors.muted,
    fontWeight: '700'
  }
});
