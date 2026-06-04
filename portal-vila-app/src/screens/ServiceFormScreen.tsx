import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ExternalLink, FileText, Save, Upload, X } from 'lucide-react-native';
import { Badge, Button, Card, Field, Label, Money, Row, Screen, Value } from '../components/ui';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ServiceOrder } from '../types';

const priorityOptions: Array<ServiceOrder['priority']> = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];
const statusOptions: Array<ServiceOrder['status']> = ['PLANEJADO', 'APROVADO', 'EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO'];

function positiveId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, '');
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes(',')) {
    const parsed = Number(normalized.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatAmount(value?: number | null) {
  return value ? String(value).replace('.', ',') : '';
}

export function ServiceFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const formMode = route.params?.formMode as 'create' | 'edit' | undefined;
  const routeServiceId = positiveId(route.params?.serviceId ?? route.params?.service?.id);
  const editingServiceId = formMode === 'create' ? null : routeServiceId;
  const seedBudgetId = positiveId(route.params?.budgetId);
  const formKey = route.params?.formKey ?? route.key;

  const [serviceId, setServiceId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<ServiceOrder['priority']>('MEDIA');
  const [status, setStatus] = useState<ServiceOrder['status']>('PLANEJADO');
  const [expectedValue, setExpectedValue] = useState('');
  const [finalValue, setFinalValue] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [completedDate, setCompletedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [documentName, setDocumentName] = useState('Nota Fiscal');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [existingDocument, setExistingDocument] = useState<PortalDocument | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedBudget = useMemo(() => {
    return budgets.find((budget) => budget.id === selectedBudgetId);
  }, [budgets, selectedBudgetId]);

  const budgetOptions = useMemo(() => {
    return budgets.filter((budget) => budget.status === 'APROVADO').slice().sort((a, b) => {
      const aLinked = a.serviceId ? 1 : 0;
      const bLinked = b.serviceId ? 1 : 0;
      if (aLinked !== bLinked) {
        return aLinked - bLinked;
      }
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [budgets]);

  const isEditing = Boolean(serviceId);
  const canSave = Boolean(title.trim() && description.trim() && !saving && !loading);

  function resetForm(nextBudgetId: number | null) {
    setServiceId(null);
    setTitle('');
    setDescription('');
    setCategory('');
    setPriority('MEDIA');
    setStatus('PLANEJADO');
    setExpectedValue('');
    setFinalValue('');
    setSupplier('');
    setSupplierDocument('');
    setPlannedDate('');
    setCompletedDate('');
    setNotes('');
    setDocumentName('Nota Fiscal');
    setDocumentUrl('');
    setDocumentFile(null);
    setExistingDocument(null);
    setSelectedBudgetId(nextBudgetId);
  }

  function fillForm(service: ServiceOrder, documents: PortalDocument[]) {
    const document = documents.find((item) => item.type === 'NOTA_FISCAL' || item.type === 'RECIBO') ?? documents[0] ?? null;
    setServiceId(service.id ?? null);
    setTitle(service.title ?? '');
    setDescription(service.description ?? '');
    setCategory(service.category ?? '');
    setPriority(service.priority ?? 'MEDIA');
    setStatus(service.status ?? 'PLANEJADO');
    setExpectedValue(formatAmount(service.expectedValue));
    setFinalValue(formatAmount(service.finalValue));
    setSupplier(service.supplier ?? '');
    setSupplierDocument(service.supplierDocument ?? '');
    setPlannedDate(service.plannedDate ?? '');
    setCompletedDate(service.completedDate ?? '');
    setNotes(service.notes ?? '');
    setDocumentName(document?.name ?? 'Nota Fiscal');
    setDocumentUrl(document?.url ?? '');
    setDocumentFile(null);
    setExistingDocument(document);
    setSelectedBudgetId(service.approvedBudgetId ?? seedBudgetId ?? null);
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setLoading(true);
        setError('');
        try {
          const nextBudgets = await api.budgets();
          if (!active) {
            return;
          }
          setBudgets(nextBudgets);

          if (editingServiceId) {
            const [nextService, nextDocuments] = await Promise.all([
              api.service(editingServiceId),
              api.documents('SERVICE', editingServiceId)
            ]);
            if (active) {
              fillForm(nextService, nextDocuments);
            }
            return;
          }

          resetForm(seedBudgetId && nextBudgets.some((budget) => budget.id === seedBudgetId) ? seedBudgetId : null);
        } catch (err) {
          if (active) {
            resetForm(null);
            setError(apiErrorMessage(err, 'Não consegui carregar o formulário de serviço.'));
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }
      load();
      return () => {
        active = false;
      };
    }, [editingServiceId, seedBudgetId, formKey])
  );

  function chooseBudget(budget: Budget | null) {
    setSelectedBudgetId(budget?.id ?? null);
    if (!budget) {
      return;
    }
    if (!expectedValue.trim()) {
      setExpectedValue(formatAmount(budget.amount));
    }
    if (!supplier.trim()) {
      setSupplier(budget.supplier ?? '');
    }
    if (!supplierDocument.trim()) {
      setSupplierDocument(budget.supplierDocument ?? '');
    }
  }

  async function save() {
    if (!title.trim()) {
      setError('Informe o título do serviço.');
      return;
    }
    if (!description.trim()) {
      setError('Informe a descrição do serviço.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: ServiceOrder = {
        id: serviceId ?? undefined,
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || undefined,
        priority,
        status,
        expectedValue: parseAmount(expectedValue) ?? selectedBudget?.amount,
        finalValue: parseAmount(finalValue),
        supplier: supplier.trim() || selectedBudget?.supplier || undefined,
        supplierDocument: supplierDocument.trim() || selectedBudget?.supplierDocument || undefined,
        plannedDate: plannedDate.trim() || undefined,
        completedDate: completedDate.trim() || undefined,
        approvedBudgetId: selectedBudgetId,
        notes: notes.trim() || undefined
      };

      const savedService = serviceId
        ? await api.updateService(serviceId, payload)
        : await api.createService(payload);
      const savedServiceId = savedService.id ?? serviceId;

      if (documentFile && savedServiceId) {
        await api.uploadDocument(documentFile, {
          name: documentName.trim() || documentFile.name,
          type: 'NOTA_FISCAL',
          relatedType: 'SERVICE',
          relatedId: savedServiceId,
          description: 'Documento fiscal vinculado ao cadastro do serviço.'
        });
      } else if (documentUrl.trim() && savedServiceId && existingDocument?.url !== documentUrl.trim()) {
        await api.createDocument({
          name: documentName.trim() || 'Nota Fiscal',
          type: 'NOTA_FISCAL',
          url: documentUrl.trim(),
          relatedType: 'SERVICE',
          relatedId: savedServiceId,
          description: 'Documento fiscal vinculado ao cadastro do serviço.'
        });
      }

      Alert.alert('Serviço', isEditing ? 'Serviço atualizado.' : 'Serviço salvo.');
      if (savedServiceId) {
        navigation.navigate('ServiceDetails', { id: savedServiceId, refreshKey: Date.now() });
      } else {
        navigation.navigate('Servicos', { refreshKey: Date.now() });
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Não consegui salvar o serviço.'));
    } finally {
      setSaving(false);
    }
  }

  function previewDocument() {
    const previewUrl = documentFile ? URL.createObjectURL(documentFile) : documentUrl.trim();
    if (!previewUrl) {
      Alert.alert('Documento fiscal', 'Informe o link do PDF da nota fiscal ou recibo.');
      return;
    }
    Linking.openURL(api.documentUrl(previewUrl)).catch(() => Alert.alert('Documento fiscal', 'Não foi possível abrir o link informado.'));
  }

  function selectPdf() {
    if (typeof document === 'undefined') {
      Alert.alert('Documento fiscal', 'Seleção de arquivo disponível no app web.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      setDocumentFile(file);
      setDocumentUrl('');
      if (!documentName.trim() || documentName === 'Nota Fiscal') {
        setDocumentName(file.name.replace(/\.pdf$/i, ''));
      }
    };
    input.click();
  }

  return (
    <Screen title={isEditing ? 'Editar serviço' : 'Novo serviço'} subtitle={isEditing ? `#${serviceId}` : 'Cadastro operacional'}>
      {error ? (
        <Card style={styles.errorCard}>
          <Label>{error}</Label>
        </Card>
      ) : null}

      <Card>
        <Value>Identificação</Value>
        <Field label="Título" value={title} onChangeText={setTitle} />
        <Field label="Descrição" value={description} onChangeText={setDescription} multiline />
        <Field label="Categoria" value={category} onChangeText={setCategory} placeholder="Portaria, limpeza, iluminação..." />
      </Card>

      <Card>
        <Value>Status e prioridade</Value>
        <View style={styles.optionGrid}>
          {statusOptions.map((item) => (
            <Button
              key={item}
              title={item.replace('_', ' ')}
              variant={item === status ? 'primary' : 'ghost'}
              onPress={() => setStatus(item)}
            />
          ))}
        </View>
        <View style={styles.optionGrid}>
          {priorityOptions.map((item) => (
            <Button
              key={item}
              title={item}
              variant={item === priority ? 'primary' : 'ghost'}
              onPress={() => setPriority(item)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <Value>Fornecedor e valores</Value>
        <Field label="Fornecedor" value={supplier} onChangeText={setSupplier} />
        <Field label="CNPJ do fornecedor" value={supplierDocument} onChangeText={setSupplierDocument} placeholder="12.345.678/0001-90" />
        <Field label="Valor previsto" value={expectedValue} onChangeText={setExpectedValue} keyboardType="numeric" />
        <Field label="Valor final" value={finalValue} onChangeText={setFinalValue} keyboardType="numeric" />
      </Card>

      <Card>
        <Value>Datas</Value>
        <Field label="Data planejada" value={plannedDate} onChangeText={setPlannedDate} placeholder="AAAA-MM-DD" />
        <Field label="Data de conclusão" value={completedDate} onChangeText={setCompletedDate} placeholder="AAAA-MM-DD" />
        <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
      </Card>

      <Card>
        <Value>Orçamento vinculado</Value>
        <Label>Somente orçamentos aprovados podem ser vinculados a um serviço.</Label>
        <Pressable
          accessibilityRole="button"
          onPress={() => chooseBudget(null)}
          style={[styles.optionCard, selectedBudgetId === null ? styles.optionCardSelected : null]}
        >
          <View style={styles.optionInfo}>
            <Value>Sem orçamento vinculado</Value>
            <Label>Serviço sem cotação base</Label>
          </View>
          {selectedBudgetId === null ? <Badge status="SELECIONADO" /> : null}
        </Pressable>
        {budgetOptions.length === 0 ? <Label>Nenhum orçamento aprovado disponível.</Label> : null}
        {budgetOptions.map((budget) => {
          const selected = budget.id === selectedBudgetId;
          return (
            <Pressable
              key={budget.id}
              accessibilityRole="button"
              onPress={() => chooseBudget(budget)}
              style={[styles.optionCard, selected ? styles.optionCardSelected : null]}
            >
              <View style={styles.optionInfo}>
                <Value>{budget.title}</Value>
                <Label>{budget.supplier} - {budget.serviceId ? `Serviço #${budget.serviceId}` : 'sem serviço'}</Label>
              </View>
              <View style={styles.optionRight}>
                <Badge status={budget.status} />
                <Money value={budget.amount} />
              </View>
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <Value>Documento fiscal</Value>
        <Field label="Nome do documento" value={documentName} onChangeText={setDocumentName} />
        <Field label="Link do PDF da nota fiscal/recibo" value={documentUrl} onChangeText={setDocumentUrl} placeholder="https://.../nota-fiscal.pdf" />
        <Button title="Selecionar PDF" icon={Upload} variant="ghost" onPress={selectPdf} />
        {documentFile ? <Label>Arquivo selecionado: {documentFile.name}</Label> : null}
        {existingDocument && !documentFile ? <Label>Documento atual: {existingDocument.name}</Label> : null}
        <Button title="Visualizar PDF" icon={ExternalLink} variant="ghost" onPress={previewDocument} />
        <Button title="Limpar documento" icon={FileText} variant="ghost" onPress={() => { setDocumentUrl(''); setDocumentFile(null); setExistingDocument(null); }} />
      </Card>

      <Row style={{ flexWrap: 'wrap' }}>
        <Button title="Cancelar" icon={X} variant="ghost" onPress={() => navigation.navigate(isEditing && serviceId ? 'ServiceDetails' : 'Servicos', isEditing && serviceId ? { id: serviceId } : undefined)} />
        <Button title={saving ? 'Salvando...' : isEditing ? 'Atualizar serviço' : 'Salvar serviço'} icon={Save} onPress={save} disabled={!canSave} />
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorCard: {
    borderColor: colors.red
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  optionCard: {
    minHeight: 66,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  optionCardSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  optionInfo: {
    flex: 1,
    gap: spacing.xs
  },
  optionRight: {
    alignItems: 'flex-end',
    gap: spacing.xs
  }
});
