import { useCallback, useState } from 'react';
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
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { colors, spacing } from '../theme';
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
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState('TODOS');
  const [items, setItems] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(nextStatus = status) {
    setLoading(true);
    try {
      setItems(await api.services(nextStatus === 'TODOS' ? undefined : nextStatus));
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [status])
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SoftBackdrop compact />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Serviços</Text>
          <Text style={styles.subtitle}>Manutenções e melhorias</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Atualizar serviços" onPress={() => load()} style={styles.refreshButton}>
          <RefreshCw color={loading ? colors.muted : colors.blue} size={24} />
        </Pressable>
      </View>

      {isAdmin ? (
        <Pressable
          accessibilityRole="button"
          style={styles.newButton}
          onPress={() => navigation.navigate('ServiceForm', { formMode: 'create', serviceId: null, budgetId: null, formKey: Date.now() })}
        >
          <Plus color={colors.surface} size={28} />
          <Text style={styles.newButtonText}>Novo serviço</Text>
        </Pressable>
      ) : null}

      <View style={styles.filterGrid}>
        {filters.map((filter) => (
          <FilterButton
            key={filter.key}
            label={filter.label}
            icon={filter.icon}
            selected={filter.key === status}
            onPress={() => setStatus(filter.key)}
          />
        ))}
      </View>

      <View style={styles.list}>
        {items.length > 0 ? (
          items.map((item) => (
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

function FilterButton({ label, icon: Icon, selected, onPress }: { label: string; icon?: LucideIcon; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.filterButton, selected ? styles.filterSelected : null]}>
      {Icon ? <Icon color={selected ? colors.surface : colors.blue} size={19} /> : null}
      <Text style={[styles.filterText, selected ? styles.filterTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function ServiceCard({ item, onPress }: { item: ServiceOrder; onPress: () => void }) {
  const Icon = serviceIcon(item.category);
  const priorityColor = item.priority === 'URGENTE' || item.priority === 'ALTA' ? colors.red : item.priority === 'MEDIA' ? '#D98A10' : colors.green;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.serviceCard}>
      <View style={styles.serviceTop}>
        <View style={styles.serviceIconBox}>
          <Icon color={serviceTone(item.category)} size={34} strokeWidth={1.9} />
        </View>
        <View style={styles.serviceCopy}>
          <View style={styles.serviceTitleRow}>
            <Text style={styles.serviceTitle}>{item.title}</Text>
            <ChevronRight color={colors.muted} size={24} />
          </View>
          <View style={styles.categoryRow}>
            <Tag color={colors.muted} size={17} />
            <Text style={styles.categoryText}>{item.category || 'Manutenção'}</Text>
          </View>
          <View style={styles.statusPill}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{statusLabels[item.status] ?? item.status}</Text>
          </View>
        </View>
      </View>
      <View style={styles.serviceDivider} />
      <View style={styles.metaGrid}>
        <MetaItem icon={Flag} label="Prioridade" value={priorityLabels[item.priority] ?? item.priority} color={priorityColor} />
        <MetaItem icon={CalendarDays} label="Data prevista" value={item.plannedDate ? formatDate(item.plannedDate) : 'Sem data'} />
        <MetaItem icon={BadgeDollarSign} label="Valor previsto" value={formatCurrency(item.finalValue ?? item.expectedValue ?? 0)} />
      </View>
    </Pressable>
  );
}

function MetaItem({ icon: Icon, label, value, color = colors.ink }: { icon: LucideIcon; label: string; value: string; color?: string }) {
  return (
    <View style={styles.metaItem}>
      <View style={styles.metaLabelRow}>
        <Icon color={colors.muted} size={17} />
        <Text style={styles.metaLabel}>{label}</Text>
      </View>
      <Text style={[styles.metaValue, { color }]}>{value}</Text>
    </View>
  );
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
    maxWidth: 430,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 106,
    gap: spacing.lg,
    position: 'relative'
  },
  header: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 1
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    marginTop: 2
  },
  refreshButton: {
    width: 58,
    height: 58,
    borderRadius: 12,
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
    minHeight: 74,
    borderRadius: 8,
    backgroundColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    shadowColor: colors.blue,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
    zIndex: 1
  },
  newButtonText: {
    color: colors.surface,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900'
  },
  filterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    zIndex: 1
  },
  filterButton: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm
  },
  filterSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blue
  },
  filterText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800'
  },
  filterTextSelected: {
    color: colors.surface,
    fontWeight: '900'
  },
  list: {
    gap: spacing.lg,
    zIndex: 1
  },
  serviceCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
    shadowColor: '#163052',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3
  },
  serviceTop: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start'
  },
  serviceIconBox: {
    width: 74,
    height: 74,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  serviceCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm
  },
  serviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  serviceTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900'
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  categoryText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700'
  },
  statusPill: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999
  },
  statusText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900'
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
    gap: spacing.xs,
    borderRightWidth: 1,
    borderRightColor: colors.border
  },
  metaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  metaValue: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center'
  },
  emptyCard: {
    minHeight: 86,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    shadowColor: '#163052',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF1F5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyText: {
    flex: 1,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900'
  }
});
