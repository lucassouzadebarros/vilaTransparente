import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, CalendarDays, CheckCircle2, ExternalLink, FileText, Flag, Link2, Save, Trash2, Upload, UserRound, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Badge, Card, Label, Money } from '../components/ui';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ServiceOrder } from '../types';

const statusOptions: Array<Budget['status']> = ['EM_ANALISE', 'APROVADO', 'REJEITADO', 'CANCELADO'];

const statusLabels: Record<Budget['status'], string> = {
  EM_ANALISE: 'Em análise',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  CANCELADO: 'Cancelado'
};

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

  function cancel() {
    navigation.navigate(isEditing && budgetId ? 'BudgetDetails' : 'Budgets', isEditing && budgetId ? { id: budgetId } : undefined);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SoftBackdrop compact />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={cancel} style={styles.backButton}>
          <ArrowLeft color={colors.ink} size={20} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{isEditing ? 'Editar orçamento' : 'Novo orçamento'}</Text>
          <Text style={styles.subtitle}>{isEditing ? `Orçamento #${budgetId}` : 'Cotação de fornecedor'}</Text>
        </View>
      </View>

      {error ? (
        <Card style={styles.errorCard}>
          <Label>{error}</Label>
        </Card>
      ) : null}

      <FormSection icon={Flag} title="Status">
        {loading ? <Text style={styles.sectionHelp}>Carregando...</Text> : null}
        <View style={styles.statusGrid}>
          {statusOptions.map((item) => (
            <StatusChoice key={item} label={statusLabels[item]} selected={item === status} onPress={() => setStatus(item)} />
          ))}
        </View>
      </FormSection>

      <FormSection icon={Link2} title="Serviço vinculado">
        <BudgetChoice
          selected={serviceId === null}
          title="Sem serviço vinculado"
          subtitle="Orçamento avulso"
          onPress={() => setServiceId(null)}
        />
        {services.map((service) => {
          const selected = service.id === serviceId;
          return (
            <BudgetChoice
              key={service.id}
              selected={selected}
              title={service.title}
              subtitle={`Serviço #${service.id} - ${service.status.replace('_', ' ')}`}
              onPress={() => setServiceId(service.id ?? null)}
              right={
                <View style={styles.budgetRight}>
                  {selected ? <Badge status="SELECIONADO" /> : null}
                  <Money value={service.finalValue ?? service.expectedValue ?? 0} />
                </View>
              }
            />
          );
        })}
      </FormSection>

      <FormSection icon={UserRound} title="Fornecedor">
        <FormField label="Título" value={title} onChangeText={setTitle} placeholder="Digite o título do serviço" />
        <FormField label="Fornecedor" value={supplier} onChangeText={setSupplier} placeholder="Nome do fornecedor" />
        <View style={styles.twoColumns}>
          <FormField label="CNPJ do fornecedor" value={supplierDocument} onChangeText={setSupplierDocument} placeholder="12.345.678/0001-90" style={styles.columnField} />
          <FormField label="Telefone" value={phone} onChangeText={setPhone} placeholder="(00) 00000-0000" style={styles.columnField} />
        </View>
        <FormField label="Valor" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="R$ 0,00" />
      </FormSection>

      <FormSection icon={CalendarDays} title="Datas e observações">
        <View style={styles.threeColumns}>
          <FormField label="Data do orçamento" value={budgetDate} onChangeText={setBudgetDate} placeholder="AAAA-MM-DD" right={<CalendarDays color={colors.muted} size={15} />} style={styles.columnField} />
          <FormField label="Validade" value={validUntil} onChangeText={setValidUntil} placeholder="AAAA-MM-DD" right={<CalendarDays color={colors.muted} size={15} />} style={styles.columnField} />
          <FormField label="Previsão de execução" value={expectedDate} onChangeText={setExpectedDate} placeholder="AAAA-MM-DD" right={<CalendarDays color={colors.muted} size={15} />} style={styles.columnField} />
        </View>
        <FormField label="Observações" value={notes} onChangeText={setNotes} placeholder="Informações adicionais, observações, instruções..." multiline />
      </FormSection>

      <FormSection icon={FileText} title="Documento do orçamento">
        <FormField label="Nome do documento" value={documentName} onChangeText={setDocumentName} placeholder="Orçamento" />
        <FormField label="Link do PDF" value={documentUrl} onChangeText={setDocumentUrl} placeholder="https://.../orcamento.pdf" />
        {documentFile ? <Text style={styles.sectionHelp}>Arquivo selecionado: {documentFile.name}</Text> : null}
        {existingDocument && !documentFile ? <Text style={styles.sectionHelp}>Documento atual: {existingDocument.name}</Text> : null}
        <View style={styles.documentActions}>
          <DocumentActionButton title="Selecionar PDF" icon={Upload} onPress={selectPdf} />
          <DocumentActionButton title="Visualizar PDF" icon={ExternalLink} onPress={previewDocument} />
          <DocumentActionButton title="Limpar documento" icon={Trash2} danger onPress={() => { setDocumentUrl(''); setDocumentFile(null); setExistingDocument(null); }} />
        </View>
      </FormSection>

      <View style={styles.footerActions}>
        <FooterActionButton title="Cancelar" icon={X} onPress={cancel} />
        <FooterActionButton title={saving ? 'Salvando...' : isEditing ? 'Atualizar orçamento' : 'Salvar orçamento'} icon={Save} onPress={save} primary disabled={!canSave} />
      </View>
    </ScrollView>
  );
}

function FormSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Icon color={colors.blue} size={18} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  right,
  style
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  multiline?: boolean;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputFrame, multiline ? styles.inputFrameMultiline : null]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          multiline={multiline}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
          placeholderTextColor={colors.muted}
        />
        {right ? <View style={styles.inputAction}>{right}</View> : null}
      </View>
    </View>
  );
}

function StatusChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.statusChoice, selected ? styles.statusChoiceSelected : null]}>
      {selected ? <CheckCircle2 color={colors.surface} size={15} /> : null}
      <Text style={[styles.statusChoiceText, selected ? styles.statusChoiceTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function BudgetChoice({
  title,
  subtitle,
  selected,
  onPress,
  right
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  right?: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.budgetChoice, selected ? styles.budgetChoiceSelected : null]}>
      <View style={styles.documentMiniIcon}>
        <FileText color={colors.blue} size={20} />
      </View>
      <View style={styles.budgetCopy}>
        <Text style={styles.budgetTitle}>{title}</Text>
        <Text style={styles.budgetSubtitle}>{subtitle}</Text>
      </View>
      {right ?? (selected ? <View style={styles.selectedPill}><CheckCircle2 color={colors.blue} size={14} /><Text style={styles.selectedText}>SELECIONADO</Text></View> : null)}
    </Pressable>
  );
}

function DocumentActionButton({ title, icon: Icon, onPress, danger }: { title: string; icon: LucideIcon; onPress: () => void; danger?: boolean }) {
  const color = danger ? colors.red : colors.blue;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.documentActionButton}>
      <Icon color={color} size={15} />
      <Text style={[styles.documentActionText, danger ? styles.documentActionTextDanger : null]}>{title}</Text>
    </Pressable>
  );
}

function FooterActionButton({
  title,
  icon: Icon,
  onPress,
  primary,
  disabled
}: {
  title: string;
  icon: LucideIcon;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.footerButton,
        primary ? styles.footerButtonPrimary : null,
        { opacity: disabled ? 0.5 : pressed ? 0.84 : 1 }
      ]}
    >
      <Icon color={primary ? colors.surface : colors.blue} size={16} />
      <Text style={[styles.footerButtonText, primary ? styles.footerButtonTextPrimary : null]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 106,
    gap: 10,
    position: 'relative'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 4,
    zIndex: 1
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerCopy: {
    flex: 1
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  errorCard: {
    borderColor: colors.red,
    zIndex: 1
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 13,
    gap: 10,
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    zIndex: 1
  },
  sectionHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  sectionIcon: {
    width: 31,
    height: 31,
    borderRadius: 999,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    letterSpacing: 0
  },
  sectionHelp: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600'
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  statusChoice: {
    minHeight: 40,
    flex: 1,
    minWidth: 108,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  statusChoiceSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blue
  },
  statusChoiceText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase'
  },
  statusChoiceTextSelected: {
    color: colors.surface
  },
  budgetChoice: {
    minHeight: 62,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  budgetChoiceSelected: {
    borderColor: colors.blue,
    backgroundColor: '#F4F8FF'
  },
  documentMiniIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  budgetCopy: {
    flex: 1,
    gap: 3
  },
  budgetTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900'
  },
  budgetSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  selectedPill: {
    minHeight: 28,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  selectedText: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: '900'
  },
  budgetRight: {
    alignItems: 'flex-end',
    gap: spacing.xs
  },
  field: {
    gap: 5
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900'
  },
  inputFrame: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center'
  },
  inputFrameMultiline: {
    minHeight: 76,
    alignItems: 'flex-start'
  },
  input: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600'
  },
  inputMultiline: {
    minHeight: 74,
    paddingTop: 11,
    textAlignVertical: 'top'
  },
  inputAction: {
    minWidth: 38,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.sm
  },
  twoColumns: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  threeColumns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  columnField: {
    flex: 1,
    minWidth: 130
  },
  documentActions: {
    gap: spacing.sm
  },
  documentActionButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs
  },
  documentActionText: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center'
  },
  documentActionTextDanger: {
    color: colors.red
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: 2,
    zIndex: 1
  },
  footerButton: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm
  },
  footerButtonPrimary: {
    flex: 1,
    borderColor: colors.blue,
    backgroundColor: colors.blue
  },
  footerButtonText: {
    color: colors.blue,
    fontSize: 12,
    fontWeight: '900'
  },
  footerButtonTextPrimary: {
    color: colors.surface
  }
});
