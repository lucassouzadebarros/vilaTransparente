import { useEffect, useState } from 'react';
import { Alert } from '../utils/alert';
import { useNavigation } from '@react-navigation/native';
import { CheckCircle2, QrCode, RefreshCw } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
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

  function manualPayment(item: Contribution) {
    Alert.alert(
      'Marcar como pago',
      `Registrar que ${item.houseLabel} pagou R$ ${item.amount.toFixed(2).replace('.', ',')} fora do Pix? O valor entra no saldo.`,
      [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Marcar pago', onPress: () => confirmManualPayment(item.id) }
      ]
    );
  }

  async function confirmManualPayment(id: number) {
    try {
      await api.manualPayment(id, 'Excecao registrada pelo app');
      Alert.alert('Pagamento manual', 'Contribuição marcada como paga.');
      load();
    } catch (error) {
      Alert.alert('Pagamento manual', apiErrorMessage(error, 'Não consegui marcar como paga.'));
    }
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
          {isAdmin && item.status !== 'PAID' && item.status !== 'CANCELLED' ? (
            <Button title="Marcar pago" icon={CheckCircle2} variant="ghost" onPress={() => manualPayment(item)} />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
