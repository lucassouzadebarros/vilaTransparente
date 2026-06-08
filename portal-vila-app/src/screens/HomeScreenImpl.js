// @ts-nocheck
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Lock,
  LogOut,
  QrCode,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  Wrench
} from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { colors, spacing } from '../theme';
import { currentMonth, monthLabel } from '../utils/month';

const maintenanceOrder = [
  'Portao automatico',
  'Limpeza da vila',
  'Iluminação comum',
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
  const [refreshing, setRefreshing] = useState(false);
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

  useFocusEffect(
    useCallback(() => {
      load();
      const interval = setInterval(load, 15000);
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
    }, [isAdmin, month])
  );

  const movements = dashboard?.movements?.slice(0, 4) ?? [];
  const maintenance = services.slice(0, 3);
  const myContribution = contributions[0];
  const myCharge = charges.find((charge) => charge.id === myContribution?.pixChargeId) ?? charges[0];
  const firstName = session?.name?.split(' ')[0] ?? 'João';
  const greetingName = isAdmin ? firstName : myContribution?.houseLabel ?? firstName;

  const hasPaidContribution = contributions.some((contribution) => contribution?.status === 'PAID');
  const hasVisibleFinancialData = (dashboard?.movements?.length ?? 0) > 0
    || Number(dashboard?.collected ?? 0) > 0
    || Number(dashboard?.totalCollected ?? 0) > 0;
  const transparencyUnlocked = isAdmin || dashboard?.transparencyEnabled === true || hasPaidContribution || hasVisibleFinancialData;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SoftBackdrop compact />

      <View style={styles.topBar}>
        <View style={styles.topSpacer} />
        <Text style={styles.screenTitle}>Início</Text>
        <Pressable accessibilityLabel="Atualizar início" style={styles.headerIcon} onPress={load} disabled={refreshing}>
          {isAdmin ? <RefreshCw color={refreshing ? colors.muted : colors.ink} size={18} /> : <Bell color={colors.ink} size={21} />}
        </Pressable>
      </View>

      <View style={styles.userArea}>
        <Pressable style={styles.greetingPlain} onPress={() => setUserMenuOpen((current) => !current)}>
          <Text style={styles.greetingText}>Olá, <Text style={styles.greetingName}>{greetingName}</Text></Text>
          <ChevronDown color={colors.muted} size={18} />
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
        <AdminHome
          dashboard={dashboard}
          month={month}
          navigation={navigation}
        />
      ) : (
        <>
          <MonthlyCard
            contribution={myContribution}
            charge={myCharge}
            month={month}
            navigation={navigation}
          />
          {transparencyUnlocked ? (
            <TransparencyOpenCard dashboard={dashboard} navigation={navigation} />
          ) : (
            <TransparencyLockedCard />
          )}
        </>
      )}

      <SectionTitle icon={Wrench} title="Serviços e orçamentos" />
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
          <View style={styles.emptyRow}>
            <View style={styles.emptyIcon}>
              <FileText color={colors.muted} size={18} />
            </View>
            <Text style={styles.emptyList}>Nenhum serviço cadastrado.</Text>
          </View>
        )}
      </LocalCard>

      {transparencyUnlocked ? (
        <>
          <SectionTitle icon={Clock3} title="Últimos lançamentos" />
          <LocalCard style={styles.launchCard}>
            {movements.length > 0 ? (
              movements.map((movement, index) => <MovementRow key={`${movement.date}-${index}`} movement={movement} last={index === movements.length - 1} />)
            ) : (
              <Text style={styles.empty}>Nenhum lançamento recente.</Text>
            )}
          </LocalCard>
        </>
      ) : null}
    </ScrollView>
  );
}

function AdminHome({ dashboard, month, navigation }) {
  return (
    <>
      <LocalCard style={styles.adminBalanceCard}>
        <View style={styles.adminIcon}>
          <ShieldCheck color={colors.blue} size={24} />
        </View>
        <View style={styles.adminBalanceCopy}>
          <Text style={styles.summaryLabel}>Saldo atual</Text>
          <Text style={styles.balanceValue}>{formatCurrency(dashboard?.balance ?? 0)}</Text>
        </View>
      </LocalCard>
      <LocalCard style={styles.transparencyCard}>
        <Text style={styles.cardTitle}>Mensalidades do mês</Text>
        <View style={styles.metricGrid}>
          <MetricCard icon={TrendingUp} tone="blue" label="Arrecadado" value={formatCurrency(dashboard?.collected ?? 0)} caption={monthLabel(month)} />
          <MetricCard icon={Users} tone="lilac" label="Casas pagas" value={String(dashboard?.paidHouses ?? 0)} />
          <MetricCard icon={ArrowDown} tone="red" label="Pendentes" value={String(dashboard?.pendingHouses ?? 0)} />
        </View>
        <Pressable style={styles.primaryAction} onPress={() => navigation.navigate('AdminPixCharges')}>
          <QrCode color={colors.surface} size={18} />
          <Text style={styles.primaryActionText}>Gerenciar Pix</Text>
        </Pressable>
      </LocalCard>
    </>
  );
}

function MonthlyCard({ contribution, charge, month, navigation }) {
  const paid = contribution?.status === 'PAID';
  const overdue = contribution?.status === 'OVERDUE';
  return (
    <LocalCard style={styles.monthlyCard}>
      <View style={styles.monthlyIcon}>
        <CalendarCheck color={colors.teal} size={28} />
      </View>
      <View style={styles.monthlyCopy}>
        <View style={styles.cardHeaderRow}>
          <View>
            <Text style={styles.cardTitle}>Minha mensalidade</Text>
            <Text style={styles.cardMonth}>{contribution?.month ? monthLabel(contribution.month) : monthLabel(month)}</Text>
          </View>
          <StatusPill status={contribution?.status} />
        </View>
        <Text style={styles.contributionValue}>{formatCurrency(contribution?.amount ?? charge?.value ?? 0)}</Text>
        <View style={styles.confirmRow}>
          {paid ? <CheckCircle2 color={colors.teal} size={18} /> : null}
          <Text style={styles.cardSubtitle}>
            {paid && contribution?.paymentDate
              ? `Confirmado em ${formatDate(contribution.paymentDate)}`
              : charge?.dueDate
                ? `${overdue ? 'Vencido em' : 'Vence em'} ${formatDate(charge.dueDate)}`
                : 'Cobrança Pix ainda não gerada'}
          </Text>
        </View>
        {!paid ? (
          <Pressable
            disabled={!charge?.id}
            style={[styles.primaryAction, !charge?.id ? styles.disabledAction : null]}
            onPress={() => navigation.navigate('PixPayment', { id: charge.id })}
          >
            <QrCode color={colors.surface} size={18} />
            <Text style={styles.primaryActionText}>{charge?.id ? 'Ver Pix' : 'Pix não gerado'}</Text>
          </Pressable>
        ) : null}
      </View>
    </LocalCard>
  );
}

function LocalCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function TransparencyLockedCard() {
  return (
    <LocalCard style={styles.transparencyCard}>
      <Text style={styles.cardTitle}>Transparência financeira</Text>
      <View style={styles.lockedBody}>
        <View style={styles.lockCircle}>
          <Lock color={colors.ink} size={26} />
        </View>
        <View style={styles.lockedCopy}>
          <Text style={styles.lockedTitle}>Desbloqueie todas as funcionalidades</Text>
          <Text style={styles.lockedText}>Faça seu primeiro pagamento para desbloquear.</Text>
        </View>
      </View>
      <View style={styles.disabledInfo}>
        <Text style={styles.disabledInfoText}>Aguardando pagamento</Text>
      </View>
    </LocalCard>
  );
}

function TransparencyOpenCard({ dashboard, navigation }) {
  const totalCollected = dashboard?.totalCollected ?? dashboard?.collected ?? 0;
  const expenses = dashboard?.expenses ?? 0;
  const balance = dashboard?.balance ?? 0;
  return (
    <LocalCard style={styles.transparencyCard}>
      <Text style={styles.cardTitle}>Saldo acumulado da vila</Text>
      <Text style={styles.balanceOpenValue}>{formatCurrency(balance)}</Text>
      <View style={styles.metricGrid}>
        <MetricCard
          icon={TrendingUp}
          tone="blue"
          label="Arrecadado total"
          value={formatCurrency(totalCollected)}
          caption={`Mês ${formatCurrency(dashboard?.collected ?? 0)}`}
        />
        <MetricCard icon={ArrowDown} tone="red" label="Despesas" value={formatCurrency(expenses)} />
        <MetricCard icon={Users} tone="lilac" label="Casas pagas" value={String(dashboard?.paidHouses ?? 0)} />
      </View>
      <Pressable style={styles.primaryAction} onPress={() => navigation.navigate('Caixa')}>
        <BarChart3 color={colors.surface} size={18} />
        <Text style={styles.primaryActionText}>Ver transparência</Text>
      </Pressable>
    </LocalCard>
  );
}

function MetricCard({ icon: Icon, tone, label, value, caption }) {
  const color = tone === 'red' ? colors.red : tone === 'lilac' ? colors.lilac : colors.blue;
  const backgroundColor = tone === 'red' ? colors.redSoft : tone === 'lilac' ? '#EFE9FF' : colors.blueSoft;
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor }]}>
        <Icon color={color} size={19} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {caption ? <Text style={styles.metricCaption}>{caption}</Text> : null}
    </View>
  );
}

function SectionTitle({ icon: Icon, title }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingIcon}>
        <Icon color={colors.surface} size={18} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
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
        <Wrench color={colors.blue} size={19} />
      </View>
      <View style={styles.shortcutText}>
        <Text style={styles.shortcutTitle}>{item.title}</Text>
        <Text style={styles.shortcutStatus}>{formatStatus(item.status)}</Text>
      </View>
      <ChevronRight color={colors.muted} size={20} />
    </Pressable>
  );
}

function MovementRow({ movement, last }) {
  const isExpense = Number(movement.amount) < 0;
  return (
    <View style={[styles.movementRow, last ? styles.lastRow : null]}>
      <View style={[styles.movementIcon, isExpense ? styles.movementExpenseIcon : styles.movementIncomeIcon]}>
        {isExpense ? <ArrowUp color={colors.red} size={18} /> : <ArrowDown color={colors.green} size={18} />}
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

function formatStatus(status) {
  const labels = {
    PLANEJADO: 'Planejado',
    APROVADO: 'Aprovado',
    EM_ANDAMENTO: 'Em andamento',
    FINALIZADO: 'Finalizado',
    CANCELADO: 'Cancelado'
  };
  return labels[status] || status || 'Em análise';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
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
    width: '100%',
    maxWidth: 375,
    alignSelf: 'center',
    paddingHorizontal: 13,
    paddingTop: 6,
    paddingBottom: 106,
    gap: 12,
    position: 'relative'
  },
  topBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1
  },
  topSpacer: {
    width: 40
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center'
  },
  greetingPlain: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
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
    shadowColor: '#163052',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
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
    fontSize: 23,
    lineHeight: 29
  },
  greetingName: {
    color: colors.blue
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    zIndex: 1
  },
  monthlyCard: {
    minHeight: 126,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start'
  },
  monthlyIcon: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#E3F7ED',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  monthlyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900'
  },
  cardMonth: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 2
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600'
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  contributionValue: {
    color: colors.ink,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900'
  },
  primaryAction: {
    minHeight: 39,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 12
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900'
  },
  disabledAction: {
    opacity: 0.5
  },
  statusPill: {
    minHeight: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
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
    fontSize: 11,
    lineHeight: 14,
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
  transparencyCard: {
    gap: 12
  },
  balanceOpenValue: {
    color: colors.green,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '900'
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8
  },
  metricCard: {
    flex: 1,
    minHeight: 102,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    gap: 4,
    backgroundColor: colors.surface
  },
  metricIcon: {
    width: 46,
    height: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3
  },
  metricLabel: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'center'
  },
  metricValue: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'center'
  },
  metricCaption: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center'
  },
  lockedBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6
  },
  lockCircle: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  lockedCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6
  },
  lockedTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900'
  },
  lockedText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  disabledInfo: {
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: '#E8ECF2',
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
  sectionHeading: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 1
  },
  sectionHeadingIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900'
  },
  listCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden'
  },
  shortcutRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  lastRow: {
    borderBottomWidth: 0
  },
  serviceIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  shortcutText: {
    flex: 1,
    minWidth: 0
  },
  shortcutTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900'
  },
  shortcutStatus: {
    color: colors.blue,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    marginTop: 2
  },
  emptyRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 9,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyList: {
    flex: 1,
    color: colors.muted,
    fontWeight: '900',
    fontSize: 13,
    lineHeight: 18
  },
  launchCard: {
    padding: 0,
    gap: 0,
    overflow: 'hidden'
  },
  movementRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  movementIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
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
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900'
  },
  movementDate: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    fontWeight: '700'
  },
  movementValue: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900'
  },
  incomeValue: {
    color: colors.green
  },
  expenseValue: {
    color: colors.red
  },
  empty: {
    color: colors.muted,
    fontWeight: '700',
    padding: spacing.lg
  },
  adminBalanceCard: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  adminIcon: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  adminBalanceCopy: {
    flex: 1,
    gap: spacing.xs
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700'
  },
  balanceValue: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '900'
  }
});
