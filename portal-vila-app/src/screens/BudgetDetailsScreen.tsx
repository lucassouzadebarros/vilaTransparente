import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ExternalLink, Lock, Pencil, RefreshCw, ThumbsDown, ThumbsUp, Vote, Wrench } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, BudgetVoteChoice, BudgetVoting, PortalDocument } from '../types';
import { Alert } from '../utils/alert';
import { formatDateBR } from '../utils/format';
import { budgetBadgeStatus, closingResult, deadlineLabel, formatVotingDate, lowestQuoteId, voteLabel, votingScore } from '../utils/budgetVoting';

export function BudgetDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { canManageBudgets } = useAuth();
  const id = Number(route.params?.id ?? 1);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [voting, setVoting] = useState<BudgetVoting | null>(null);
  const [quotes, setQuotes] = useState<Budget[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [sendingVote, setSendingVote] = useState<BudgetVoteChoice | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [closing, setClosing] = useState(false);

  async function load() {
    setError('');
    try {
      const [nextBudget, nextDocuments, nextVoting] = await Promise.all([
        api.budget(id),
        api.documents('BUDGET', id),
        api.budgetVoting(id).catch(() => null)
      ]);
      setBudget(nextBudget);
      setDocuments(nextDocuments);
      setVoting(nextVoting);
      setQuotes(nextBudget.serviceId ? await api.serviceBudgets(nextBudget.serviceId).catch(() => [] as Budget[]) : []);
    } catch {
      setError('Não consegui carregar este orçamento.');
    }
  }

  async function vote(choice: BudgetVoteChoice) {
    setSendingVote(choice);
    setMessage(null);
    try {
      const result = await api.voteBudget(id, choice);
      setVoting(result);
      setBudget(await api.budget(id));
      setMessage({
        text: result.open
          ? `Voto registrado: ${voteLabel(choice)}.`
          : `Voto registrado. A votação terminou: orçamento ${result.status === 'APROVADO' ? 'aprovado' : 'recusado'}.`,
        error: false
      });
    } catch (err) {
      setMessage({ text: apiErrorMessage(err, 'Não consegui registrar o voto.'), error: true });
    } finally {
      setSendingVote(null);
    }
  }

  async function closeVoting() {
    setClosing(true);
    setMessage(null);
    try {
      const result = await api.closeBudgetVoting(id);
      setVoting(result);
      setBudget(await api.budget(id));
      setConfirmingClose(false);
      setMessage({ text: `Votação encerrada: orçamento ${result.status === 'APROVADO' ? 'aprovado' : 'recusado'}.`, error: false });
    } catch (err) {
      setMessage({ text: apiErrorMessage(err, 'Não consegui encerrar a votação.'), error: true });
    } finally {
      setClosing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      setMessage(null);
      setConfirmingClose(false);
      load();
    }, [id, route.params?.refreshKey])
  );

  const showVoting = Boolean(voting && (voting.open || voting.closedAt || voting.approveVotes + voting.rejectVotes > 0));

  return (
    <Screen title="Orçamento" subtitle="Detalhe da proposta" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {error ? (
        <Card>
          <Value>Erro</Value>
          <Label>{error}</Label>
        </Card>
      ) : null}
      {message ? (
        <Card style={message.error ? styles.errorCard : styles.successCard}>
          <Text style={message.error ? styles.errorText : styles.successText}>{message.text}</Text>
        </Card>
      ) : null}
      {budget ? (
        <Card>
          <Row>
            <Value>{budget.supplier}</Value>
            <Badge status={budgetBadgeStatus(budget.status)} />
          </Row>
          {budget.supplierDocument ? <Label>CNPJ {budget.supplierDocument}</Label> : null}
          <Label>{budget.title}</Label>
          <Money value={budget.amount} strong />
          {budget.scope ? (
            <View style={styles.scopeBox}>
              <Text style={styles.scopeTitle}>O que será feito</Text>
              <Text style={styles.scopeText}>{budget.scope}</Text>
            </View>
          ) : null}
          <Row><Label>Serviço</Label><Value>{budget.serviceId ? `#${budget.serviceId}` : 'Avulso (sem serviço)'}</Value></Row>
          {budget.serviceId ? (
            <Button title="Ver serviço" icon={Wrench} variant="ghost" onPress={() => navigation.navigate('ServiceDetails', { id: budget.serviceId, refreshKey: Date.now() })} />
          ) : null}
          {budget.validUntil ? <Row><Label>Validade</Label><Value>{formatDateBR(budget.validUntil)}</Value></Row> : null}
          {budget.notes ? <Label>{budget.notes}</Label> : null}
          {budget.status === 'APROVADO' && !budget.serviceId ? <Label>Aprovado pelas casas. Pode ser escolhido ao cadastrar ou editar um serviço.</Label> : null}
          {documents[0] ? (
            <Button
              title="Abrir PDF do orçamento"
              icon={ExternalLink}
              variant="ghost"
              onPress={() => api.openDocument(documents[0].url).catch(() => Alert.alert('Orçamento', 'Não foi possível abrir o documento.'))}
            />
          ) : null}
          {canManageBudgets ? (
            <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
              {budget.status === 'APROVADO' && !budget.serviceId ? (
                <Button
                  title="Criar serviço com este orçamento"
                  icon={Wrench}
                  onPress={() => navigation.navigate('ServiceForm', { formMode: 'create', serviceId: null, budgetId: budget.id, formKey: Date.now() })}
                />
              ) : null}
              <Button title="Editar" icon={Pencil} variant="ghost" onPress={() => navigation.navigate('BudgetForm', { formMode: 'edit', budgetId: budget.id, formKey: Date.now() })} />
            </Row>
          ) : null}
        </Card>
      ) : null}
      {budget && voting && showVoting ? (
        <Card>
          <Row>
            <Value>Votação das casas</Value>
            <Vote color={colors.blue} size={22} />
          </Row>
          <Label>
            {voting.open
              ? `${voting.approveVotes + voting.rejectVotes} de ${voting.participatingHouses} casas votaram. O orçamento é aprovado com ${voting.votesToApprove} votos "Aprovar".`
              : `Votação encerrada${voting.closedAt ? ` em ${formatVotingDate(voting.closedAt)}` : ''}. Resultado: ${resultLabel(voting.status)}.`}
          </Label>
          {voting.open && voting.deadline ? <Label>{deadlineLabel(voting.deadline)}. Depois do prazo a votação encerra sozinha.</Label> : null}
          <View style={styles.scoreRow}>
            <ScoreBox label="Aprovam" value={voting.approveVotes} color={colors.green} background={colors.greenSoft} />
            <ScoreBox label="Recusam" value={voting.rejectVotes} color={colors.red} background={colors.redSoft} />
            {voting.open ? <ScoreBox label="Aguardando" value={voting.pendingVotes} color={colors.amber} background={colors.amberSoft} /> : null}
          </View>
          <View style={styles.houseList}>
            {voting.houses.map((house) => (
              <Row key={house.houseId}>
                <Text style={styles.houseName}>{house.houseLabel}</Text>
                <Badge status={house.voted ? 'VOTOU' : 'PENDING'} />
              </Row>
            ))}
          </View>
          {voting.open && voting.canVote ? (
            <>
              {budget.serviceId && quotes.length > 1 ? (
                <Label>Este orçamento é uma das cotações do serviço. Cada casa aprova só uma: ao aprovar esta, o seu "sim" nas outras é retirado.</Label>
              ) : null}
              <Label>
                {voting.myVote
                  ? `Seu voto: ${voteLabel(voting.myVote)}. Você pode mudar até a votação encerrar.`
                  : 'Sua casa ainda não votou. O voto de cada casa não é mostrado para as outras.'}
              </Label>
              <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <Button
                  title={sendingVote === 'APROVAR' ? 'Enviando...' : 'Aprovar'}
                  icon={ThumbsUp}
                  onPress={() => vote('APROVAR')}
                  disabled={Boolean(sendingVote)}
                />
                <Button
                  title={sendingVote === 'RECUSAR' ? 'Enviando...' : 'Recusar'}
                  icon={ThumbsDown}
                  variant="danger"
                  onPress={() => vote('RECUSAR')}
                  disabled={Boolean(sendingVote)}
                />
              </Row>
            </>
          ) : voting.open && voting.cannotVoteReason ? (
            <Label>{voting.cannotVoteReason}</Label>
          ) : null}
          {canManageBudgets && voting.open ? (
            confirmingClose ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmTitle}>Encerrar a votação agora?</Text>
                <Text style={styles.confirmText}>
                  Com {votingScore(voting)}, o resultado será: {closingResult(voting)}. Depois de encerrada, ninguém mais pode votar.
                </Text>
                <Row>
                  <Button title="Cancelar" variant="ghost" onPress={() => setConfirmingClose(false)} disabled={closing} />
                  <Button title={closing ? 'Encerrando...' : 'Encerrar'} icon={Lock} variant="danger" onPress={closeVoting} disabled={closing} />
                </Row>
              </View>
            ) : (
              <Button title="Encerrar votação" icon={Lock} variant="ghost" onPress={() => setConfirmingClose(true)} />
            )
          ) : null}
        </Card>
      ) : null}
      {budget && quotes.length > 1 ? (
        <Card>
          <Value>Cotações do mesmo serviço</Value>
          <Label>Compare antes de votar. A de menor valor está marcada.</Label>
          {quotes.map((quote) => (
            <Pressable
              key={quote.id}
              accessibilityRole="button"
              onPress={() => quote.id !== budget.id && navigation.navigate('BudgetDetails', { id: quote.id, refreshKey: Date.now() })}
              style={[styles.quoteRow, quote.id === budget.id ? styles.quoteRowCurrent : null]}
            >
              <View style={styles.quoteCopy}>
                <Text style={styles.houseName}>{quote.supplier}{quote.id === budget.id ? ' (esta)' : ''}</Text>
                <View style={styles.quoteTags}>
                  <Badge status={budgetBadgeStatus(quote.status)} />
                  {quote.id === lowestQuoteId(quotes) ? <Badge status="MENOR VALOR" /> : null}
                </View>
              </View>
              <Money value={quote.amount} />
            </Pressable>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function resultLabel(status: Budget['status']) {
  return status === 'APROVADO' ? 'aprovado' : status === 'CANCELADO' ? 'cancelado' : 'recusado';
}

function ScoreBox({ label, value, color, background }: { label: string; value: number; color: string; background: string }) {
  return (
    <View style={[styles.scoreBox, { backgroundColor: background }]}>
      <Text style={[styles.scoreValue, { color }]}>{value}</Text>
      <Text style={[styles.scoreLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scopeBox: {
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4
  },
  scopeTitle: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900'
  },
  scopeText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600'
  },
  quoteRow: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  quoteRowCurrent: {
    borderColor: colors.blue,
    backgroundColor: '#F4F8FF'
  },
  quoteCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6
  },
  quoteTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  scoreRow: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  scoreBox: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 2
  },
  scoreValue: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900'
  },
  scoreLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800'
  },
  houseList: {
    gap: spacing.xs
  },
  houseName: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    flexShrink: 1
  },
  confirmBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    padding: spacing.sm,
    gap: spacing.sm
  },
  confirmTitle: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900'
  },
  confirmText: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700'
  },
  successCard: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft
  },
  successText: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900'
  },
  errorCard: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900'
  }
});
