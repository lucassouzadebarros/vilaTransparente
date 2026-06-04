import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ExternalLink, FileText, Save, Upload, X } from 'lucide-react-native';
import { Badge, Button, Card, Field, Label, Money, Row, Screen, Value } from '../components/ui';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ServiceOrder } from '../types';

const statusOptions: Array<Budget['status']> = ['EM_ANALISE', 'APROVADO', 'REJEITADO', 'CANCELADO'];

function positiveId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, '');
  if (!normalized) {
    return 0;
  }
  if (normalized.includes(',')) {
    return Number(normalized.replace(/\./g, '').replace(',', '.'));
  }
  return Number(normalized);
}

function formatAmount(value?: number | null) {
  return value ? String(value).replace('.', ',') : '';
}

function resetDocumentName(file?: File | null) {
  return file?.name.replace(/\.pdf$/i, '') || 'Orçamento';
}

export function BudgetFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const formMode = route.params?.formMode as 'create' | 'edit' | undefined;
  const routeBudgetId = positiveId(route.params?.budgetId ?? route.params?.budget?.id);
  const editingBudgetId = formMode === 'create' ? null : routeBudgetId;
  const routeServiceId = positiveId(route.params?.serviceId);
  const returnToServiceId = positiveId(route.params?.returnToServiceId);
  const formKey = route.params?.formKey ?? route.key;

  const [services, setServices] = useState<ServiceOrder[]>([]);
  const [budgetId, setBudgetId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [budgetDate, setBudgetDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [status, setStatus] = useState<Budget['status']>('EM_ANALISE');
  const [notes, setNotes] = useState('');
  const [documentName, setDocumentName] = useState('Orçamento');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [existingDocument, setExistingDocument] = useState<PortalDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedService = useMemo(() => services.find((service) => service.id === serviceId), [services, serviceId]);
  const amountValue = parseAmount(amount);
  const isEditing = Boolean(budgetId);
  const canSave = Boolean(title.trim() && supplier.trim() && amountValue > 0 && !saving && !loading);

  function resetForm(nextServiceId: number | null) {
    setBudgetId(null);
    setServiceId(nextServiceId);
    setTitle('');
    setSupplier('');
    setSupplierDocument('');
    setPhone('');
    setAmount('');
    setBudgetDate('');
    setValidUntil('');
    setExpectedDate('');
    setStatus('EM_ANALISE');
    setNotes('');
    setDocumentName('Orçamento');
    setDocumentUrl('');
    setDocumentFile(null);
    setExistingDocument(null);
  }

  function fillForm(budget: Budget, documents: PortalDocument[]) {
    const document = documents.find((item) => item.type === 'ORCAMENTO') ?? documents[0] ?? null;
    setBudgetId(budget.id ?? null);
    setServiceId(budget.serviceId ?? null);
    setTitle(budget.title ?? '');
    setSupplier(budget.supplier ?? '');
    setSupplierDocument(budget.supplierDocument ?? '');
    setPhone(budget.phone ?? '');
    setAmount(formatAmount(budget.amount));
    setBudgetDate(budget.budgetDate ?? '');
    setValidUntil(budget.validUntil ?? '');
    setExpectedDate(budget.expectedDate ?? '');
    setStatus(budget.status ?? 'EM_ANALISE');
    setNotes(budget.notes ?? '');
    setDocumentName(document?.name ?? 'Orçamento');
    setDocumentUrl(document?.url ?? '');
    setDocumentFile(null);
    setExistingDocument(document);
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setLoading(true);
        setError('');
        try {
          const nextServices = await api.services();
          if (!active) {
            return;
          }
          setServices(nextServices);

          if (editingBudgetId) {
            const [nextBudget, nextDocuments] = await Promise.all([
              api.budget(editingBudgetId),
              api.documents('BUDGET', editingBudgetId)
            ]);
            if (active) {
              fillForm(nextBudget, nextDocuments);
            }
            return;
          }

          const nextServiceId = routeServiceId && nextServices.some((service) => service.id === routeServiceId)
            ? routeServiceId
            : null;
          resetForm(nextServiceId);
        } catch (err) {
          if (active) {
            resetForm(routeServiceId);
            setError(apiErrorMessage(err, 'Não consegui carregar o formulário de orçamento.'));
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
    }, [editingBudgetId, routeServiceId, formKey])
  );

  function showError(message: string) {
    setError(message);
    Alert.alert('Orçamento', message);
  }

  async function save() {
    const serviceIdToSave = selectedService?.id ?? null;
    if (!title.trim()) {
      showError('Informe o título do orçamento.');
      return;
    }
    if (!supplier.trim()) {
      showError('Informe o fornecedor do orçamento.');
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showError('Informe um valor válido para o orçamento.');
      return;
    }
    if (status === 'APROVADO' && !serviceIdToSave) {
      showError('Vincule o orçamento a um serviço antes de marcar como aprovado.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: Budget = {
        id: budgetId ?? undefined,
        serviceId: serviceIdToSave,
        title: title.trim(),
        supplier: supplier.trim(),
        supplierDocument: supplierDocument.trim() || undefined,
        phone: phone.trim() || undefined,
        amount: amountValue,
        budgetDate: budgetDate.trim() || undefined,
        validUntil: validUntil.trim() || undefined,
        expectedDate: expectedDate.trim() || undefined,
        status,
        documentId: existingDocument?.id,
        notes: notes.trim() || undefined
      };

      let saved = budgetId
        ? await api.updateBudget(budgetId, payload)
        : await api.createBudget(serviceIdToSave, payload);

      if (saved.id && documentFile) {
        const document = await api.uploadDocument(documentFile, {
          name: documentName.trim() || documentFile.name,
          type: 'ORCAMENTO',
          relatedType: 'BUDGET',
          relatedId: saved.id,
          description: 'PDF do orçamento enviado pelo fornecedor.'
        });
        saved = await api.updateBudget(saved.id, { ...saved, documentId: document.id });
      } else if (saved.id && documentUrl.trim() && existingDocument?.url !== documentUrl.trim()) {
        const document = await api.createDocument({
          name: documentName.trim() || 'Orçamento',
          type: 'ORCAMENTO',
          url: documentUrl.trim(),
          relatedType: 'BUDGET',
          relatedId: saved.id,
          description: 'Link do orçamento enviado pelo fornecedor.'
        });
        saved = await api.updateBudget(saved.id, { ...saved, documentId: document.id });
      }

      Alert.alert('Orçamento', isEditing ? 'Orçamento atualizado.' : 'Orçamento salvo.');
      if (returnToServiceId) {
        navigation.navigate('ServiceDetails', { id: returnToServiceId, refreshKey: Date.now() });
      } else if (saved.id) {
        navigation.navigate('BudgetDetails', { id: saved.id, refreshKey: Date.now() });
      } else {
        navigation.navigate('Budgets', { refreshKey: Date.now() });
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Não consegui salvar o orçamento.'));
    } finally {
      setSaving(false);
    }
  }

  function selectPdf() {
    if (typeof document === 'undefined') {
      Alert.alert('Orçamento', 'Seleção de arquivo disponível no app web.');
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
      if (!documentName.trim() || documentName === 'Orçamento') {
        setDocumentName(resetDocumentName(file));
      }
    };
    input.click();
  }

  function previewDocument() {
    const previewUrl = documentFile ? URL.createObjectURL(documentFile) : documentUrl.trim();
    if (!previewUrl) {
      Alert.alert('Orçamento', 'Informe o PDF ou link do orçamento.');
      return;
    }
    Linking.openURL(api.documentUrl(previewUrl)).catch(() => Alert.alert('Orçamento', 'Não foi possível abrir o documento.'));
  }

  return (
    <Screen title={isEditing ? 'Editar orçamento' : 'Novo orçamento'} subtitle={isEditing ? `#${budgetId}` : 'Cotação de fornecedor'}>
      {error ? (
        <Card style={styles.errorCard}>
          <Label>{error}</Label>
        </Card>
      ) : null}

      <Card>
        <Row>
          <Value>Status</Value>
          {loading ? <Label>Carregando...</Label> : null}
        </Row>
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
      </Card>

      <Card>
        <Value>Serviço vinculado</Value>
        <Pressable
          accessibilityRole="button"
          onPress={() => setServiceId(null)}
          style={[styles.optionCard, serviceId === null ? styles.optionCardSelected : null]}
        >
          <View style={styles.optionInfo}>
            <Value>Sem serviço vinculado</Value>
            <Label>Orçamento avulso</Label>
          </View>
          {serviceId === null ? <Badge status="SELECIONADO" /> : null}
        </Pressable>
        {services.map((service) => {
          const selected = service.id === serviceId;
          return (
            <Pressable
              key={service.id}
              accessibilityRole="button"
              onPress={() => setServiceId(service.id ?? null)}
              style={[styles.optionCard, selected ? styles.optionCardSelected : null]}
            >
              <View style={styles.optionInfo}>
                <Value>{service.title}</Value>
                <Label>Serviço #{service.id} - {service.status}</Label>
              </View>
              <View style={styles.optionRight}>
                {selected ? <Badge status="SELECIONADO" /> : null}
                <Money value={service.finalValue ?? service.expectedValue ?? 0} />
              </View>
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <Value>Fornecedor</Value>
        <Field label="Título" value={title} onChangeText={setTitle} />
        <Field label="Fornecedor" value={supplier} onChangeText={setSupplier} />
        <Field label="CNPJ do fornecedor" value={supplierDocument} onChangeText={setSupplierDocument} placeholder="12.345.678/0001-90" />
        <Field label="Telefone" value={phone} onChangeText={setPhone} />
        <Field label="Valor" value={amount} onChangeText={setAmount} keyboardType="numeric" />
      </Card>

      <Card>
        <Value>Datas e observações</Value>
        <Field label="Data do orçamento" value={budgetDate} onChangeText={setBudgetDate} placeholder="AAAA-MM-DD" />
        <Field label="Validade" value={validUntil} onChangeText={setValidUntil} placeholder="AAAA-MM-DD" />
        <Field label="Previsão de execução" value={expectedDate} onChangeText={setExpectedDate} placeholder="AAAA-MM-DD" />
        <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
      </Card>

      <Card>
        <Value>Documento do orçamento</Value>
        <Field label="Nome do documento" value={documentName} onChangeText={setDocumentName} />
        <Field label="Link do PDF" value={documentUrl} onChangeText={setDocumentUrl} placeholder="https://.../orcamento.pdf" />
        <Button title="Selecionar PDF" icon={Upload} variant="ghost" onPress={selectPdf} />
        {documentFile ? <Label>Arquivo selecionado: {documentFile.name}</Label> : null}
        {existingDocument && !documentFile ? <Label>Documento atual: {existingDocument.name}</Label> : null}
        <Button title="Visualizar PDF" icon={ExternalLink} variant="ghost" onPress={previewDocument} />
        <Button title="Limpar documento" icon={FileText} variant="ghost" onPress={() => { setDocumentUrl(''); setDocumentFile(null); setExistingDocument(null); }} />
      </Card>

      <Row style={{ flexWrap: 'wrap' }}>
        <Button title="Cancelar" icon={X} variant="ghost" onPress={() => navigation.navigate(isEditing && budgetId ? 'BudgetDetails' : 'Budgets', isEditing && budgetId ? { id: budgetId } : undefined)} />
        <Button title={saving ? 'Salvando...' : isEditing ? 'Atualizar orçamento' : 'Salvar orçamento'} icon={Save} onPress={save} disabled={!canSave} />
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
