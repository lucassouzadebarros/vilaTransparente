import { useEffect, useState } from 'react';
import { Lock, RefreshCw } from 'lucide-react-native';
import { Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Dashboard } from '../types';
import { currentMonth } from '../utils/month';

export function ReportsScreen() {
  const { isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [month] = useState(currentMonth());

  async function load() {
    setDashboard(await api.dashboard(month));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Relatorios" subtitle="Totais consolidados" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {!isAdmin && dashboard?.transparencyEnabled === false ? (
        <Card>
          <Row>
            <Value>Relatorios bloqueados</Value>
            <Lock color="#667085" size={20} />
          </Row>
          <Label>Os totais consolidados aparecem depois que sua primeira contribuicao for confirmada.</Label>
        </Card>
      ) : (
        <>
      <Card>
        <Row><Label>Arrecadado via gateway/manual</Label><Money value={dashboard?.collected ?? 0} /></Row>
        <Row><Label>Pendente</Label><Money value={dashboard?.pending ?? 0} /></Row>
        <Row><Label>Vencido</Label><Money value={dashboard?.overdue ?? 0} /></Row>
        <Row><Label>Despesas</Label><Money value={dashboard?.expenses ?? 0} /></Row>
        <Row><Value>Saldo</Value><Money value={dashboard?.balance ?? 0} /></Row>
      </Card>
      {dashboard?.movements.map((movement, index) => (
        <Card key={`${movement.date}-${index}`}>
          <Row>
            <Value>{movement.description}</Value>
            <Money value={movement.amount} />
          </Row>
          <Label>{movement.type} - {movement.date}</Label>
        </Card>
      ))}
        </>
      )}
    </Screen>
  );
}
