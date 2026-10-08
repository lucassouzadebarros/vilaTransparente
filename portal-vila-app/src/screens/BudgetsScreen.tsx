import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Eye, Pencil, Plus, RefreshCw, Vote } from 'lucide-react-native';
import { Badge, Button, Card, EmptyState, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { Budget, BudgetVoting } from '../types';
import { awaitingMyVote, budgetBadgeStatus, votingScore } from '../utils/budgetVoting';

/** Budgets still being voted on come first, then the newest. */
function sortBudgets(budgets: Budget[]) {
  return [...budgets].sort((a, b) => {
    const aOpen = a.status === 'EM_ANALISE' ? 0 : 1;
    const bOpen = b.status === 'EM_ANALISE' ? 0 : 1;
    return aOpen - bOpen || (b.id ?? 0) - (a.id ?? 0);
  });
}

export function BudgetsScreen() {
  const navigation = useNavigation<any>();
  const { canManageBudgets } = useAuth();
  const [items, setItems] = useState<Budget[]>([]);
  const [votings, setVotings] = useState<Record<number, BudgetVoting>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [nextBudgets, nextVotings] = await Promise.all([
        api.budgets(),
        api.budgetVotings().catch(() => [] as BudgetVoting[])
      ]);
      setItems(sortBudgets(nextBudgets));
      setVotings(Object.fromEntries(nextVotings.map((voting) => [voting.budgetId, voting])));
    } catch (err) {
      setError(apiErrorMessage(err, 'Não consegui carregar os orçamentos.'));
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
    <Screen title="Orçamentos" subtitle="Cotações e votação das casas" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {canManageBudgets ? <Button title="Novo orçamento" icon={Plus} onPress={() => navigation.navigate('BudgetForm', { formMode: 'create', budgetId: null, serviceId: null, formKey: Date.now() })} /> : null}
      {error ? (
        <Card>
          <Value>Não consegui carregar orçamentos</Value>
          <Label>{error}</Label>
          <Button title="Tentar novamente" icon={RefreshCw} variant="ghost" onPress={load} />
        </Card>
      ) : null}
      {loading ? <Label>Carregando orçamentos...</Label> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="Nenhum orçamento cadastrado." /> : null}
      {items.map((item) => {
        const voting = item.id ? votings[item.id] : undefined;
        const openDetails = () => navigation.navigate('BudgetDetails', { id: item.id, refreshKey: Date.now() });
        return (
          <Card key={item.id}>
            <Row>
              <Value>{item.supplier}</Value>
              <Badge status={budgetBadgeStatus(item.status)} />
            </Row>
            {item.supplierDocument ? <Label>CNPJ {item.supplierDocument}</Label> : null}
            <Label>{item.title}</Label>
            <Row>
              <Label>{item.serviceId ? `Serviço #${item.serviceId}` : 'Sem serviço vinculado'}</Label>
              <Money value={item.amount} />
            </Row>
            {voting?.open ? (
              <Row>
                <Label>{votingScore(voting)}</Label>
                {awaitingMyVote(voting) ? <Badge status="AGUARDANDO SEU VOTO" /> : null}
              </Row>
            ) : null}
            <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
              {awaitingMyVote(voting) ? <Button title="Votar" icon={Vote} onPress={openDetails} /> : null}
              <Button title="Detalhes" icon={Eye} variant="ghost" onPress={openDetails} />
              {canManageBudgets ? <Button title="Editar" icon={Pencil} variant="ghost" onPress={() => navigation.navigate('BudgetForm', { formMode: 'edit', budgetId: item.id, formKey: Date.now() })} /> : null}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
