import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RefreshCw } from 'lucide-react-native';
import { Button, Card, Label, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { AuditEntry } from '../types';
import { formatDateTimeBR } from '../utils/format';

const actionLabels: Record<string, string> = {
  EXPENSE_CREATED: 'Despesa lançada',
  EXPENSE_UPDATED: 'Despesa alterada',
  EXPENSE_DELETED: 'Despesa apagada',
  MANUAL_PAYMENT: 'Pagamento marcado como pago',
  PIX_CANCELLED: 'Cobrança Pix cancelada',
  SERVICE_CREATED: 'Serviço cadastrado',
  SERVICE_UPDATED: 'Serviço alterado',
  SERVICE_FINISHED: 'Serviço finalizado',
  SERVICE_CANCELLED: 'Serviço cancelado',
  REPORT_TO_SERVICE: 'Relato virou serviço',
  REPORT_RESOLVED: 'Relato resolvido',
  BUDGET_CREATED: 'Orçamento cadastrado',
  BUDGET_UPDATED: 'Orçamento alterado',
  BUDGET_RULE_CHANGED: 'Regra de orçamento alterada',
  BUDGET_EXPIRED: 'Votação encerrada pelo prazo',
  BUDGET_APROVADO: 'Orçamento aprovado',
  BUDGET_REJEITADO: 'Orçamento recusado',
  BUDGET_CANCELADO: 'Orçamento cancelado',
  HOUSE_RELEASED: 'Casa liberada',
  SINDICO_CHANGED: 'Síndico alterado'
};

const dangerActions = new Set(['EXPENSE_DELETED', 'PIX_CANCELLED', 'SERVICE_CANCELLED', 'BUDGET_CANCELADO', 'HOUSE_RELEASED']);

/** Who changed money or access, and when. Admin only. */
export function AuditLogScreen() {
  const { isAdmin } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setEntries(await api.auditLog());
    } catch (failure) {
      setError(apiErrorMessage(failure, 'Não consegui carregar o histórico.'));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) {
        load().catch(() => undefined);
      }
    }, [isAdmin, load])
  );

  return (
    <Screen title="Histórico de alterações" subtitle="Quem mexeu em dinheiro e acessos" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {!isAdmin ? <Card><Label>Somente o administrador vê este histórico.</Label></Card> : null}
      {error ? <Card><Label>{error}</Label></Card> : null}
      {isAdmin && !error && entries.length === 0 ? <Card><Label>Nenhuma alteração registrada ainda. As próximas aparecem aqui.</Label></Card> : null}
      {entries.map((entry) => (
        <Card key={entry.id}>
          <Value style={dangerActions.has(entry.action) ? styles.danger : undefined}>{actionLabels[entry.action] ?? entry.action}</Value>
          {entry.summary ? <Text style={styles.summary}>{entry.summary}</Text> : null}
          <View style={styles.meta}>
            <Label>{entry.actorEmail === 'sistema' || !entry.actorEmail ? 'Sistema' : entry.actorEmail}</Label>
            <Label>{formatDateTimeBR(entry.createdAt)}</Label>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  danger: { color: colors.red },
  summary: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }
});
