import { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, CalendarDays, Check, ClipboardList, ExternalLink, FileText, Flag, Link2, Save, Trash2, Upload, UserRound, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Badge, Card, Label, Money } from '../components/ui';
import { FormField } from '../components/FormField';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ServiceOrder } from '../types';
import { formatMoneyBR } from '../utils/format';
import {
  currencyFromNumber,
  dateBRToISO,
  finishCurrency,
  isValidDocument,
  isoToDateBR,
  maskCurrency,
  maskDateBR,
  maskDocument,
  parseCurrency
} from '../utils/inputMasks';

const priorityOptions: Array<ServiceOrder['priority']> = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];

// Finishing and cancelling are their own actions on the service screen (finishing books the payment on the cash box).
const openStatusOptions: Array<{ value: 'PLANEJADO' | 'EM_ANDAMENTO'; label: string }> = [
  { value: 'PLANEJADO', label: 'Planejado' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' }
];

const statusLabels: Record<ServiceOrder['status'], string> = {
  PLANEJADO: 'Planejado',
  APROVADO: 'Aprovado',
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADO: 'Finalizado',
  CANCELADO: 'Cancelado'
};

const priorityLabels: Record<ServiceOrder['priority'], string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente'
};

const priorityColors: Record<ServiceOrder['priority'], string> = {
  BAIXA: colors.green,
  MEDIA: colors.blue,
  ALTA: colors.amber,
  URGENTE: colors.red
};

const categorySuggestions = ['Manutenção', 'Limpeza', 'Segurança', 'Jardinagem', 'Iluminação', 'Elétrica', 'Hidráulica', 'Pintura'];

type FieldErrors = Partial<Record<'title' | 'description' | 'supplierDocument' | 'plannedDate', string>>;

function positiveId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function ServiceFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const scrollRef = useRef<ScrollView>(null);
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
  const [paidSummary, setPaidSummary] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');
  const [loadedSupplierDocument, setLoadedSupplierDocument] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const selectedBudget = useMemo(() => {
    return budgets.find((budget) => budget.id === selectedBudgetId);
  }, [budgets, selectedBudgetId]);

  // Approved budgets that are still free, plus the one already linked to this service.
  const budgetOptions = useMemo(() => {
    return budgets
      .filter((budget) => budget.status === 'APROVADO' && (!budget.serviceId || budget.serviceId === serviceId))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [budgets, serviceId]);

  const isEditing = Boolean(serviceId);
  const isClosed = status === 'FINALIZADO' || status === 'CANCELADO';
  const showFiscalDocument = isEditing && status === 'FINALIZADO';

  function resetForm(nextBudgetId: number | null) {
    setServiceId(null);
    setTitle('');
    setDescription('');
    setCategory('');
    setPriority('MEDIA');
    setStatus('PLANEJADO');
    setExpectedValue('');
    setPaidSummary('');
    setSupplier('');
    setSupplierDocument('');
    setLoadedSupplierDocument('');
    setPlannedDate('');
    setNotes('');
    setDocumentName('Nota Fiscal');
    setDocumentUrl('');
    setDocumentFile(null);
    setExistingDocument(null);
    setSelectedBudgetId(nextBudgetId);
    setFieldErrors({});
  }

  function fillForm(service: ServiceOrder, documents: PortalDocument[]) {
    const document = documents.find((item) => item.type === 'NOTA_FISCAL' || item.type === 'RECIBO') ?? documents[0] ?? null;
    const maskedDocument = maskDocument(service.supplierDocument ?? '');
    setServiceId(service.id ?? null);
    setTitle(service.title ?? '');
    setDescription(service.description ?? '');
    setCategory(service.category ?? '');
    setPriority(service.priority ?? 'MEDIA');
    setStatus(service.status ?? 'PLANEJADO');
    setExpectedValue(currencyFromNumber(service.expectedValue));
    setPaidSummary(
      service.finalValue != null
        ? `Pago ${formatMoneyBR(service.finalValue)}${service.completedDate ? ` em ${isoToDateBR(service.completedDate)}` : ''}`
        : ''
    );
    setSupplier(service.supplier ?? '');
    setSupplierDocument(maskedDocument);
    setLoadedSupplierDocument(maskedDocument);
    setPlannedDate(isoToDateBR(service.plannedDate));
    setNotes(service.notes ?? '');
    setDocumentName(document?.name ?? 'Nota Fiscal');
    setDocumentUrl(document?.url ?? '');
    setDocumentFile(null);
    setExistingDocument(document);
    setSelectedBudgetId(service.approvedBudgetId ?? seedBudgetId ?? null);
    setFieldErrors({});
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

          // Opened from an approved budget ("Criar serviço com este orçamento"): start from its data.
          const seeded = nextBudgets.find((budget) => budget.id === seedBudgetId && budget.status === 'APROVADO' && !budget.serviceId);
          resetForm(seeded?.id ?? null);
          if (seeded) {
            const maskedDocument = maskDocument(seeded.supplierDocument ?? '');
            setTitle(seeded.title ?? '');
            setExpectedValue(currencyFromNumber(seeded.amount));
            setSupplier(seeded.supplier ?? '');
            setSupplierDocument(maskedDocument);
            setLoadedSupplierDocument(maskedDocument);
          }
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

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function chooseBudget(budget: Budget | null) {
    setSelectedBudgetId(budget?.id ?? null);
    if (!budget) {
      return;
    }
    if (!expectedValue.trim()) {
      setExpectedValue(currencyFromNumber(budget.amount));
    }
    if (!supplier.trim()) {
      setSupplier(budget.supplier ?? '');
    }
    if (!supplierDocument.trim()) {
      setSupplierDocument(maskDocument(budget.supplierDocument ?? ''));
    }
  }

  function validate() {
    const next: FieldErrors = {};
    if (!title.trim()) {
      next.title = 'Informe o título do serviço.';
    }
    if (!description.trim()) {
      next.description = 'Descreva o serviço para as casas entenderem o que será feito.';
    }
    if (plannedDate.trim() && !dateBRToISO(plannedDate)) {
      next.plannedDate = 'Data inválida. Use dia/mês/ano, por exemplo 25/12/2026.';
    }
    // A number already on file is not re-checked unless it was changed.
    if (supplierDocument.trim() && supplierDocument !== loadedSupplierDocument && !isValidDocument(supplierDocument)) {
      next.supplierDocument = 'CPF ou CNPJ inválido. Confira os números ou deixe em branco.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (saving || loading) {
      return;
    }
    if (!validate()) {
      setError('Corrija os campos destacados em vermelho.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
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
        // "Aprovado" follows the linked budget on the server; finished and cancelled never change from this form.
        status: isClosed ? status : status === 'EM_ANDAMENTO' ? 'EM_ANDAMENTO' : 'PLANEJADO',
        expectedValue: parseCurrency(expectedValue) ?? selectedBudget?.amount,
        supplier: supplier.trim() || selectedBudget?.supplier || undefined,
        supplierDocument: supplierDocument.trim() || selectedBudget?.supplierDocument || undefined,
        plannedDate: dateBRToISO(plannedDate),
        approvedBudgetId: selectedBudgetId,
        notes: notes.trim() || undefined
      };

      const savedService = serviceId
        ? await api.updateService(serviceId, payload)
        : await api.createService(payload);
      const savedServiceId = savedService.id ?? serviceId;

      if (showFiscalDocument && documentFile && savedServiceId) {
        await api.uploadDocument(documentFile, {
          name: documentName.trim() || documentFile.name,
          type: 'NOTA_FISCAL',
          relatedType: 'SERVICE',
          relatedId: savedServiceId,
          description: 'Documento fiscal vinculado ao cadastro do serviço.'
        });
      } else if (showFiscalDocument && documentUrl.trim() && savedServiceId && existingDocument?.url !== documentUrl.trim()) {
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
      scrollRef.current?.scrollTo({ y: 0, animated: true });
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
    api.openDocument(previewUrl).catch(() => Alert.alert('Documento fiscal', 'Não foi possível abrir o link informado.'));
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

  function cancel() {
    navigation.navigate(isEditing && serviceId ? 'ServiceDetails' : 'Servicos', isEditing && serviceId ? { id: serviceId } : undefined);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SoftBackdrop compact />
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={cancel} style={styles.backButton}>
            <ArrowLeft color={colors.ink} size={20} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{isEditing ? 'Editar serviço' : 'Novo serviço'}</Text>
            <Text style={styles.subtitle}>{isEditing ? `Serviço #${serviceId}` : 'Cadastro operacional'}</Text>
          </View>
        </View>
        {error ? (
          <Card style={styles.errorCard}>
            <Label>{error}</Label>
          </Card>
        ) : null}

        <FormSection icon={ClipboardList} title="Identificação">
          <FormField
            label="Título"
            required
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              clearFieldError('title');
            }}
            placeholder="Ex.: Troca das lâmpadas do corredor"
            error={fieldErrors.title}
          />
          <FormField
            label="Descrição"
            required
            value={description}
            onChangeText={(value) => {
              setDescription(value);
              clearFieldError('description');
            }}
            placeholder="O que será feito, onde e por quê."
            multiline
            error={fieldErrors.description}
          />
          <FormField label="Categoria" value={category} onChangeText={setCategory} placeholder="Escolha abaixo ou digite" />
          <View style={styles.suggestionRow}>
            {categorySuggestions.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="button"
                onPress={() => setCategory(name)}
                style={[styles.suggestionChip, category.trim().toLowerCase() === name.toLowerCase() ? styles.suggestionChipSelected : null]}
              >
                <Text style={[styles.suggestionText, category.trim().toLowerCase() === name.toLowerCase() ? styles.suggestionTextSelected : null]}>{name}</Text>
              </Pressable>
            ))}
          </View>
        </FormSection>

        <FormSection icon={Flag} title="Situação e prioridade">
          <Text style={styles.groupLabel}>Situação</Text>
          {isClosed ? (
            <View style={styles.closedBox}>
              <View style={styles.closedRow}>
                <Badge status={status} />
                <Text style={styles.closedTitle}>{statusLabels[status]}</Text>
              </View>
              {paidSummary ? <Text style={styles.closedText}>{paidSummary}</Text> : null}
              <Text style={styles.sectionHelp}>
                {status === 'FINALIZADO'
                  ? 'O pagamento (valor e data) só muda em "Corrigir dados / anexar nota", na tela do serviço.'
                  : 'Um serviço cancelado não muda de situação.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.statusGrid}>
                {openStatusOptions.map((item) => (
                  <StatusChoice
                    key={item.value}
                    label={item.label}
                    selected={(status === 'EM_ANDAMENTO' ? 'EM_ANDAMENTO' : 'PLANEJADO') === item.value}
                    onPress={() => setStatus(item.value)}
                  />
                ))}
              </View>
              <Text style={styles.sectionHelp}>
                Vira "Aprovado" sozinho quando você vincula um orçamento aprovado pelas casas. Para finalizar ou cancelar, use os botões na tela do serviço.
              </Text>
            </>
          )}
          <Text style={styles.groupLabel}>Prioridade</Text>
          <View style={styles.priorityGrid}>
            {priorityOptions.map((item) => (
              <PriorityChoice
                key={item}
                label={priorityLabels[item]}
                color={priorityColors[item]}
                selected={item === priority}
                onPress={() => setPriority(item)}
              />
            ))}
          </View>
        </FormSection>

        <FormSection icon={UserRound} title="Fornecedor e valor previsto">
          <FormField label="Fornecedor" value={supplier} onChangeText={setSupplier} placeholder="Nome do fornecedor ou prestador" />
          <FormField
            label="CPF ou CNPJ do fornecedor"
            value={supplierDocument}
            onChangeText={(value) => {
              setSupplierDocument(maskDocument(value));
              clearFieldError('supplierDocument');
            }}
            keyboardType="number-pad"
            maxLength={18}
            placeholder="Só os números"
            error={fieldErrors.supplierDocument}
          />
          <FormField
            label="Valor previsto"
            value={expectedValue}
            onChangeText={(value) => setExpectedValue(maskCurrency(value))}
            onBlur={() => setExpectedValue((value) => finishCurrency(value))}
            keyboardType="decimal-pad"
            placeholder="R$ 0,00"
            hint="O valor pago é informado ao finalizar o serviço."
          />
        </FormSection>

        <FormSection icon={CalendarDays} title="Data e observações">
          <FormField
            label="Data planejada"
            value={plannedDate}
            onChangeText={(value) => {
              setPlannedDate(maskDateBR(value));
              clearFieldError('plannedDate');
            }}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="dd/mm/aaaa"
            error={fieldErrors.plannedDate}
          />
          <FormField label="Observações" value={notes} onChangeText={setNotes} placeholder="Informações adicionais, instruções..." multiline compactMultiline />
        </FormSection>

        <FormSection icon={Link2} title="Orçamento vinculado">
          <Text style={styles.sectionHelp}>Aparecem aqui os orçamentos aprovados pela votação das casas que ainda não estão em outro serviço.</Text>
          <BudgetChoice
            selected={selectedBudgetId === null}
            title="Sem orçamento vinculado"
            subtitle="Serviço sem cotação base"
            onPress={() => chooseBudget(null)}
          />
          {budgetOptions.length === 0 ? <Text style={styles.sectionHelp}>Nenhum orçamento aprovado disponível.</Text> : null}
          {budgetOptions.map((budget) => {
            const selected = budget.id === selectedBudgetId;
            return (
              <BudgetChoice
                key={budget.id}
                selected={selected}
                title={budget.title}
                subtitle={`${budget.supplier} · ${budget.serviceId ? 'vinculado a este serviço' : 'disponível'}`}
                onPress={() => chooseBudget(budget)}
                right={
                  <View style={styles.budgetRight}>
                    <Badge status={budget.status} />
                    <Money value={budget.amount} />
                  </View>
                }
              />
            );
          })}
        </FormSection>

        {showFiscalDocument ? (
          <FormSection icon={FileText} title="Documento fiscal">
            <FormField label="Nome do documento" value={documentName} onChangeText={setDocumentName} placeholder="Nota Fiscal" />
            <FormField label="Link do PDF da nota fiscal/recibo" value={documentUrl} onChangeText={setDocumentUrl} placeholder="https://.../nota-fiscal.pdf" />
            {documentFile ? <Text style={styles.sectionHelp}>Arquivo selecionado: {documentFile.name}</Text> : null}
            {existingDocument && !documentFile ? <Text style={styles.sectionHelp}>Documento atual: {existingDocument.name}</Text> : null}
            <View style={styles.documentActions}>
              <DocumentActionButton title="Selecionar PDF" icon={Upload} onPress={selectPdf} />
              <DocumentActionButton title="Visualizar PDF" icon={ExternalLink} onPress={previewDocument} />
              <DocumentActionButton title="Limpar documento" icon={Trash2} danger onPress={() => { setDocumentUrl(''); setDocumentFile(null); setExistingDocument(null); }} />
            </View>
          </FormSection>
        ) : null}

        <View style={styles.footerActions}>
          <FooterActionButton title="Cancelar" icon={X} onPress={cancel} />
          <FooterActionButton title={saving ? 'Salvando...' : isEditing ? 'Atualizar serviço' : 'Salvar serviço'} icon={Save} onPress={save} primary disabled={saving || loading} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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

function StatusChoice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.statusChoice, selected ? styles.statusChoiceSelected : null]}>
      <Text style={[styles.statusChoiceText, selected ? styles.statusChoiceTextSelected : null]}>{label}</Text>
      {selected ? <Check color={colors.surface} size={14} strokeWidth={3} /> : null}
    </Pressable>
  );
}

function PriorityChoice({ label, color, selected, onPress }: { label: string; color: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.priorityChoice, selected ? styles.priorityChoiceSelected : null]}>
      <View style={[styles.priorityDot, { backgroundColor: color }]} />
      <Text style={styles.priorityChoiceText}>{label}</Text>
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
      <View style={styles.budgetCopy}>
        <Text style={styles.budgetTitle}>{title}</Text>
        <Text style={styles.budgetSubtitle}>{subtitle}</Text>
      </View>
      {right ?? (selected ? <Text style={styles.selectedText}>SELECIONADO</Text> : null)}
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
    width: 44,
    height: 44,
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
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  groupLabel: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginTop: 2
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6
  },
  suggestionChip: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center'
  },
  suggestionChipSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  suggestionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
  },
  suggestionTextSelected: {
    color: colors.blue
  },
  closedBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: spacing.md,
    gap: 6
  },
  closedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  closedTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900'
  },
  closedText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700'
  },
  statusGrid: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  statusChoice: {
    minHeight: 44,
    flex: 1,
    minWidth: 0,
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
    color: colors.blue,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  statusChoiceTextSelected: {
    color: colors.surface
  },
  priorityGrid: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  priorityChoice: {
    minHeight: 44,
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  priorityChoiceSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  priorityDot: {
    width: 7,
    height: 7,
    borderRadius: 999
  },
  priorityChoiceText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700'
  },
  budgetChoice: {
    minHeight: 58,
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
  budgetCopy: {
    flex: 1,
    gap: 3
  },
  budgetTitle: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900'
  },
  budgetSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
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
  documentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  documentActionButton: {
    flex: 1,
    minWidth: 132,
    minHeight: 44,
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
    minHeight: 46,
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
    fontSize: 13,
    fontWeight: '900'
  },
  footerButtonTextPrimary: {
    color: colors.surface
  }
});
