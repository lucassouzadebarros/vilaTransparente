// @ts-nocheck
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ArrowDown, ArrowUp, BarChart3, Bell, ChevronDown, ChevronRight, Lock, LogOut, QrCode, RefreshCw, ShieldCheck, TrendingUp, Users, WalletCards, Wrench } from 'lucide-react-native';
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
  const greetingName = isAdmin ? firstName : myContribution?.houseLabel ?? firstName;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={styles.topSpacer} />
        <View style={styles.titleBlock}>
          <Text style={styles.screenTitle}>Inicio</Text>
          <Text style={styles.brandSubtitle}>Mensalidades, Pix, serviços e orçamentos</Text>
        </View>
        <Pressable accessibilityLabel="Atualizar inicio" style={[styles.headerIcon, refreshing ? styles.headerIconBusy : null]} onPress={load} disabled={refreshing}>
          {isAdmin ? <RefreshCw color={refreshing ? colors.muted : colors.ink} size={20} /> : <Bell color={colors.ink} size={22} />}
        </Pressable>
      </View>

      <View style={styles.userArea}>
        <Pressable style={styles.greetingPlain} onPress={() => setUserMenuOpen((current) => !current)}>
          <Text style={styles.greetingText}>Ola, <Text style={styles.greetingName}>{greetingName}</Text></Text>
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
                <Text style={styles.cardMonth}>{monthLabel(month)}</Text>
              </View>
              <StatusPill status={myContribution?.status} />
            </View>
            <Text style={styles.contributionValue}>{formatCurrency(myContribution?.amount ?? 0)}</Text>
            <Text style={styles.cardSubtitle}>
              {myContribution?.paymentDate
                ? `Confirmado em ${formatDate(myContribution.paymentDate)}`
                : myCharge?.dueDate
                  ? `Vence em ${formatDate(myCharge.dueDate)}`
                  : 'Cobranca Pix ainda nao gerada'}
            </Text>
            {myContribution?.status !== 'PAID' ? (
              <Pressable
                disabled={!myCharge?.id}
                style={[styles.primaryAction, !myCharge?.id ? styles.disabledAction : null]}
                onPress={() => navigation.navigate('PixPayment', { id: myCharge.id })}
              >
                <QrCode color={colors.surface} size={18} />
                <Text style={styles.primaryActionText}>{myCharge?.id ? 'Ver Pix' : 'Pix nao gerado'}</Text>
              </Pressable>
            ) : null}
          </LocalCard>

          {dashboard?.transparencyEnabled ? (
            <TransparencyOpenCard dashboard={dashboard} navigation={navigation} />
          ) : (
            <TransparencyLockedCard />
          )}
        </>
      )}

      <SectionTitle title="Servicos e orcamentos" />
      <LocalCard style={styles.listCard}>
        {maintenance.length > 0 ? (
          maintenance.map((item, index) => (
            <ShortcutRow
              key={`${item.id ?? item.title}-${index}`}
              item={item}
              last={index === maintenance.length - 1}
              onPress={() => navigation.navigate('ServiceDetails', { id: item.id })}
            />
          ))
        ) : (
          <Text style={styles.emptyList}>Nenhum servico cadastrado.</Text>
        )}
      </LocalCard>

      {isAdmin || dashboard?.transparencyEnabled ? (
        <>
          <SectionTitle title="Ultimos lancamentos" />
          <LocalCard style={styles.launchCard}>
            {movements.length > 0 ? (
              movements.map((movement, index) => <MovementRow key={`${movement.date}-${index}`} movement={movement} />)
            ) : (
              <Text style={styles.empty}>Nenhum lancamento recente.</Text>
            )}
          </LocalCard>
        </>
      ) : null}
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
      <Text style={styles.cardTitle}>Transparencia financeira</Text>
      <View style={styles.lockedBody}>
        <View style={styles.lockCircle}>
          <Lock color={colors.ink} size={27} />
        </View>
        <View style={styles.lockedCopy}>
          <Text style={styles.lockedTitle}>Desbloqueie todas as funcionalidades</Text>
          <Text style={styles.lockedText}>
            Faca sua primeira pagamento para desbloquear.
          </Text>
        </View>
      </View>
      <View style={styles.disabledInfo}>
        <Text style={styles.disabledInfoText}>Aguardando desbloqueio</Text>
      </View>
    </LocalCard>
  );
}

function TransparencyOpenCard({ dashboard, navigation }) {
  return (
    <LocalCard style={styles.transparencyCard}>
      <Text style={styles.cardTitle}>Saldo acumulado da vila</Text>
      <Text style={styles.balanceOpenValue}>{formatCurrency(dashboard?.balance ?? 0)}</Text>
      <View style={styles.metricGrid}>
        <MetricCard icon={TrendingUp} tone="blue" label="Arrecadado" value={formatCurrency(dashboard?.collected ?? 0)} />
        <MetricCard icon={ArrowDown} tone="red" label="Despesas" value={formatCurrency(dashboard?.expenses ?? 0)} />
        <MetricCard icon={Users} tone="lilac" label="Casas pagas" value={String(dashboard?.paidHouses ?? 0)} />
      </View>
      <Pressable style={styles.primaryAction} onPress={() => navigation.navigate('Caixa')}>
        <BarChart3 color={colors.surface} size={18} />
        <Text style={styles.primaryActionText}>Ver transparencia</Text>
      </Pressable>
    </LocalCard>
  );
}

function MetricCard({ icon: Icon, tone, label, value }) {
  const color = tone === 'red' ? colors.red : tone === 'lilac' ? colors.lilac : colors.blue;
  const backgroundColor = tone === 'red' ? colors.redSoft : tone === 'lilac' ? '#EFE9FF' : colors.blueSoft;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor }]}>
        <Icon color={color} size={21} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SectionTitle({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function StatusPill({ status }) {
  const isPaid = status === 'PAID';
  const isOverdue = status === 'OVERDUE';
  return (
    <View style={[styles.statusPill, isPaid ? styles.statusPaid : isOverdue ? styles.statusOverdue : styles.statusPending]}>
      <Text style={[styles.statusText, isPaid ? styles.statusTextPaid : isOverdue ? styles.statusTextOverdue : styles.statusTextPending]}>
        {isPaid ? 'PAGO' : isOverdue ? 'VENCIDO' : 'PENDENTE'}
      </Text>
    </View>
  );
}

function ShortcutRow({ item, last, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.shortcutRow, last ? styles.lastRow : null]}>
      <View style={styles.serviceIconCircle}>
        <Wrench color={colors.blue} size={21} />
      </View>
      <Text style={styles.shortcutTitle}>{item.title}</Text>
      <Text style={styles.shortcutStatus}>{formatStatus(item.status)}</Text>
      <ChevronRight color={colors.muted} size={20} />
    </Pressable>
  );
}

function MovementRow({ movement }) {
  const isExpense = Number(movement.amount) < 0;
  return (
    <View style={styles.movementRow}>
      <View style={[styles.movementIcon, isExpense ? styles.movementExpenseIcon : styles.movementIncomeIcon]}>
        {isExpense ? <ArrowUp color={colors.red} size={20} /> : <ArrowDown color={colors.green} size={20} />}
      </View>
      <View style={styles.movementText}>
        <Text style={styles.movementDescription}>{movement.description}</Text>
        <Text style={styles.movementDate}>{formatDate(movement.date)}</Text>
      </View>
      <Text style={[styles.movementValue, isExpense ? styles.expenseValue : styles.incomeValue]}>
        {isExpense ? '-' : ''}{formatCurrency(Math.abs(movement.amount))}
      </Text>
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 96,
    gap: spacing.md
  },
  topBar: {
    minHeight: 52,
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
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1
  },
  headerIconBusy: {
    opacity: 0.55
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center'
  },
  titleBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0
  },
  brandSubtitle: {
    display: 'none'
  },
  greetingPlain: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
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
    fontWeight: '900',
    fontSize: 20
  },
  greetingName: {
    color: colors.blue
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg
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
    fontSize: 19,
    fontWeight: '900'
  },
  cardMonth: {
    color: colors.muted,
    fontSize: 17,
    fontWeight: '700',
    marginTop: spacing.xs
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
    gap: spacing.md,
    padding: spacing.lg
  },
  lockedBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm
  },
  lockCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  lockedCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm
  },
  lockedTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '900'
  },
  lockedText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700'
  },
  disabledInfo: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: '#E8ECF2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md
  },
  disabledInfoText: {
    color: colors.muted,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center'
  },
  balanceOpenValue: {
    color: colors.green,
    fontSize: 30,
    fontWeight: '900'
  },
  metricGrid: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  metricCard: {
    flex: 1,
    minHeight: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    gap: spacing.xs
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs
  },
  metricLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center'
  },
  metricValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center'
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
    fontSize: 28,
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
    borderRadius: 10,
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
    fontSize: 12,
    fontWeight: '900'
  },
  statusTextPaid: {
    color: colors.green
  },
  statusTextPending: {
    color: '#D85B00'
  },
  statusTextOverdue: {
    color: colors.red
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '900',
    marginTop: spacing.xs
  },
  listCard: {
    padding: 0,
    gap: 0
  },
  shortcutRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  lastRow: {
    borderBottomWidth: 0
  },
  serviceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blueSoft,
    alignItems: 'center'
    ,
    justifyContent: 'center',
    flexShrink: 0
  },
  shortcutText: {
    flex: 1,
    minWidth: 0
  },
  shortcutTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
    flex: 1,
    minWidth: 0
  },
  shortcutStatus: {
    color: colors.blue,
    fontSize: 13,
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
    padding: 0,
    gap: 0
  },
  movementRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  movementIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  movementIncomeIcon: {
    backgroundColor: colors.greenSoft
  },
  movementExpenseIcon: {
    backgroundColor: colors.redSoft
  },
  movementText: {
    flex: 1,
    minWidth: 0
  },
  movementDescription: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '800'
  },
  movementDate: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
    fontWeight: '700'
  },
  movementValue: {
    fontSize: 15,
    fontWeight: '900'
  },
  incomeValue: {
    color: colors.green
  },
  expenseValue: {
    color: colors.red
  },
  emptyList: {
    color: colors.muted,
    fontWeight: '800',
    padding: spacing.lg
  },
  empty: {
    color: colors.muted,
    fontWeight: '700',
    padding: spacing.lg
  }
});
