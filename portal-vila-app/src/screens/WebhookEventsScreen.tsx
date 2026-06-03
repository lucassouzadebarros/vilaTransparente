import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react-native';
import { Badge, Button, Card, Label, Row, Screen, Value } from '../components/ui';
import { api } from '../services/api';
import { WebhookEvent } from '../types';

export function WebhookEventsScreen() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);

  async function load() {
    setEvents(await api.webhookEvents());
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Logs Webhook" subtitle="Eventos Asaas" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {events.map((event) => (
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
