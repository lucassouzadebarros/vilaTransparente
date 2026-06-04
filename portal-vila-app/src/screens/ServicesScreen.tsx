import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Eye, Plus, RefreshCw } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ServiceOrder } from '../types';

const filters = ['TODOS', 'PLANEJADO', 'APROVADO', 'EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO'];

export function ServicesScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState('TODOS');
  const [items, setItems] = useState<ServiceOrder[]>([]);

  async function load(nextStatus = status) {
    setItems(await api.services(nextStatus === 'TODOS' ? undefined : nextStatus));
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [status])
  );

  return (
    <Screen
      title="Serviços"
      subtitle="Manutenções e melhorias"
      right={<Button title="" icon={RefreshCw} variant="ghost" onPress={() => load()} />}
    >
      {isAdmin ? <Button title="Novo serviço" icon={Plus} onPress={() => navigation.navigate('ServiceForm', { formMode: 'create', serviceId: null, budgetId: null, formKey: Date.now() })} /> : null}
      <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
        {filters.map((filter) => (
          <Button key={filter} title={filter.replace('_', ' ')} variant={filter === status ? 'primary' : 'ghost'} onPress={() => setStatus(filter)} />
        ))}
      </Row>
      {items.map((item) => (
        <Card key={item.id}>
          <Row>
            <Value>{item.title}</Value>
            <Badge status={item.status} />
          </Row>
          <Label>{item.description}</Label>
          <Row>
            <Label>Prioridade {item.priority}</Label>
            <Money value={item.finalValue ?? item.expectedValue ?? 0} />
          </Row>
          <Button title="Detalhes" icon={Eye} variant="ghost" onPress={() => navigation.navigate('ServiceDetails', { id: item.id, refreshKey: Date.now() })} />
        </Card>
      ))}
    </Screen>
  );
}
