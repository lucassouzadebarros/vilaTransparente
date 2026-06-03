import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Eye, Pencil, Plus, RefreshCw } from 'lucide-react-native';
import { Badge, Button, Card, EmptyState, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { Budget } from '../types';

export function BudgetsScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setItems(await api.budgets());
    } catch (err) {
      setError(apiErrorMessage(err, 'Nao consegui carregar os orcamentos.'));
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  return (
    <Screen title="Orcamentos" subtitle="Cotacoes vinculadas a servicos" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {isAdmin ? <Button title="Novo orcamento" icon={Plus} onPress={() => navigation.navigate('BudgetForm', { formMode: 'create', budgetId: null, serviceId: null, formKey: Date.now() })} /> : null}
      {error ? (
        <Card>
          <Value>Nao consegui carregar orcamentos</Value>
          <Label>{error}</Label>
          <Button title="Tentar novamente" icon={RefreshCw} variant="ghost" onPress={load} />
        </Card>
      ) : null}
      {loading ? <Label>Carregando orcamentos...</Label> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="Nenhum orcamento cadastrado." /> : null}
      {items.map((item) => (
        <Card key={item.id}>
          <Row>
            <Value>{item.supplier}</Value>
            <Badge status={item.status} />
          </Row>
          {item.supplierDocument ? <Label>CNPJ {item.supplierDocument}</Label> : null}
          <Label>{item.title}</Label>
          <Row>
            <Label>{item.serviceId ? `Servico #${item.serviceId}` : 'Sem servico vinculado'}</Label>
            <Money value={item.amount} />
          </Row>
          <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            <Button title="Detalhes" icon={Eye} variant="ghost" onPress={() => navigation.navigate('BudgetDetails', { id: item.id, refreshKey: Date.now() })} />
            {isAdmin ? <Button title="Editar" icon={Pencil} variant="ghost" onPress={() => navigation.navigate('BudgetForm', { formMode: 'edit', budgetId: item.id, formKey: Date.now() })} /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
