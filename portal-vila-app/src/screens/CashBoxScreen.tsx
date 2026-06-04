import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ListChecks, Lock, QrCode, ReceiptText, RefreshCw } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { api } from '../services/api';
import { Contribution, Dashboard, PixCharge } from '../types';
import { useAuth } from '../context/AuthContext';
import { currentMonth } from '../utils/month';

export function CashBoxScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [charges, setCharges] = useState<PixCharge[]>([]);
  const [month] = useState(currentMonth());
  const loadInFlight = useRef(false);

  async function load() {
    if (loadInFlight.current) {
      return;
    }
    loadInFlight.current = true;
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

  return (
    <Screen title="Caixa" subtitle="Resumo financeiro" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {!isAdmin && dashboard?.transparencyEnabled === false ? (
        <Card>
          <Row>
            <Value>Desbloqueie todas as funcionalidades</Value>
            <Lock color="#667085" size={20} />
          </Row>
          <Label>Faça seu primeiro pagamento para desbloquear.</Label>
        </Card>
      ) : (
        <>
      <Card>
        <Label>Saldo acumulado da vila</Label>
        <Money value={dashboard?.balance ?? 0} strong />
        <Row>
          <Label>Arrecadado total</Label>
          <Money value={dashboard?.totalCollected ?? dashboard?.collected ?? 0} />
        </Row>
        <Row>
          <Label>Arrecadado no mês ({monthLabel(month)})</Label>
          <Money value={dashboard?.collected ?? 0} />
        </Row>
        <Row>
          <Label>Despesas acumuladas</Label>
          <Money value={dashboard?.expenses ?? 0} />
        </Row>
      </Card>
      <Row>
        <Button title="Contribuições" icon={ListChecks} onPress={() => navigation.navigate('Contributions')} />
        <Button title="Despesas" icon={ReceiptText} variant="ghost" onPress={() => navigation.navigate('Expenses')} />
      </Row>
        </>
      )}
      {(isAdmin ? contributions.slice(0, 5) : []).map((item) => (
        <Card key={item.id}>
          <Row>
            <Value>{item.houseLabel}</Value>
            <Badge status={item.status} />
          </Row>
          <Row>
            <Label>{item.residentName}</Label>
            <Money value={item.amount} />
          </Row>
          <Button
            title={item.pixChargeId ? 'Ver Pix' : 'Pix não gerado'}
            icon={QrCode}
            variant="ghost"
            onPress={() => item.pixChargeId ? navigation.navigate('PixPayment', { id: item.pixChargeId }) : undefined}
            disabled={!item.pixChargeId}
          />
        </Card>
      ))}
      {!isAdmin ? (
        <>
          {charges.map((charge) => (
            <Card key={charge.id}>
              <Row>
                <Value>{charge.houseLabel}</Value>
                <Badge status={charge.status} />
              </Row>
              <Row>
                <Label>{charge.month ? monthLabel(charge.month) : formatDate(charge.dueDate)}</Label>
                <Money value={charge.value} />
              </Row>
              <Label>Vencimento {formatDate(charge.dueDate)}</Label>
              <Button
                title="Ver Pix"
                icon={QrCode}
                variant="ghost"
                onPress={() => navigation.navigate('PixPayment', { id: charge.id })}
              />
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
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
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
}
