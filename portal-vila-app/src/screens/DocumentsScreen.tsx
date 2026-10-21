import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react-native';
import { EmptyFilter, FilterBar, FilterOption } from '../components/FilterBar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Screen } from '../components/ui';
import { colors, spacing } from '../theme';
import { api } from '../services/api';
import { PortalDocument } from '../types';
import { Alert } from '../utils/alert';
import { documentTypeLabel, documentTypePlural } from '../utils/documentTypes';

export function DocumentsScreen() {
  const [items, setItems] = useState<PortalDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('TODOS');

  async function load() {
    setItems(await api.documents());
    setLoaded(true);
  }

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, []);

  // One option per kind of document that exists, so the bar never offers a filter with nothing behind it.
  const options = useMemo<Array<FilterOption>>(() => {
    const kinds = Array.from(new Set(items.map((item) => item.type || 'OUTRO')));
    return [
      { key: 'TODOS', label: 'Todos', count: items.length },
      ...kinds.map((kind) => ({ key: kind, label: documentTypePlural(kind), count: items.filter((item) => (item.type || 'OUTRO') === kind).length }))
    ];
  }, [items]);

  const visible = filter === 'TODOS' ? items : items.filter((item) => (item.type || 'OUTRO') === filter);

  return (
    <Screen title="Documentos" subtitle="Atas, recibos e comprovantes" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {items.length > 1 ? <FilterBar label="Tipo de documento" options={options} value={filter} onChange={setFilter} /> : null}
      {loaded && items.length === 0 ? <EmptyState title="Nenhum documento cadastrado." /> : null}
      {items.length > 0 && visible.length === 0 ? <EmptyFilter message="Nenhum documento deste tipo." onClear={() => setFilter('TODOS')} /> : null}
      {visible.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="link"
          accessibilityLabel={`Abrir ${item.name}, ${documentTypeLabel(item.type)}`}
          onPress={() => api.openDocument(item.url).catch(() => Alert.alert('Documento', 'Não foi possível abrir o documento.'))}
          style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
        >
          <View style={styles.copy}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.type}>{documentTypeLabel(item.type)}</Text>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          </View>
          <ExternalLink color={colors.muted} size={18} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  cardPressed: {
    backgroundColor: colors.blueSoft
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  name: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600'
  },
  type: {
    color: colors.blue,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  description: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  }
});
