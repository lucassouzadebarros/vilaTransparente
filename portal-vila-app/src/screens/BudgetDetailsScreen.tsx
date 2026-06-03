import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CheckCircle2, ExternalLink, Pencil, RefreshCw, XCircle } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Budget, PortalDocument } from '../types';

export function BudgetDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const id = Number(route.params?.id ?? 1);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [nextBudget, nextDocuments] = await Promise.all([
        api.budget(id),
        api.documents('BUDGET', id)
      ]);
      setBudget(nextBudget);
      setDocuments(nextDocuments);
    } catch {
      setError('Nao consegui carregar este orcamento.');
    }
  }

  async function approve() {
    try {
      setBudget(await api.approveBudget(id));
      Alert.alert('Orcamento', 'Orcamento aprovado.');
    } catch {
      Alert.alert('Orcamento', 'Vincule o orcamento a um servico antes de aprovar.');
    }
  }

  async function reject() {
    try {
      setBudget(await api.rejectBudget(id));
      Alert.alert('Orcamento', 'Orcamento rejeitado.');
    } catch {
      Alert.alert('Orcamento', 'Nao foi possivel rejeitar este orcamento.');
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [id, route.params?.refreshKey])
  );

  return (
    <Screen title="Orcamento" subtitle="Detalhe da proposta" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {error ? (
        <Card>
          <Value>Erro</Value>
          <Label>{error}</Label>
        </Card>
      ) : null}
      {budget ? (
        <Card>
          <Row>
            <Value>{budget.supplier}</Value>
            <Badge status={budget.status} />
          </Row>
          {budget.supplierDocument ? <Label>CNPJ {budget.supplierDocument}</Label> : null}
          <Label>{budget.title}</Label>
          <Money value={budget.amount} strong />
          <Row><Label>Servico</Label><Value>{budget.serviceId ? `#${budget.serviceId}` : 'Sem vinculo'}</Value></Row>
          {budget.validUntil ? <Row><Label>Validade</Label><Value>{budget.validUntil}</Value></Row> : null}
          {budget.notes ? <Label>{budget.notes}</Label> : null}
          {!budget.serviceId ? <Label>Vincule este orcamento a um servico antes de aprovar.</Label> : null}
          {documents[0] ? (
            <Button
              title="Abrir PDF do orcamento"
              icon={ExternalLink}
              variant="ghost"
              onPress={() => Linking.openURL(api.documentUrl(documents[0].url))}
            />
          ) : null}
          {isAdmin ? (
            <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
              <Button title="Editar" icon={Pencil} variant="ghost" onPress={() => navigation.navigate('BudgetForm', { formMode: 'edit', budgetId: budget.id, formKey: Date.now() })} />
              <Button title="Aprovar" icon={CheckCircle2} onPress={approve} disabled={!budget.serviceId} />
              <Button title="Rejeitar" icon={XCircle} variant="danger" onPress={reject} />
            </Row>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
