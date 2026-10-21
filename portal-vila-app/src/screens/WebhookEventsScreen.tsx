import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react-native';
import { EmptyFilter, FilterBar } from '../components/FilterBar';
import { Badge, Button, Card, EmptyState, Label, Row, Screen, Value } from '../components/ui';
import { api } from '../services/api';
import { WebhookEvent } from '../types';
import { formatDateTimeBR } from '../utils/format';

/** What Asaas calls each event, in plain words. */
const eventNames: Record<string, string> = {
  PAYMENT_CREATED: 'Cobrança criada',
  PAYMENT_UPDATED: 'Cobrança atualizada',
  PAYMENT_CONFIRMED: 'Pagamento confirmado',
  PAYMENT_RECEIVED: 'Pagamento recebido',
  PAYMENT_OVERDUE: 'Cobrança vencida',
  PAYMENT_DELETED: 'Cobrança removida',
  PAYMENT_REFUNDED: 'Pagamento estornado'
};

function eventName(code: string) {
  if (eventNames[code]) {
    return eventNames[code];
  }
  const text = code.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

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
            <Value>{eventName(event.eventType)}</Value>
            <Badge status={event.processed ? 'PROCESSADO' : 'ERRO'} />
          </Row>
          <Label>
            {formatDateTimeBR(event.createdAt)}
            {event.gatewayPaymentId ? ` · Pagamento ${event.gatewayPaymentId}` : ''}
          </Label>
          {event.errorMessage ? <Label>{event.errorMessage}</Label> : null}
        </Card>
      ))}
    </Screen>
  );
}
