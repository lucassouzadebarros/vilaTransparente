import { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
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

  async function load() {
    const [dash, list, pixList] = await Promise.all([
      api.dashboard(month),
      api.contributions(month),
      isAdmin ? api.pixCharges(month) : api.syncMyPixCharges()
    ]);
    setDashboard(dash);
    setContributions(list);
    setCharges(pixList);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Caixa" subtitle="Resumo financeiro" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {!isAdmin && dashboard?.transparencyEnabled === false ? (
        <Card>
          <Row>
            <Value>Transparencia financeira</Value>
            <Lock color="#667085" size={20} />
          </Row>
          <Label>O saldo acumulado sera liberado depois que sua primeira contribuicao for confirmada.</Label>
        </Card>
      ) : (
        <>
      <Card>
        <Label>Saldo disponivel</Label>
        <Money value={dashboard?.balance ?? 0} strong />
        <Row>
          <Label>Arrecadado confirmado</Label>
          <Money value={dashboard?.collected ?? 0} />
        </Row>
        <Row>
          <Label>Despesas</Label>
          <Money value={dashboard?.expenses ?? 0} />
        </Row>
      </Card>
      <Row>
        <Button title="Contribuicoes" icon={ListChecks} onPress={() => navigation.navigate('Contributions')} />
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
            title={item.pixChargeId ? 'Ver Pix' : 'Pix nao gerado'}
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
