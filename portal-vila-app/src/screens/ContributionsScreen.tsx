import { useEffect, useMemo, useState } from 'react';
import { Alert } from '../utils/alert';
import { useNavigation } from '@react-navigation/native';
import { CheckCircle2, QrCode, RefreshCw } from 'lucide-react-native';
import { EmptyFilter, FilterBar, FilterOption } from '../components/FilterBar';
import { Badge, Button, Card, EmptyState, Label, Money, Row, Screen, Value } from '../components/ui';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { Contribution } from '../types';
import { currentMonth } from '../utils/month';

type ContributionFilter = 'TODAS' | 'PAGAS' | 'PENDENTES' | 'CANCELADAS';

/** Which filter an API status belongs to: an overdue charge is still a pending one. */
function filterOf(status: string): ContributionFilter {
  if (status === 'PAID') {
    return 'PAGAS';
  }
  if (status === 'CANCELLED') {
    return 'CANCELADAS';
  }
  return 'PENDENTES';
}

export function ContributionsScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Contribution[]>([]);
  const [month] = useState(currentMonth());
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<ContributionFilter>('TODAS');

  async function load() {
    setItems(await api.contributions(month));
    setLoaded(true);
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
    load().catch(() => setLoaded(true));
  }, []);

  const options = useMemo<Array<FilterOption<ContributionFilter>>>(() => {
    const count = (key: ContributionFilter) => items.filter((item) => filterOf(item.status) === key).length;
    const list: Array<FilterOption<ContributionFilter>> = [
      { key: 'TODAS', label: 'Todas', count: items.length },
      { key: 'PAGAS', label: 'Pagas', count: count('PAGAS') },
      { key: 'PENDENTES', label: 'Pendentes', count: count('PENDENTES') }
    ];
    if (count('CANCELADAS') > 0) {
      list.push({ key: 'CANCELADAS', label: 'Canceladas', count: count('CANCELADAS') });
    }
    return list;
  }, [items]);

  const visible = filter === 'TODAS' ? items : items.filter((item) => filterOf(item.status) === filter);

  return (
    <Screen title="Contribuições" subtitle="Casas e status Pix" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {items.length > 1 ? <FilterBar label="Situação da contribuição" options={options} value={filter} onChange={setFilter} /> : null}
      {loaded && items.length === 0 ? <EmptyState title="Nenhuma contribuição neste mês." /> : null}
      {items.length > 0 && visible.length === 0 ? <EmptyFilter message="Nenhuma contribuição nesta situação." onClear={() => setFilter('TODAS')} /> : null}
      {visible.map((item) => (
        <Card key={item.id}>
          <Row>
            <View style={styles.who}>
              <Value>{item.houseLabel}</Value>
              <Label>{item.residentName}</Label>
            </View>
            <View style={styles.amount}>
              <Money value={item.amount} />
              <Badge status={item.status} />
            </View>
          </Row>
          <Row style={styles.actions}>
            <Button
              title={item.pixChargeId ? 'Ver Pix' : 'Pix não gerado'}
              icon={QrCode}
              variant={item.status === 'PAID' ? 'ghost' : 'primary'}
              onPress={() => item.pixChargeId ? navigation.navigate('PixPayment', { id: item.pixChargeId }) : undefined}
              disabled={!item.pixChargeId}
            />
            {isAdmin && item.status !== 'PAID' && item.status !== 'CANCELLED' ? (
              <Button title="Marcar pago" icon={CheckCircle2} variant="ghost" onPress={() => manualPayment(item)} />
            ) : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: {
    flex: 1,
    minWidth: 0
  },
  amount: {
    alignItems: 'flex-end',
    gap: 4
  },
  actions: {
    flexWrap: 'wrap',
    justifyContent: 'flex-start'
  }
});
