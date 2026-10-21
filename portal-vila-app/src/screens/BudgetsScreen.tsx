import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Eye, Pencil, Plus, RefreshCw, Vote } from 'lucide-react-native';
import { DemandTabs } from '../components/DemandTabs';
import { EmptyFilter, FilterBar, FilterOption } from '../components/FilterBar';
import { Badge, Button, Card, EmptyState, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { Budget, BudgetVoting, ProblemReport, ServiceOrder } from '../types';
import { awaitingMyVote, budgetBadgeStatus, deadlineLabel, votingScore } from '../utils/budgetVoting';

/** Budgets still being voted on come first, then the newest. */
function sortBudgets(budgets: Budget[]) {
  return [...budgets].sort((a, b) => {
    const aOpen = a.status === 'EM_ANALISE' ? 0 : 1;
    const bOpen = b.status === 'EM_ANALISE' ? 0 : 1;
    return aOpen - bOpen || (b.id ?? 0) - (a.id ?? 0);
  });
}

type BudgetFilter = 'TODOS' | 'MEU_VOTO' | 'EM_ANALISE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';

const emptyMessages: Record<BudgetFilter, string> = {
  TODOS: 'Nenhum orçamento cadastrado.',
  MEU_VOTO: 'Nenhum orçamento aguardando o voto da sua casa.',
  EM_ANALISE: 'Nenhum orçamento em votação agora.',
  APROVADO: 'Nenhum orçamento aprovado.',
  REJEITADO: 'Nenhum orçamento recusado.',
  CANCELADO: 'Nenhum orçamento cancelado.'
};

/** Where the budget came from: the problem it answers, or the service it quotes (older records). */
function originLabel(item: Budget, problemTitles: Record<number, string>, serviceTitles: Record<number, string>) {
  if (item.problemReportId) {
    const title = problemTitles[item.problemReportId] ?? `#${item.problemReportId}`;
    return `Para o problema: ${title}${item.competes === false ? ' (outro trabalho)' : ''}`;
  }
  if (item.serviceId) {
    return `Cotação do serviço: ${serviceTitles[item.serviceId] ?? `#${item.serviceId}`}`;
  }
  return 'Orçamento sem problema ligado';
}

export function BudgetsScreen() {
  const navigation = useNavigation<any>();
  const { canManageBudgets } = useAuth();
  const [items, setItems] = useState<Budget[]>([]);
  const [votings, setVotings] = useState<Record<number, BudgetVoting>>({});
  const [serviceTitles, setServiceTitles] = useState<Record<number, string>>({});
  const [problemTitles, setProblemTitles] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<BudgetFilter>('TODOS');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [nextBudgets, nextVotings, nextServices, nextProblems] = await Promise.all([
        api.budgets(),
        api.budgetVotings().catch(() => [] as BudgetVoting[]),
        api.services().catch(() => [] as ServiceOrder[]),
        api.problemReports().catch(() => [] as ProblemReport[])
      ]);
      setProblemTitles(Object.fromEntries(nextProblems.filter((problem) => problem.id).map((problem) => [problem.id as number, problem.title])));
      setServiceTitles(Object.fromEntries(nextServices.filter((service) => service.id).map((service) => [service.id as number, service.title])));
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

  const matches = useCallback(
    (item: Budget, key: BudgetFilter) => {
      if (key === 'TODOS') {
        return true;
      }
      if (key === 'MEU_VOTO') {
        return item.status === 'EM_ANALISE' && awaitingMyVote(item.id ? votings[item.id] : undefined);
      }
      return item.status === key;
    },
    [votings]
  );

  // "Aguardando meu voto" is only offered to someone whose house can vote at all.
  const canVoteAnywhere = useMemo(() => Object.values(votings).some((voting) => voting.canVote), [votings]);

  const options = useMemo<Array<FilterOption<BudgetFilter>>>(() => {
    const count = (key: BudgetFilter) => items.filter((item) => matches(item, key)).length;
    const list: Array<FilterOption<BudgetFilter>> = [{ key: 'TODOS', label: 'Todos', count: items.length }];
    if (canVoteAnywhere) {
      list.push({ key: 'MEU_VOTO', label: 'Aguardando meu voto', count: count('MEU_VOTO') });
    }
    list.push(
      { key: 'EM_ANALISE', label: 'Em votação', count: count('EM_ANALISE') },
      { key: 'APROVADO', label: 'Aprovados', count: count('APROVADO') },
      { key: 'REJEITADO', label: 'Recusados', count: count('REJEITADO') },
      { key: 'CANCELADO', label: 'Cancelados', count: count('CANCELADO') }
    );
    return list;
  }, [items, matches, canVoteAnywhere]);

  const visible = useMemo(() => items.filter((item) => matches(item, filter)), [items, matches, filter]);

  return (
    <Screen title="Orçamentos" subtitle="Cotações e votação das casas" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      <DemandTabs current="budgets" />
      {canManageBudgets ? <Button title="Novo orçamento" icon={Plus} onPress={() => navigation.navigate('BudgetForm', { formMode: 'create', budgetId: null, serviceId: null, formKey: Date.now() })} /> : null}
      {error ? (
        <Card>
          <Value>Não consegui carregar orçamentos</Value>
          <Label>{error}</Label>
          <Button title="Tentar novamente" icon={RefreshCw} variant="ghost" onPress={load} />
        </Card>
      ) : null}
      {loading ? <Label>Carregando orçamentos...</Label> : null}
      {items.length > 0 ? <FilterBar label="Situação do orçamento" options={options} value={filter} onChange={setFilter} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="Nenhum orçamento cadastrado." /> : null}
      {!loading && !error && items.length > 0 && visible.length === 0 ? (
        <EmptyFilter message={emptyMessages[filter]} onClear={filter === 'TODOS' ? undefined : () => setFilter('TODOS')} />
      ) : null}
      {visible.map((item) => {
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
              <Label>{originLabel(item, problemTitles, serviceTitles)}</Label>
              <Money value={item.amount} />
            </Row>
            {voting?.open ? (
              <Row>
                <Label>{votingScore(voting)}</Label>
                {awaitingMyVote(voting) ? <Badge status="AGUARDANDO SEU VOTO" /> : null}
              </Row>
            ) : null}
            {voting?.open && voting.deadline ? <Label>{deadlineLabel(voting.deadline)}</Label> : null}
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
