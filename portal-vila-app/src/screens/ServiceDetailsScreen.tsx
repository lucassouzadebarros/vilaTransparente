import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CheckCircle2, ClipboardList, ExternalLink, FileText, Pencil, Plus, RefreshCw } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ServiceOrder } from '../types';

export function ServiceDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const id = Number(route.params?.id ?? 1);
  const [service, setService] = useState<ServiceOrder | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);

  async function load() {
    const [nextService, nextBudgets, nextDocuments] = await Promise.all([
      api.service(id),
      api.serviceBudgets(id),
      api.documents('SERVICE', id)
    ]);
    setService(nextService);
    setBudgets(nextBudgets);
    setDocuments(nextDocuments);
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [id, route.params?.refreshKey])
  );

  const approvedBudget = useMemo(() => {
    if (!service) {
      return undefined;
    }
    return budgets.find((budget) => budget.id === service.approvedBudgetId)
      ?? budgets.find((budget) => budget.status === 'APROVADO');
  }, [budgets, service]);

  const fiscalDocument = useMemo(() => {
    return documents.find((doc) => doc.type === 'NOTA_FISCAL' || doc.type === 'RECIBO') ?? documents[0];
  }, [documents]);

  function openDocument(document?: PortalDocument) {
    if (!document?.url) {
      Alert.alert('Documento', 'Nenhum documento fiscal foi vinculado a este servico.');
      return;
    }
    Linking.openURL(api.documentUrl(document.url)).catch(() => Alert.alert('Documento', 'Nao foi possivel abrir este documento.'));
  }

  return (
    <Screen title={service?.title ?? 'Detalhes do servico'} subtitle="Prestacao de contas" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {service ? (
        <>
          <Card>
            <DetailLine label="Status">
              <Badge status={service.status} />
            </DetailLine>
            <DetailLine label="Valor total">
              <Money value={service.finalValue ?? service.expectedValue ?? approvedBudget?.amount ?? 0} />
            </DetailLine>
            <DetailLine label="Fornecedor">
              <View style={styles.detailTextBlockRight}>
                <Value>{service.supplier ?? approvedBudget?.supplier ?? 'Nao definido'}</Value>
                <Label>{service.supplierDocument ?? approvedBudget?.supplierDocument ?? 'CNPJ nao informado'}</Label>
              </View>
            </DetailLine>
            <DetailLine label="Data do servico">
              <Value>{service.completedDate ?? service.plannedDate ?? 'A definir'}</Value>
            </DetailLine>
            <DetailLine label="Orcamento vinculado">
              <View style={styles.detailTextBlockRight}>
                <Value>{approvedBudget ? `#${approvedBudget.id} - ${approvedBudget.title}` : 'Nenhum selecionado'}</Value>
                {approvedBudget ? <Label>{approvedBudget.supplier}</Label> : null}
              </View>
            </DetailLine>
            <DetailLine label="Pagamento">
              <View style={styles.detailTextBlockRight}>
                {service.finalValue ? <Money value={service.finalValue} /> : <Value>Aguardando finalizacao</Value>}
                {service.completedDate ? <Label>Pago em {service.completedDate}</Label> : null}
              </View>
            </DetailLine>
          </Card>

          <Value>Documento</Value>
          <DocumentCard document={fiscalDocument} onPress={() => openDocument(fiscalDocument)} />

          <Card>
            <Value>Orcamentos</Value>
            <Label>{budgets.length} orcamento(s) vinculado(s). O detalhe financeiro principal usa somente o aprovado.</Label>
            <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
              {isAdmin ? <Button title="Novo orcamento" icon={Plus} onPress={() => navigation.navigate('BudgetForm', { formMode: 'create', budgetId: null, serviceId: service.id, returnToServiceId: service.id, formKey: Date.now() })} /> : null}
              <Button title="Ver orcamentos" icon={ClipboardList} variant="ghost" onPress={() => navigation.navigate('Budgets')} />
            </Row>
          </Card>

          {isAdmin ? (
            <Card>
              <Value>Acoes administrativas</Value>
              <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <Button title="Editar" icon={Pencil} variant="ghost" onPress={() => navigation.navigate('ServiceForm', { formMode: 'edit', serviceId: service.id, formKey: Date.now() })} />
                <Button title="Finalizar / anexar nota" icon={CheckCircle2} onPress={() => navigation.navigate('FinishService', { id: service.id })} />
              </Row>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.detailLine}>
      <Label>{label}</Label>
      <View style={styles.detailValue}>{children}</View>
    </View>
  );
}

function DocumentCard({ document, onPress }: { document?: PortalDocument; onPress: () => void }) {
  return (
    <Card>
      <Row>
        <View style={styles.documentLeft}>
          <View style={styles.pdfIcon}>
            <FileText color={colors.red} size={22} />
          </View>
          <View style={styles.detailTextBlock}>
            <Value>{document?.name ?? 'Nota fiscal nao anexada'}</Value>
            <Label>{document?.url ? document.url.split('/').pop() : 'Finalize o servico para anexar PDF ou link.'}</Label>
          </View>
        </View>
        <Button title="" icon={ExternalLink} variant="ghost" onPress={onPress} disabled={!document?.url} />
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  detailLine: {
    minHeight: 54,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  detailValue: {
    flex: 1,
    alignItems: 'flex-end'
  },
  detailTextBlock: {
    gap: spacing.xs,
    alignItems: 'flex-start'
  },
  detailTextBlockRight: {
    gap: spacing.xs,
    alignItems: 'flex-end'
  },
  documentLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  pdfIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
