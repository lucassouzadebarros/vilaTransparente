import { ReactNode, useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ClipboardList, ExternalLink, FileText, Flag, Link2, Save, Trash2, Upload, UserRound, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Badge, Card, Label, Money } from '../components/ui';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ServiceOrder } from '../types';

const priorityOptions: Array<ServiceOrder['priority']> = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];
const statusOptions: Array<ServiceOrder['status']> = ['PLANEJADO', 'APROVADO', 'EM_ANDAMENTO', 'FINALIZADO', 'CANCELADO'];

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

  function cancel() {
    navigation.navigate(isEditing && serviceId ? 'ServiceDetails' : 'Servicos', isEditing && serviceId ? { id: serviceId } : undefined);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ServiceFormBackdrop />
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
        <FormField label="Título" value={title} onChangeText={setTitle} placeholder="Digite o título do serviço" />
        <FormField
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          placeholder="Descreva o serviço, objetivo, detalhes importantes..."
          multiline
        />
        <FormField
          label="Categoria"
          value={category}
          onChangeText={setCategory}
          placeholder="Portaria, limpeza, iluminação..."
          right={<ChevronDown color={colors.muted} size={17} />}
        />
      </FormSection>

      <FormSection icon={Flag} title="Status e prioridade">
        <Text style={styles.groupLabel}>Status</Text>
        <View style={styles.statusGrid}>
          {statusOptions.map((item) => (
            <StatusChoice key={item} label={statusLabels[item]} selected={item === status} onPress={() => setStatus(item)} />
          ))}
        </View>
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

      <FormSection icon={UserRound} title="Fornecedor e valores">
        <FormField label="Fornecedor" value={supplier} onChangeText={setSupplier} placeholder="Nome do fornecedor" />
        <FormField label="CNPJ do fornecedor" value={supplierDocument} onChangeText={setSupplierDocument} placeholder="12.345.678/0001-90" />
        <View style={styles.twoColumns}>
          <FormField label="Valor previsto" value={expectedValue} onChangeText={setExpectedValue} keyboardType="numeric" placeholder="R$ 0,00" style={styles.columnField} />
          <FormField label="Valor final" value={finalValue} onChangeText={setFinalValue} keyboardType="numeric" placeholder="R$ 0,00" style={styles.columnField} />
        </View>
      </FormSection>

      <FormSection icon={CalendarDays} title="Datas">
        <FormField label="Data planejada" value={plannedDate} onChangeText={setPlannedDate} placeholder="AAAA-MM-DD" right={<CalendarDays color={colors.muted} size={16} />} />
        <FormField label="Data de conclusão" value={completedDate} onChangeText={setCompletedDate} placeholder="AAAA-MM-DD" right={<CalendarDays color={colors.muted} size={16} />} />
        <FormField label="Observações" value={notes} onChangeText={setNotes} placeholder="Informações adicionais, observações, instruções..." multiline compactMultiline />
      </FormSection>

      <FormSection icon={Link2} title="Orçamento vinculado">
        <Text style={styles.sectionHelp}>Somente orçamentos aprovados podem ser vinculados a um serviço.</Text>
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
              subtitle={`${budget.supplier} · ${budget.serviceId ? `Serviço #${budget.serviceId}` : 'sem serviço'}`}
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

      <View style={styles.footerActions}>
        <FooterActionButton title="Cancelar" icon={X} onPress={cancel} />
        <FooterActionButton title={saving ? 'Salvando...' : isEditing ? 'Atualizar serviço' : 'Salvar serviço'} icon={Save} onPress={save} primary disabled={!canSave} />
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

function ServiceFormBackdrop() {
  return (
    <View pointerEvents="none" style={styles.formBackdrop}>
      <View style={styles.backdropGlow} />
      <View style={[styles.backdropCloud, styles.backdropCloudLeft]} />
      <View style={[styles.backdropCloud, styles.backdropCloudRight]} />

      <View style={styles.backdropLeafGroupLeft}>
        <View style={[styles.backdropLeaf, styles.backdropLeafOne]} />
        <View style={[styles.backdropLeaf, styles.backdropLeafTwo]} />
        <View style={[styles.backdropLeaf, styles.backdropLeafThree]} />
      </View>
      <View style={styles.backdropLeafGroupRight}>
        <View style={[styles.backdropLeaf, styles.backdropLeafOne]} />
        <View style={[styles.backdropLeaf, styles.backdropLeafTwo]} />
        <View style={[styles.backdropLeaf, styles.backdropLeafThree]} />
      </View>

      <View style={styles.backdropVillage}>
        <View style={[styles.backdropHouse, styles.backdropHouseMuted, { height: 42, width: 43 }]} />
        <View style={[styles.backdropHouse, { height: 60, width: 54 }]} />
        <View style={[styles.backdropHouse, styles.backdropHouseSoft, { height: 48, width: 48 }]} />
        <View style={[styles.backdropHouse, { height: 68, width: 60 }]} />
        <View style={[styles.backdropHouse, styles.backdropHouseSoft, { height: 52, width: 50 }]} />
        <View style={[styles.backdropHouse, { height: 58, width: 54 }]} />
        <View style={[styles.backdropHouse, styles.backdropHouseMuted, { height: 40, width: 44 }]} />
      </View>
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
  compactMultiline,
  right,
  style
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  multiline?: boolean;
  compactMultiline?: boolean;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputFrame, multiline ? styles.inputFrameMultiline : null, compactMultiline ? styles.inputFrameCompactMultiline : null]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          multiline={multiline}
          style={[styles.input, multiline ? styles.inputMultiline : null, compactMultiline ? styles.inputCompactMultiline : null]}
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
  formBackdrop: {
    position: 'absolute',
    top: 0,
    left: -32,
    right: -32,
    height: 260,
    alignItems: 'center',
    overflow: 'hidden'
  },
  backdropGlow: {
    position: 'absolute',
    top: 4,
    width: 520,
    height: 230,
    borderRadius: 230,
    backgroundColor: '#EDF7FC',
    opacity: 0.74
  },
  backdropCloud: {
    position: 'absolute',
    width: 56,
    height: 15,
    borderRadius: 999,
    backgroundColor: '#E3EDF7',
    opacity: 0.38
  },
  backdropCloudLeft: {
    top: 78,
    left: 48
  },
  backdropCloudRight: {
    top: 82,
    right: 46
  },
  backdropLeafGroupLeft: {
    position: 'absolute',
    top: 86,
    left: '50%',
    width: 82,
    height: 42,
    marginLeft: -168,
    opacity: 0.38,
    transform: [{ rotate: '-6deg' }]
  },
  backdropLeafGroupRight: {
    position: 'absolute',
    top: 88,
    left: '50%',
    width: 82,
    height: 42,
    marginLeft: 84,
    opacity: 0.34,
    transform: [{ scaleX: -1 }, { rotate: '-6deg' }]
  },
  backdropLeaf: {
    position: 'absolute',
    width: 32,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#C8E0E4'
  },
  backdropLeafOne: {
    top: 2,
    left: 4,
    transform: [{ rotate: '28deg' }]
  },
  backdropLeafTwo: {
    top: 17,
    left: 26,
    transform: [{ rotate: '-18deg' }]
  },
  backdropLeafThree: {
    top: 28,
    left: 8,
    transform: [{ rotate: '18deg' }]
  },
  backdropVillage: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 0,
    height: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    opacity: 0.14
  },
  backdropHouse: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#DCE9F4'
  },
  backdropHouseSoft: {
    backgroundColor: '#E6F0F8'
  },
  backdropHouseMuted: {
    backgroundColor: '#D4E3F0'
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
  groupLabel: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    marginTop: 2
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
    minHeight: 70,
    alignItems: 'flex-start'
  },
  inputFrameCompactMultiline: {
    minHeight: 58
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
    minHeight: 68,
    paddingTop: 11,
    textAlignVertical: 'top'
  },
  inputCompactMultiline: {
    minHeight: 56
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
  columnField: {
    flex: 1,
    minWidth: 0
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  statusChoice: {
    minHeight: 38,
    width: '31%',
    minWidth: 96,
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
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center'
  },
  statusChoiceTextSelected: {
    color: colors.surface
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  priorityChoice: {
    minHeight: 38,
    width: '22.5%',
    minWidth: 70,
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
    fontSize: 11,
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
    fontSize: 11,
    lineHeight: 15,
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
    minHeight: 40,
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
    fontSize: 11,
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
