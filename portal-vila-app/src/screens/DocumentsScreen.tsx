import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react-native';
import { EmptyFilter, FilterBar, FilterOption } from '../components/FilterBar';
import { Button, Card, EmptyState, Label, Row, Screen, Value } from '../components/ui';
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
        <Card key={item.id}>
          <Row>
            <Value>{item.name}</Value>
            <Label>{documentTypeLabel(item.type)}</Label>
          </Row>
          {item.description ? <Label>{item.description}</Label> : null}
          <Button
            title="Abrir"
            icon={ExternalLink}
            variant="ghost"
            onPress={() => api.openDocument(item.url).catch(() => Alert.alert('Documento', 'Não foi possível abrir o documento.'))}
          />
        </Card>
      ))}
    </Screen>
  );
}
