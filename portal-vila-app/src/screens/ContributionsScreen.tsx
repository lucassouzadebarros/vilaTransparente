import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CheckCircle2, QrCode, RefreshCw } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Contribution } from '../types';
import { currentMonth } from '../utils/month';

export function ContributionsScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Contribution[]>([]);
  const [month] = useState(currentMonth());

  async function load() {
    setItems(await api.contributions(month));
  }

  async function manualPayment(id: number) {
    await api.manualPayment(id, 'Excecao registrada pelo app');
    Alert.alert('Pagamento manual', 'Contribuição marcada como paga.');
    load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Contribuições" subtitle="Casas e status Pix" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {items.map((item) => (
        <Card key={item.id}>
          <Row>
            <Value>{item.houseLabel}</Value>
            <Badge status={item.status} />
          </Row>
          <Label>{item.residentName}</Label>
          <Money value={item.amount} />
          <Button
              title={item.pixChargeId ? 'Ver Pix' : 'Pix não gerado'}
            icon={QrCode}
            onPress={() => item.pixChargeId ? navigation.navigate('PixPayment', { id: item.pixChargeId }) : undefined}
            disabled={!item.pixChargeId}
          />
          {isAdmin ? <Button title="Marcar pago" icon={CheckCircle2} variant="ghost" onPress={() => manualPayment(item.id)} /> : null}
        </Card>
      ))}
    </Screen>
  );
}
