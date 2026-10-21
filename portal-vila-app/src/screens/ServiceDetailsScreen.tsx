import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../utils/alert';
import { formatDateBR } from '../utils/format';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CheckCircle2, ClipboardList, ExternalLink, FileText, Pencil, RefreshCw, XCircle } from 'lucide-react-native';
import { Badge, Button, Card, Label, Money, Row, Screen, Value, formatMoney } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ServiceOrder } from '../types';

export function ServiceDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { isAdmin, canManageBudgets } = useAuth();
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
      Alert.alert('Documento', 'Nenhum documento fiscal foi vinculado a este serviço.');
      return;
    }
    api.openDocument(document.url).catch(() => Alert.alert('Documento', 'Não foi possível abrir este documento.'));
  }

  function confirmCancel() {
    Alert.alert('Cancelar serviço', 'O serviço deixa de aparecer como em andamento e não poderá ser finalizado. Deseja cancelar?', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar serviço',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelService(id);
            await load();
          } catch (err) {
            Alert.alert('Cancelar serviço', apiErrorMessage(err, 'Não consegui cancelar o serviço.'));
          }
        }
      }
    ]);
  }

  return (
    <Screen title={service?.title ?? 'Detalhes do serviço'} subtitle="Detalhes do serviço" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {service ? (
        <>
          <Card>
            <DetailLine label="Status">
              <Badge status={service.status} />
            </DetailLine>
            <DetailLine label="Valor previsto">
              <Money value={service.expectedValue ?? approvedBudget?.amount ?? 0} />
            </DetailLine>
            {service.finalValue != null && (service.expectedValue ?? approvedBudget?.amount) != null ? (
              <DetailLine label="Pago x previsto">
                <Value>{differenceLabel(service.finalValue, (service.expectedValue ?? approvedBudget?.amount) as number)}</Value>
              </DetailLine>
            ) : null}
            <DetailLine label="Fornecedor">
              <View style={styles.detailTextBlockRight}>
                <Value>{service.supplier ?? approvedBudget?.supplier ?? 'Não definido'}</Value>
                <Label>{service.supplierDocument ?? approvedBudget?.supplierDocument ?? 'CPF/CNPJ não informado'}</Label>
              </View>
            </DetailLine>
            <DetailLine label="Data do serviço">
              <Value>{formatDateBR(service.completedDate ?? service.plannedDate) || 'A definir'}</Value>
            </DetailLine>
            <DetailLine label="Orçamento vinculado">
              <View style={styles.detailTextBlockRight}>
                <Value>{approvedBudget ? `#${approvedBudget.id} - ${approvedBudget.title}` : 'Nenhum selecionado'}</Value>
                {approvedBudget ? <Label>{approvedBudget.supplier}</Label> : null}
              </View>
            </DetailLine>
            <DetailLine label="Pagamento">
              <View style={styles.detailTextBlockRight}>
                {service.finalValue ? (
                  <Money value={service.finalValue} />
                ) : (
                  <Value>{service.status === 'CANCELADO' ? 'Serviço cancelado' : 'Aguardando finalização'}</Value>
                )}
                {service.completedDate ? <Label>Pago em {formatDateBR(service.completedDate)}</Label> : null}
              </View>
            </DetailLine>
          </Card>

          <Value>Documento</Value>
          <DocumentCard document={fiscalDocument} status={service.status} onPress={() => openDocument(fiscalDocument)} />

          <Card>
            <Value>Orçamentos</Value>
            <Label>{budgets.length} orçamento(s) vinculado(s). Para vincular, edite o serviço e escolha um orçamento aprovado pelas casas.</Label>
            <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
              <Button title="Ver orçamentos" icon={ClipboardList} variant="ghost" onPress={() => navigation.navigate('Budgets')} />
            </Row>
          </Card>

          {canManageBudgets ? (
            <Card>
              <Value>Ações administrativas</Value>
              <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                <Button title="Editar" icon={Pencil} variant="ghost" onPress={() => navigation.navigate('ServiceForm', { formMode: 'edit', serviceId: service.id, formKey: Date.now() })} />
                {isAdmin && service.status !== 'CANCELADO' ? <Button title={service.status === 'FINALIZADO' ? 'Corrigir dados / anexar nota' : 'Finalizar / anexar nota'} icon={CheckCircle2} onPress={() => navigation.navigate('FinishService', { id: service.id })} /> : null}
                {service.status !== 'FINALIZADO' && service.status !== 'CANCELADO' ? <Button title="Cancelar serviço" icon={XCircle} variant="danger" onPress={confirmCancel} /> : null}
              </Row>
              {!isAdmin ? <Label>Finalizar o serviço gera uma despesa no caixa, por isso fica com o admin.</Label> : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function differenceLabel(paid: number, expected: number) {
  const delta = Math.round((paid - expected) * 100) / 100;
  if (delta === 0) {
    return 'Igual ao previsto';
  }
  return `${formatMoney(Math.abs(delta))} ${delta > 0 ? 'acima' : 'abaixo'} do previsto`;
}

function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.detailLine}>
      <Label>{label}</Label>
      <View style={styles.detailValue}>{children}</View>
    </View>
  );
}

function documentHint(status: ServiceOrder['status']) {
  if (status === 'FINALIZADO') {
    return 'Nenhuma nota ou recibo foi anexado a este serviço.';
  }
  if (status === 'CANCELADO') {
    return 'Serviço cancelado, sem documento.';
  }
  return 'A nota fiscal é anexada ao finalizar o serviço.';
}

function DocumentCard({ document, status, onPress }: { document?: PortalDocument; status: ServiceOrder['status']; onPress: () => void }) {
  return (
    <Card>
      <Row>
        <View style={styles.documentLeft}>
          <View style={styles.pdfIcon}>
            <FileText color={colors.red} size={22} />
          </View>
          <View style={styles.detailTextBlock}>
            <Value>{document?.name ?? 'Nota fiscal não anexada'}</Value>
            <Label>{document?.url ? document.url.split('/').pop() : documentHint(status)}</Label>
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
