import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react-native';
import { EmptyFilter, FilterBar } from '../components/FilterBar';
import { Badge, Button, Card, EmptyState, Label, Row, Screen, Value } from '../components/ui';
import { api } from '../services/api';
import { WebhookEvent } from '../types';

export function WebhookEventsScreen() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<'TODOS' | 'OK' | 'ERRO'>('TODOS');

  async function load() {
    setEvents(await api.webhookEvents());
    setLoaded(true);
  }

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, []);

  const failed = events.filter((event) => !event.processed).length;
  const visible = filter === 'TODOS' ? events : events.filter((event) => (filter === 'OK' ? event.processed : !event.processed));

  return (
    <Screen title="Logs Webhook" subtitle="Eventos Asaas" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {events.length > 0 ? (
        <FilterBar
          label="Resultado do evento"
          options={[
            { key: 'TODOS', label: 'Todos', count: events.length },
            { key: 'OK', label: 'Processados', count: events.length - failed },
            { key: 'ERRO', label: 'Com erro', count: failed }
          ]}
          value={filter}
          onChange={setFilter}
        />
      ) : null}
      {loaded && events.length === 0 ? <EmptyState title="Nenhum evento recebido ainda." /> : null}
      {events.length > 0 && visible.length === 0 ? <EmptyFilter message="Nenhum evento neste resultado." onClear={() => setFilter('TODOS')} /> : null}
      {visible.map((event) => (
        <Card key={event.id}>
          <Row>
            <Value>{event.eventType}</Value>
            <Badge status={event.processed ? 'PROCESSADO' : 'ERRO'} />
          </Row>
          <Row>
            <Label>Pagamento</Label>
            <Value>{event.gatewayPaymentId ?? '-'}</Value>
          </Row>
          <Label>{event.createdAt}</Label>
          {event.errorMessage ? <Label>{event.errorMessage}</Label> : null}
        </Card>
      ))}
    </Screen>
  );
}
