import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleX,
  Clock3,
  Flag,
  Lightbulb,
  Plus,
  RefreshCw,
  Smartphone,
  Tag,
  Wrench
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DemandTabs } from '../components/DemandTabs';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { EmptyFilter, FilterBar } from '../components/FilterBar';
import { colors } from '../theme';
import { ServiceOrder } from '../types';

const filters: Array<{ key: string; label: string; icon?: LucideIcon }> = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'PLANEJADO', label: 'Planejado', icon: CalendarDays },
  { key: 'APROVADO', label: 'Aprovado', icon: CheckCircle2 },
  { key: 'EM_ANDAMENTO', label: 'Em andamento', icon: Clock3 },
  { key: 'FINALIZADO', label: 'Finalizado', icon: CheckCircle2 },
  { key: 'CANCELADO', label: 'Cancelado', icon: CircleX }
];

const priorityLabels: Record<ServiceOrder['priority'], string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente'
};

const statusLabels: Record<ServiceOrder['status'], string> = {
  PLANEJADO: 'Planejado',
  APROVADO: 'Aprovado',
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado'
};

export function ServicesScreen() {
  const navigation = useNavigation<any>();
  const { canManageBudgets } = useAuth();
  const [status, setStatus] = useState('TODOS');
  const [items, setItems] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await api.services());
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const options = useMemo(
    () => filters.map((filter) => ({ key: filter.key, label: filter.label, count: filter.key === 'TODOS' ? items.length : items.filter((item) => item.status === filter.key).length })),
    [items]
  );
  const visible = status === 'TODOS' ? items : items.filter((item) => item.status === status);

  return (
    <ScrollView role="main" style={styles.screen} contentContainerStyle={styles.content}>
      <SoftBackdrop compact />
      <View style={styles.header}>
        <View>
          <Text role="heading" style={styles.title}>Serviços</Text>
          <Text style={styles.subtitle}>Manutenções e melhorias</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Atualizar serviços" onPress={() => load()} style={styles.refreshButton}>
          <RefreshCw color={loading ? colors.muted : colors.blue} size={18} />
        </Pressable>
      </View>

      <DemandTabs current="services" />

      {canManageBudgets ? (
        <Pressable
          accessibilityRole="button"
          style={styles.newButton}
          onPress={() => navigation.navigate('ServiceForm', { formMode: 'create', serviceId: null, budgetId: null, formKey: Date.now() })}
        >
          <Plus color={colors.surface} size={16} />
          <Text style={styles.newButtonText}>Novo serviço</Text>
        </Pressable>
      ) : null}

      <FilterBar label="Situação do serviço" options={options} value={status} onChange={setStatus} />

      <View style={styles.list}>
        {items.length > 0 && visible.length === 0 ? (
          <EmptyFilter message="Nenhum serviço nesta situação." onClear={() => setStatus('TODOS')} />
        ) : null}
        {items.length > 0 ? (
          visible.map((item) => (
            <ServiceCard
              key={item.id}
              item={item}
              onPress={() => navigation.navigate('ServiceDetails', { id: item.id, refreshKey: Date.now() })}
            />
          ))
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Wrench color={colors.muted} size={22} />
            </View>
            <Text style={styles.emptyText}>Nenhum serviço cadastrado.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ServiceCard({ item, onPress }: { item: ServiceOrder; onPress: () => void }) {
  const Icon = serviceIcon(item.category);
  const priorityColor = item.priority === 'URGENTE' || item.priority === 'ALTA' ? colors.red : item.priority === 'MEDIA' ? '#D98A10' : colors.green;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.serviceCard}>
      <View style={styles.serviceTop}>
        <View style={styles.serviceIconBox}>
          <Icon color={serviceTone(item.category)} size={28} strokeWidth={2} />
        </View>
        <View style={styles.serviceCopy}>
          <View style={styles.serviceTitleRow}>
            <Text style={styles.serviceTitle}>{item.title}</Text>
            <ChevronRight color={colors.muted} size={18} />
          </View>
          <View style={styles.categoryRow}>
            <Tag color={colors.muted} size={13} />
            <Text style={styles.categoryText}>{item.category || 'Manutenção'}</Text>
          </View>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{statusLabels[item.status] ?? item.status}</Text>
          </View>
          {(item.status === 'EM_ANDAMENTO' || item.status === 'FINALIZADO') && !item.approvedBudgetId ? (
            <View style={styles.noVotePill}>
              <Text style={styles.noVoteText}>Sem votação das casas</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.serviceDivider} />
      <View style={styles.metaGrid}>
        <MetaItem icon={Flag} label="Prioridade" value={priorityLabels[item.priority] ?? item.priority} color={priorityColor} />
        <MetaItem icon={CalendarDays} label="Data prevista" value={item.plannedDate ? formatDate(item.plannedDate) : 'Sem data'} />
        <MetaItem
          icon={BadgeDollarSign}
          label={item.finalValue != null ? 'Valor pago' : 'Valor previsto'}
          value={formatCurrency(item.finalValue != null ? item.finalValue : item.expectedValue ?? 0)}
        />
      </View>
    </Pressable>
  );
}

function MetaItem({ icon: Icon, label, value, color = colors.ink }: { icon: LucideIcon; label: string; value: string; color?: string }) {
  return (
    <View style={styles.metaItem}>
      <View style={styles.metaLabelRow}>
        <Icon color={colors.muted} size={13} />
        <Text style={styles.metaLabel}>{label}</Text>
      </View>
      <Text style={[styles.metaValue, { color }]}>{value}</Text>
    </View>
  );
}

function filterWidth(filterKey: string) {
  if (filterKey === 'TODOS') {
    return styles.filterTodos;
  }
  if (filterKey === 'EM_ANDAMENTO') {
    return styles.filterLong;
  }
  if (filterKey === 'FINALIZADO' || filterKey === 'CANCELADO') {
    return styles.filterCompact;
  }
  return styles.filterMedium;
}

function serviceIcon(category?: string) {
  const normalized = String(category ?? '').toLowerCase();
  if (normalized.includes('ilum')) {
    return Lightbulb;
  }
  if (normalized.includes('port') || normalized.includes('interfone')) {
    return Smartphone;
  }
  return Wrench;
}

function serviceTone(category?: string) {
  const normalized = String(category ?? '').toLowerCase();
  if (normalized.includes('port') || normalized.includes('interfone')) {
    return colors.teal;
  }
  return colors.blue;
}

function statusColor(status: string) {
  if (status === 'EM_ANDAMENTO') {
    return colors.green;
  }
  if (status === 'CANCELADO') {
    return colors.red;
  }
  if (status === 'FINALIZADO' || status === 'APROVADO') {
    return colors.blue;
  }
  return colors.blue;
}

function formatCurrency(value?: number | null) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
}

function formatDate(value: string) {
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) {
    return value;
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
    paddingTop: 18,
    paddingBottom: 106,
    gap: 12,
    position: 'relative'
  },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 1
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: 2
  },
  refreshButton: {
    width: 40,
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
  newButton: {
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowColor: colors.blue,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    zIndex: 1
  },
  newButtonText: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800'
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    zIndex: 1
  },
  filterButton: {
    width: 100,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  filterTodos: {
    width: 66
  },
  filterMedium: {
    width: 98
  },
  filterLong: {
    width: 122
  },
  filterCompact: {
    width: 98
  },
  filterSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blue
  },
  filterText: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  filterTextSelected: {
    color: colors.surface,
    fontWeight: '900'
  },
  list: {
    gap: 14,
    zIndex: 1
  },
  serviceCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 13,
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  serviceTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start'
  },
  serviceIconBox: {
    width: 54,
    height: 54,
    borderRadius: 9,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  serviceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5
  },
  serviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6
  },
  serviceTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900'
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  categoryText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  statusPill: {
    alignSelf: 'flex-start',
    minHeight: 22,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 999
  },
  statusText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  noVotePill: {
    alignSelf: 'flex-start',
    minHeight: 22,
    borderRadius: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: colors.amberSoft
  },
  noVoteText: {
    color: colors.amber,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  serviceDivider: {
    height: 1,
    backgroundColor: colors.border
  },
  metaGrid: {
    flexDirection: 'row'
  },
  metaItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    borderRightWidth: 1,
    borderRightColor: colors.border
  },
  metaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  metaValue: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'center'
  },
  emptyCard: {
    minHeight: 66,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900'
  }
});
