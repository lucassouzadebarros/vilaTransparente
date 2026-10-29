import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronRight, Plus, RefreshCw, Vote } from 'lucide-react-native';
import { DemandTabs } from '../components/DemandTabs';
import { EmptyFilter, FilterBar, FilterOption } from '../components/FilterBar';
import { Badge, Button, Card, EmptyState, Label, Screen, Value, formatMoney } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
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

/**
 * Where the budget came from: the problem it answers, or the service it quotes (older records). An approved budget
 * became its own service, which is what it leads to.
 */
function originLabel(item: Budget, problemTitles: Record<number, string>, serviceTitles: Record<number, string>) {
  if (item.problemReportId) {
    const title = problemTitles[item.problemReportId] ?? `#${item.problemReportId}`;
    return `Para o problema: ${title}${item.competes === false ? ' (outro trabalho)' : ''}`;
  }
  if (item.serviceId) {
    const title = serviceTitles[item.serviceId] ?? `#${item.serviceId}`;
    return item.status === 'APROVADO' ? `Virou o serviço: ${title}` : `Cotação do serviço: ${title}`;
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
        const waiting = awaitingMyVote(voting);
        const voted = voting ? voting.approveVotes + voting.rejectVotes : 0;
        const houses = voting?.participatingHouses ?? 0;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.supplier}, ${formatMoney(item.amount)}`}
            onPress={openDetails}
            style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
          >
            <View style={styles.top}>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.supplier}>{item.supplier}</Text>
              </View>
              <View style={styles.amountBlock}>
                <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
                <ChevronRight color={colors.muted} size={18} />
              </View>
            </View>
            <View style={styles.badges}>
              <Badge status={budgetBadgeStatus(item.status)} />
              {waiting ? <Badge status="AGUARDANDO SEU VOTO" /> : null}
            </View>
            <Text style={styles.origin}>{originLabel(item, problemTitles, serviceTitles)}</Text>
            {voting?.open ? (
              <View style={styles.progressBlock}>
                <View
                  accessibilityRole="progressbar"
                  accessibilityLabel={`${voted} de ${houses} casas votaram`}
                  style={styles.track}
                >
                  <View style={[styles.fill, { width: `${houses ? Math.round((voted / houses) * 100) : 0}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {voted} de {houses} casas votaram{voting.deadline ? ` · ${deadlineLabel(voting.deadline)}` : ''}
                </Text>
              </View>
            ) : null}
            {waiting ? <Button title="Votar" icon={Vote} onPress={openDetails} /> : null}
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm
  },
  cardPressed: {
    backgroundColor: colors.blueSoft
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  titleBlock: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700'
  },
  supplier: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  amountBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  amount: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums']
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  origin: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  progressBlock: {
    gap: 6
  },
  track: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.track,
    overflow: 'hidden'
  },
  fill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.blue
  },
  progressText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ['tabular-nums']
  }
});
