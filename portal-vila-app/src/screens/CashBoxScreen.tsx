import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CalendarDays, Home, ListChecks, Lock, ReceiptText, RefreshCw, WalletCards } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Badge } from '../components/ui';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { api } from '../services/api';
import { Contribution, Dashboard, PixCharge } from '../types';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme';
import { currentMonth } from '../utils/month';

export function CashBoxScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [charges, setCharges] = useState<PixCharge[]>([]);
  const [month] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const loadInFlight = useRef(false);

  async function load() {
    if (loadInFlight.current) {
      return;
    }
    loadInFlight.current = true;
    setLoading(true);
    try {
      const [dash, list, pixList] = await Promise.all([
        api.dashboard(month),
        api.contributions(month),
        isAdmin ? api.pixCharges(month) : api.syncMyPixCharges()
      ]);
      setDashboard(dash);
      setContributions(list);
      setCharges(pixList);
    } finally {
      loadInFlight.current = false;
      setLoading(false);
    }
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
      if (typeof window !== 'undefined' && typeof window.EventSource === 'function') {
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

  const visibleContributions = isAdmin ? contributions.slice(0, 5) : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SoftBackdrop compact />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Caixa</Text>
          <Text style={styles.subtitle}>Resumo financeiro</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Atualizar caixa" onPress={load} style={styles.refreshButton}>
          <RefreshCw color={loading ? colors.muted : colors.blue} size={24} />
        </Pressable>
      </View>

      {!isAdmin && dashboard?.transparencyEnabled === false ? (
        <View style={styles.lockedCard}>
          <Lock color={colors.ink} size={24} />
          <View style={styles.lockedCopy}>
            <Text style={styles.lockedTitle}>Desbloqueie todas as funcionalidades</Text>
            <Text style={styles.lockedText}>Faça seu primeiro pagamento para desbloquear.</Text>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.balanceCard}>
            <View style={styles.balanceTop}>
              <View style={styles.walletIcon}>
                <WalletCards color={colors.surface} size={25} />
              </View>
              <View style={styles.balanceCopy}>
                <Text style={styles.summaryLabel}>Saldo acumulado da vila</Text>
                <Text style={styles.balanceValue}>{formatCurrency(dashboard?.balance ?? 0)}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <SummaryRow icon={WalletCards} label="Arrecadado total" value={formatCurrency(dashboard?.totalCollected ?? dashboard?.collected ?? 0)} />
            <SummaryRow icon={CalendarDays} label={`Arrecadado no mês (${monthLabel(month)})`} value={formatCurrency(dashboard?.collected ?? 0)} />
            <SummaryRow icon={ReceiptText} label="Despesas acumuladas" value={formatCurrency(dashboard?.expenses ?? 0)} />
          </View>

          <View style={styles.actionsRow}>
            <Pressable style={styles.primaryAction} onPress={() => navigation.navigate('Contributions')}>
              <ListChecks color={colors.surface} size={16} />
              <Text style={styles.primaryActionText}>Contribuições</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={() => navigation.navigate('Expenses')}>
              <ReceiptText color={colors.blue} size={16} />
              <Text style={styles.secondaryActionText}>Despesas</Text>
            </Pressable>
          </View>
        </>
      )}

      {visibleContributions.map((item) => (
        <ContributionCard
          key={item.id}
          title={item.houseLabel}
          name={item.residentName}
          value={item.amount}
          status={item.status}
          pixChargeId={item.pixChargeId}
          onOpenPix={() => item.pixChargeId ? navigation.navigate('PixPayment', { id: item.pixChargeId }) : undefined}
        />
      ))}

      {!isAdmin ? (
        <>
          {charges.map((charge) => (
            <ContributionCard
              key={charge.id}
              title={charge.houseLabel}
              name={charge.month ? monthLabel(charge.month) : formatDate(charge.dueDate)}
              description={`Vencimento ${formatDate(charge.dueDate)}`}
              value={charge.value}
              status={charge.status}
              pixChargeId={charge.id}
              onOpenPix={() => navigation.navigate('PixPayment', { id: charge.id })}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryLabelRow}>
        <Icon color={colors.blue} size={15} />
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ContributionCard({
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
    <View style={styles.chargeCard}>
      <View style={styles.chargeTop}>
        <View style={styles.houseIcon}>
          <Home color={colors.blue} size={25} />
        </View>
        <View style={styles.chargeCopy}>
          <Text style={styles.chargeTitle}>{title}</Text>
          {name ? <Text style={styles.chargeName}>{name}</Text> : null}
          {description ? <Text style={styles.chargeDescription}>{description}</Text> : null}
        </View>
        <View style={styles.chargeRight}>
          <Badge status={status} />
          <Text style={styles.chargeValue}>{formatCurrency(value)}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={!pixChargeId}
        style={[styles.pixButton, !pixChargeId ? styles.disabledAction : null]}
        onPress={onOpenPix}
      >
        <View style={styles.pixMark}>
          <View style={styles.pixDiamond} />
          <View style={styles.pixDiamond} />
          <View style={styles.pixDiamond} />
          <View style={styles.pixDiamond} />
        </View>
        <Text style={styles.pixButtonText}>{pixChargeId ? 'Ver Pix' : 'Pix não gerado'}</Text>
      </Pressable>
    </View>
  );
}

function monthLabel(value: string) {
  const [year, month] = value.split('-');
  if (!year || !month) {
    return value;
  }
  return `${month}/${year}`;
}

function formatDate(value: string) {
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 106,
    gap: 12,
    position: 'relative'
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 1
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 2
  },
  refreshButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    zIndex: 1
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  walletIcon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.blue,
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  balanceCopy: {
    flex: 1,
    gap: spacing.xs
  },
  summaryLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  balanceValue: {
    color: colors.ink,
    fontSize: 32,
    lineHeight: 37,
    fontWeight: '900'
  },
  divider: {
    height: 1,
    backgroundColor: colors.border
  },
  summaryRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  summaryLabelRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  summaryValue: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900'
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    zIndex: 1
  },
  primaryAction: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.blue,
    shadowOpacity: 0.18,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3
  },
  secondaryAction: {
    flex: 1,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900'
  },
  secondaryActionText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '900'
  },
  chargeCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    zIndex: 1
  },
  chargeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  houseIcon: {
    width: 46,
    height: 46,
    borderRadius: 9,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  chargeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  chargeTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900'
  },
  chargeName: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600'
  },
  chargeDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  chargeRight: {
    alignItems: 'flex-end',
    gap: 8
  },
  chargeValue: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900'
  },
  pixButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  pixButtonText: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '900'
  },
  pixMark: {
    width: 18,
    height: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }]
  },
  pixDiamond: {
    width: 7,
    height: 7,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: colors.blue,
    margin: 1
  },
  disabledAction: {
    opacity: 0.5
  },
  lockedCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1
  },
  lockedCopy: {
    flex: 1,
    gap: spacing.xs
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
  }
});
