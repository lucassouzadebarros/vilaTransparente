import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleX,
  Clock3,
  Flag,
  MapPin,
  Plus,
  RefreshCw,
  Tag,
  TriangleAlert
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors } from '../theme';
import { ProblemReport } from '../types';

const filters: Array<{ key: string; label: string; icon?: LucideIcon }> = [
  { key: 'TODOS', label: 'Todos' },
  { key: 'ABERTO', label: 'Aberto', icon: CircleAlert },
  { key: 'EM_ANALISE', label: 'Em análise', icon: Clock3 },
  { key: 'RESOLVIDO', label: 'Resolvido', icon: CheckCircle2 },
  { key: 'CANCELADO', label: 'Cancelado', icon: CircleX }
];

const priorityLabels: Record<ProblemReport['priority'], string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente'
};

const statusLabels: Record<ProblemReport['status'], string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  RESOLVIDO: 'Resolvido',
  CANCELADO: 'Cancelado'
};

export function ProblemReportsScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState('TODOS');
  const [items, setItems] = useState<ProblemReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(nextStatus = status) {
    setLoading(true);
    setError('');
    try {
      setItems(await api.problemReports(nextStatus === 'TODOS' ? undefined : nextStatus));
    } catch (err) {
      setError(apiErrorMessage(err, 'Não consegui carregar os problemas.'));
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
          <Text style={styles.title}>Problemas</Text>
          <Text style={styles.subtitle}>Relatos e acompanhamento</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Atualizar problemas" onPress={() => load()} style={styles.refreshButton}>
          <RefreshCw color={loading ? colors.muted : colors.blue} size={18} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.newButton}
        onPress={() => navigation.navigate('ReportProblem', { formKey: Date.now() })}
      >
        <Plus color={colors.surface} size={16} />
        <Text style={styles.newButtonText}>Novo relato</Text>
      </Pressable>

      <View style={styles.filterGrid}>
        {filters.map((filter) => (
          <FilterButton
            key={filter.key}
            filterKey={filter.key}
            label={filter.label}
            icon={filter.icon}
            selected={filter.key === status}
            onPress={() => setStatus(filter.key)}
          />
        ))}
      </View>

      <View style={styles.list}>
        {error ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <TriangleAlert color={colors.red} size={22} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Não consegui carregar os problemas</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          </View>
        ) : null}
        {loading ? <Text style={styles.loadingText}>Carregando problemas...</Text> : null}
        {!loading && !error && items.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <TriangleAlert color={colors.muted} size={22} />
            </View>
            <Text style={styles.emptyText}>Nenhum problema cadastrado.</Text>
          </View>
        ) : null}
        {!error
          ? items.map((item) => (
              <ProblemCard
                key={item.id}
                item={item}
                onPress={() => {
                  if (isAdmin && item.id) {
                    navigation.navigate('ReportProblem', { report: item, formKey: Date.now() });
                    return;
                  }
                  Alert.alert(item.title, item.description || 'Sem descrição informada.');
                }}
              />
            ))
          : null}
      </View>
    </ScrollView>
  );
}

function FilterButton({
  filterKey,
  label,
  icon: Icon,
  selected,
  onPress
}: {
  filterKey: string;
  label: string;
  icon?: LucideIcon;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.filterButton, filterWidth(filterKey), selected ? styles.filterSelected : null]}>
      {Icon ? <Icon color={selected ? colors.surface : colors.blue} size={14} /> : null}
      <Text style={[styles.filterText, selected ? styles.filterTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function ProblemCard({ item, onPress }: { item: ProblemReport; onPress: () => void }) {
  const priorityColor = item.priority === 'URGENTE' || item.priority === 'ALTA' ? colors.red : item.priority === 'MEDIA' ? '#D98A10' : colors.green;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.problemCard}>
      <View style={styles.problemTop}>
        <View style={styles.problemIconBox}>
          <TriangleAlert color={statusColor(item.status)} size={28} strokeWidth={2} />
        </View>
        <View style={styles.problemCopy}>
          <View style={styles.problemTitleRow}>
            <Text style={styles.problemTitle}>{item.title}</Text>
            <ChevronRight color={colors.muted} size={18} />
          </View>
          <View style={styles.categoryRow}>
            <Tag color={colors.muted} size={13} />
            <Text style={styles.categoryText}>{item.category || 'Outro'}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: statusSoftColor(item.status) }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{statusLabels[item.status] ?? item.status}</Text>
          </View>
        </View>
      </View>
      <Text numberOfLines={2} style={styles.description}>
        {item.description}
      </Text>
      <View style={styles.problemDivider} />
      <View style={styles.metaGrid}>
        <MetaItem icon={Flag} label="Prioridade" value={priorityLabels[item.priority] ?? item.priority} color={priorityColor} />
        <MetaItem icon={MapPin} label="Local" value={item.location || 'Sem local'} />
        <MetaItem icon={CalendarDays} label="Data" value={item.createdAt ? formatDate(item.createdAt) : 'Sem data'} />
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
      <Text numberOfLines={1} style={[styles.metaValue, { color }]}>{value}</Text>
    </View>
  );
}

function filterWidth(filterKey: string) {
  if (filterKey === 'TODOS') {
    return styles.filterTodos;
  }
  if (filterKey === 'EM_ANALISE') {
    return styles.filterLong;
  }
  return styles.filterMedium;
}

function statusColor(status: string) {
  if (status === 'RESOLVIDO') {
    return colors.green;
  }
  if (status === 'CANCELADO') {
    return colors.red;
  }
  if (status === 'EM_ANALISE') {
    return '#D98A10';
  }
  return colors.blue;
}

function statusSoftColor(status: string) {
  if (status === 'RESOLVIDO') {
    return colors.greenSoft;
  }
  if (status === 'CANCELADO') {
    return colors.redSoft;
  }
  if (status === 'EM_ANALISE') {
    return '#FFF4D8';
  }
  return colors.blueSoft;
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
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: 2
  },
  refreshButton: {
    width: 40,
    height: 40,
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
  filterSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blue
  },
  filterText: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 14,
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
  problemCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  problemTop: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start'
  },
  problemIconBox: {
    width: 54,
    height: 54,
    borderRadius: 9,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  problemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5
  },
  problemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6
  },
  problemTitle: {
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
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600'
  },
  statusPill: {
    alignSelf: 'flex-start',
    minHeight: 22,
    borderRadius: 8,
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
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800'
  },
  description: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600'
  },
  problemDivider: {
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
    borderRightColor: colors.border,
    paddingHorizontal: 2
  },
  metaLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600'
  },
  metaValue: {
    color: colors.ink,
    fontSize: 11,
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
  emptyCopy: {
    flex: 1,
    gap: 3
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900'
  },
  emptyText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  loadingText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  }
});
