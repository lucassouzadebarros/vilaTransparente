import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CheckCircle2, Eye, FileText, Plus, ReceiptText, RefreshCw, Trash2, Upload, WalletCards } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { EmptyFilter, FilterBar, FilterOption } from '../components/FilterBar';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors } from '../theme';
import { Expense, PortalDocument } from '../types';
import { Camera as CameraIcon } from 'lucide-react-native';
import { PickedFile, choosePhoto, nameWithoutExtension, pickPdf, pickerErrorMessage, previewPickedFile } from '../utils/filePicker';

type DocumentType = 'RECIBO' | 'NOTA_FISCAL';

/** One list for every screen, so the monthly statement can add up by category. */
const EXPENSE_CATEGORIES = ['Energia', 'Água', 'Limpeza', 'Manutenção', 'Segurança', 'Jardinagem', 'Taxas', 'Outros'];

/** Routine bills that never need a vote (the same list the server uses). */
const ROUTINE_CATEGORIES = ['Energia', 'Água', 'Taxas'];
const MIN_REASON_LETTERS = 20;

type ExpenseFilter = 'TODAS' | 'SEM_COMPROVANTE' | 'SEM_VOTACAO';

/** Money that did not go through a voted budget: not tied to one and not a routine bill (energy, water, fees). */
function isUnvoted(expense: Expense) {
  const category = (expense.category ?? '').toLowerCase();
  return !expense.budgetId && !ROUTINE_CATEGORIES.some((name) => name.toLowerCase() === category);
}

const documentTypeLabels: Record<DocumentType, string> = {
  RECIBO: 'Recibo',
  NOTA_FISCAL: 'Nota fiscal'
};

export function ExpensesScreen() {
  const { isAdmin } = useAuth();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  // The form stays folded so the list of expenses is the first thing anyone sees.
  const [formOpen, setFormOpen] = useState(false);
  const [items, setItems] = useState<Expense[]>([]);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [category, setCategory] = useState('Outros');
  const [documentType, setDocumentType] = useState<DocumentType>('RECIBO');
  const [documentName, setDocumentName] = useState('Recibo');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentFile, setDocumentFile] = useState<PickedFile | null>(null);
  const [saving, setSaving] = useState(false);
  // Largest expense that can be typed in without a voted budget (null: the rule is off).
  const [limit, setLimit] = useState<number | null>(null);
  const [exceptionReason, setExceptionReason] = useState('');
  const [filter, setFilter] = useState<ExpenseFilter>('TODAS');

  const documentsById = useMemo(() => {
    return documents.reduce<Record<number, PortalDocument>>((acc, item) => {
      if (item.id) {
        acc[item.id] = item;
      }
      return acc;
    }, {});
  }, [documents]);

  const filterOptions = useMemo<Array<FilterOption<ExpenseFilter>>>(
    () => [
      { key: 'TODAS', label: 'Todas', count: items.length },
      { key: 'SEM_COMPROVANTE', label: 'Sem comprovante', count: items.filter((item) => !item.documentId).length },
      { key: 'SEM_VOTACAO', label: 'Sem votação', count: items.filter(isUnvoted).length }
    ],
    [items]
  );
  const visibleItems = useMemo(
    () =>
      filter === 'SEM_COMPROVANTE' ? items.filter((item) => !item.documentId) : filter === 'SEM_VOTACAO' ? items.filter(isUnvoted) : items,
    [items, filter]
  );

  const load = useCallback(async () => {
    const [expenseList, documentList, settings] = await Promise.all([api.expenses(), api.documents(), api.settings().catch(() => null)]);
    setItems(sortNewestFirst(expenseList));
    setDocuments(documentList);
    setLimit((settings as { budgetRequiredAbove?: number | null } | null)?.budgetRequiredAbove ?? null);
  }, []);

  const openFormRequested = Boolean(route.params?.openForm);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
      if (openFormRequested) {
        setFormOpen(true);
        navigation.setParams({ openForm: undefined });
      }
    }, [load, openFormRequested, navigation])
  );

  async function create() {
    const amountValue = parseCurrencyInput(amount);
    if (!description.trim()) {
      Alert.alert('Despesa', 'Informe a descrição da despesa.');
      return;
    }
    if (amountValue <= 0) {
      Alert.alert('Despesa', 'Informe um valor válido.');
      return;
    }
    if (needsReason(amountValue) && countLetters(exceptionReason) < MIN_REASON_LETTERS) {
      Alert.alert(
        'Despesa sem votação',
        `Acima de ${formatCurrency(limit ?? 0)} a despesa precisa ter um orçamento votado pelas casas. Se foi uma emergência, escreva a justificativa (pelo menos ${MIN_REASON_LETTERS} letras): ela aparece para todos.`
      );
      return;
    }
    if (!documentFile && !documentUrl.trim()) {
      Alert.alert(
        'Despesa sem comprovante',
        'Esta despesa será lançada sem recibo ou nota fiscal e vai aparecer como "sem comprovante" para as casas. Lançar assim mesmo?',
        [
          { text: 'Voltar', style: 'cancel' },
          { text: 'Lançar sem comprovante', onPress: () => save(amountValue) }
        ]
      );
      return;
    }
    await save(amountValue);
  }

  function needsReason(amountValue: number) {
    return limit != null && amountValue > limit && !ROUTINE_CATEGORIES.includes(category);
  }

  async function save(amountValue: number) {
    setSaving(true);
    try {
      let saved = await api.createExpense({
        description: description.trim(),
        amount: amountValue,
        expenseDate: new Date().toISOString().slice(0, 10),
        category,
        supplier: supplier.trim() || undefined,
        paymentMethod: 'PIX',
        exceptionReason: needsReason(amountValue) ? exceptionReason.trim() : undefined
      });

      if (saved.id && (documentFile || documentUrl.trim())) {
        const portalDocument = documentFile
          ? await api.uploadDocument(documentFile, {
              name: documentName.trim() || documentFile.name,
              type: documentType,
              relatedType: 'EXPENSE',
              relatedId: saved.id,
              description: `Documento da despesa: ${description.trim()}`
            })
          : await api.createDocument({
              name: documentName.trim() || documentTypeLabels[documentType],
              type: documentType,
              url: documentUrl.trim(),
              relatedType: 'EXPENSE',
              relatedId: saved.id,
              description: `Documento da despesa: ${description.trim()}`
            });

        if (portalDocument.id) {
          saved = await api.updateExpense(saved.id, { ...saved, documentId: portalDocument.id });
        }
      }

      resetForm();
      setFormOpen(false);
      await load();
      Alert.alert('Despesa', 'Despesa cadastrada.');
    } catch (error) {
      Alert.alert('Despesa', apiErrorMessage(error, 'Não consegui cadastrar a despesa.'));
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setDescription('');
    setAmount('');
    setSupplier('');
    setCategory('Outros');
    setExceptionReason('');
    setDocumentType('RECIBO');
    setDocumentName('Recibo');
    setDocumentUrl('');
    setDocumentFile(null);
  }

  function changeDocumentType(nextType: DocumentType) {
    setDocumentType(nextType);
    if (!documentName.trim() || documentName === 'Recibo' || documentName === 'Nota fiscal') {
      setDocumentName(documentTypeLabels[nextType]);
    }
  }

  function previewDraftDocument() {
    if (documentFile) {
      previewPickedFile(documentFile).catch(() => Alert.alert('Documento', 'Não consegui abrir o arquivo escolhido.'));
      return;
    }
    const previewUrl = documentUrl.trim();
    if (!previewUrl) {
      Alert.alert('Documento', 'Selecione um PDF ou informe o link do documento.');
      return;
    }
    api.openDocument(previewUrl).catch(() => Alert.alert('Documento', 'Não foi possível abrir o documento.'));
  }

  async function attachFile(pick: () => Promise<PickedFile | null>) {
    try {
      const file = await pick();
      if (!file) {
        return;
      }
      setDocumentFile(file);
      setDocumentUrl('');
      if (!documentName.trim() || documentName === 'Recibo' || documentName === 'Nota fiscal') {
        setDocumentName(nameWithoutExtension(file.name));
      }
    } catch (err) {
      Alert.alert('Documento', pickerErrorMessage(err));
    }
  }

  function clearDocument() {
    setDocumentFile(null);
    setDocumentUrl('');
    setDocumentName(documentTypeLabels[documentType]);
  }

  function openDocument(portalDocument?: PortalDocument) {
    if (!portalDocument?.url) {
      Alert.alert('Documento', 'Essa despesa não possui documento vinculado.');
      return;
    }
    api.openDocument(portalDocument.url).catch(() => Alert.alert('Documento', 'Não foi possível abrir o documento.'));
  }

  return (
    <ScrollView role="main" style={styles.screen} contentContainerStyle={styles.content}>
      <SoftBackdrop compact />
      <View style={styles.header}>
        <View>
          <Text role="heading" style={styles.title}>Despesas</Text>
          <Text style={styles.subtitle}>Saídas da caixinha</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Atualizar despesas" onPress={load} style={styles.refreshButton}>
          <RefreshCw color={colors.blue} size={22} strokeWidth={2.4} />
        </Pressable>
      </View>

      {isAdmin && !formOpen ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setFormOpen(true)}
          style={({ pressed }) => [styles.primaryButton, { opacity: pressed ? 0.84 : 1 }]}
        >
          <Plus color={colors.surface} size={18} strokeWidth={2.6} />
          <Text style={styles.primaryButtonText}>Nova despesa</Text>
        </Pressable>
      ) : null}

      {isAdmin && formOpen ? (
        <View style={styles.formCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <ReceiptText color={colors.blue} size={20} strokeWidth={2.5} />
            </View>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Nova despesa</Text>
              <Text style={styles.sectionHelp}>Inclua peça extra, recibo ou nota fiscal.</Text>
            </View>
          </View>

          <FormField
            label="Descrição"
            value={description}
            onChangeText={setDescription}
            placeholder="Ex.: Peça extra para manutenção"
          />
          <View style={styles.twoColumns}>
            <FormField
              label="Valor"
              value={amount}
              onChangeText={(value) => setAmount(formatCurrencyInput(value))}
              keyboardType="numeric"
              placeholder="R$ 0,00"
              style={styles.columnField}
            />
            <FormField
              label="Fornecedor"
              value={supplier}
              onChangeText={setSupplier}
              placeholder="Opcional"
              style={styles.columnField}
            />
          </View>

          <View style={styles.categoryBox}>
            <Text style={styles.categoryTitle}>Categoria</Text>
            <View style={styles.categoryRow}>
              {EXPENSE_CATEGORIES.map((name) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => setCategory(name)}
                  style={[styles.categoryChip, category === name ? styles.categoryChipSelected : null]}
                >
                  <Text style={[styles.categoryChipText, category === name ? styles.categoryChipTextSelected : null]}>{name}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {needsReason(parseCurrencyInput(amount)) ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonTitle}>Despesa sem orçamento votado</Text>
              <Text style={styles.reasonText}>
                {`Acima de ${formatCurrency(limit ?? 0)} o normal é gerar um orçamento a partir do problema e levar à votação. Se esta compra não pôde esperar, explique o motivo: o texto aparece para todos e a despesa é marcada como "sem votação" no relatório.`}
              </Text>
              <FormField
                label="Justificativa (aparece para todos)"
                value={exceptionReason}
                onChangeText={setExceptionReason}
                placeholder="Ex.: Cano estourado no sábado, o encanador precisou comprar a peça na hora."
                multiline
                hint={`${countLetters(exceptionReason)} de ${MIN_REASON_LETTERS} letras no mínimo`}
              />
            </View>
          ) : null}

          <View style={styles.documentBox}>
            <View style={styles.documentHeader}>
              <FileText color={colors.blue} size={18} strokeWidth={2.4} />
              <Text style={styles.documentTitle}>Documento da despesa</Text>
            </View>
            <View style={styles.choiceRow}>
              <ChoiceButton label="Recibo" selected={documentType === 'RECIBO'} onPress={() => changeDocumentType('RECIBO')} />
              <ChoiceButton label="Nota fiscal" selected={documentType === 'NOTA_FISCAL'} onPress={() => changeDocumentType('NOTA_FISCAL')} />
            </View>
            <FormField label="Nome do documento" value={documentName} onChangeText={setDocumentName} placeholder="Recibo" />
            <FormField label="Link do PDF" value={documentUrl} onChangeText={setDocumentUrl} placeholder="https://.../recibo.pdf" />
            {documentFile ? <Text style={styles.fileSelected}>Arquivo selecionado: {documentFile.name}</Text> : null}
            <View style={styles.documentActions}>
              <DocumentActionButton title="Selecionar PDF" icon={Upload} onPress={() => attachFile(pickPdf)} />
              <DocumentActionButton title="Enviar foto" icon={CameraIcon} onPress={() => attachFile(choosePhoto)} />
              <DocumentActionButton title="Visualizar PDF" icon={Eye} onPress={previewDraftDocument} />
              <DocumentActionButton title="Limpar documento" icon={Trash2} danger onPress={clearDocument} />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={saving || !description.trim() || parseCurrencyInput(amount) <= 0}
            onPress={create}
            style={({ pressed }) => [
              styles.primaryButton,
              { opacity: saving || !description.trim() || parseCurrencyInput(amount) <= 0 ? 0.5 : pressed ? 0.84 : 1 }
            ]}
          >
            <Plus color={colors.surface} size={18} strokeWidth={2.6} />
            <Text style={styles.primaryButtonText}>{saving ? 'Salvando...' : 'Cadastrar despesa'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setFormOpen(false)} style={styles.closeFormButton}>
            <Text style={styles.closeFormText}>Fechar sem salvar</Text>
          </Pressable>
        </View>
      ) : null}

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <ReceiptText color={colors.muted} size={22} />
          <Text style={styles.emptyText}>Nenhuma despesa cadastrada.</Text>
        </View>
      ) : null}

      {items.length > 0 ? <FilterBar label="Filtro das despesas" options={filterOptions} value={filter} onChange={setFilter} /> : null}
      {items.length > 0 && visibleItems.length === 0 ? (
        <EmptyFilter message="Nenhuma despesa neste filtro." onClear={() => setFilter('TODAS')} />
      ) : null}

      {visibleItems.map((item) => {
        const portalDocument = item.documentId ? documentsById[item.documentId] : undefined;
        return (
          <View key={item.id} style={styles.expenseCard}>
            <View style={styles.expenseTop}>
              <View style={styles.expenseIcon}>
                <WalletCards color={colors.red} size={22} strokeWidth={2.4} />
              </View>
              <View style={styles.expenseCopy}>
                <Text style={styles.expenseTitle}>{item.description}</Text>
                <Text style={styles.expenseMeta}>{!item.category || item.category === 'Manual' ? 'Outros' : item.category} - {formatDate(item.expenseDate)}</Text>
                {item.supplier ? <Text style={styles.expenseMeta}>{item.supplier}</Text> : null}
              </View>
              <Text style={styles.expenseValue}>{formatCurrency(item.amount)}</Text>
            </View>

            {item.exceptionReason ? (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonTitle}>Sem votação das casas</Text>
                <Text style={styles.reasonText}>{item.exceptionReason}</Text>
              </View>
            ) : null}

            {portalDocument ? (
              <Pressable accessibilityRole="button" onPress={() => openDocument(portalDocument)} style={styles.documentLinkButton}>
                <Eye color={colors.blue} size={16} strokeWidth={2.4} />
                <Text style={styles.documentLinkText}>Visualizar {portalDocument.type === 'NOTA_FISCAL' ? 'nota fiscal' : 'recibo'}</Text>
              </Pressable>
            ) : (
              <View style={styles.noDocumentRow}>
                <FileText color={colors.muted} size={15} />
                <Text style={styles.noDocumentText}>Sem comprovante anexado</Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  hint,
  multiline,
  style
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  hint?: string;
  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputFrame}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          multiline={multiline}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
          placeholderTextColor={colors.muted}
        />
      </View>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

function ChoiceButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.choiceButton, selected ? styles.choiceButtonSelected : null, { opacity: pressed ? 0.82 : 1 }]}
    >
      {selected ? <CheckCircle2 color={colors.blue} size={14} strokeWidth={2.6} /> : null}
      <Text style={[styles.choiceText, selected ? styles.choiceTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function DocumentActionButton({ title, icon: Icon, onPress, danger }: { title: string; icon: LucideIcon; onPress: () => void; danger?: boolean }) {
  const color = danger ? colors.red : colors.blue;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.documentActionButton, danger ? styles.documentActionButtonDanger : null, { opacity: pressed ? 0.82 : 1 }]}
    >
      <Icon color={color} size={15} strokeWidth={2.4} />
      <Text style={[styles.documentActionText, danger ? styles.documentActionTextDanger : null]}>{title}</Text>
    </Pressable>
  );
}

function countLetters(value: string) {
  return (value.match(/\p{L}/gu) ?? []).length;
}

function formatCurrencyInput(value: string) {
  const onlyNumbers = value.replace(/\D/g, '');
  if (!onlyNumbers) {
    return '';
  }
  const cents = Number(onlyNumbers) / 100;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents);
}

function parseCurrencyInput(value: string) {
  const onlyNumbers = value.replace(/\D/g, '');
  if (!onlyNumbers) {
    return 0;
  }
  return Number(onlyNumbers) / 100;
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
}

// The API returns expenses in insertion order; show the most recent first (same order as the Caixa).
function sortNewestFirst(list: Expense[]) {
  return [...list].sort(
    (a, b) => String(b.expenseDate).localeCompare(String(a.expenseDate)) || Number(b.id ?? 0) - Number(a.id ?? 0)
  );
}

function formatDate(value?: string) {
  if (!value) {
    return '';
  }
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 104,
    gap: 12,
    position: 'relative'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 1
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2
  },
  refreshButton: {
    width: 42,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16202A',
    shadowOpacity: 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 0
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
    shadowColor: '#16202A',
    shadowOpacity: 0,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0,
    zIndex: 1
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700'
  },
  sectionHelp: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1
  },
  field: {
    gap: 5
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  inputFrame: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#C5CDC9',
    borderRadius: 7,
    backgroundColor: colors.surface,
    justifyContent: 'center'
  },
  input: {
    minHeight: 40,
    paddingHorizontal: 10,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500'
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 10
  },
  fieldHint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600'
  },
  reasonBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    padding: 12,
    gap: 6
  },
  reasonTitle: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  reasonText: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  twoColumns: {
    flexDirection: 'row',
    gap: 8
  },
  columnField: {
    flex: 1,
    minWidth: 0
  },
  documentBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: '#F8F9F8',
    padding: 10,
    gap: 9
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  documentTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8
  },
  choiceButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10
  },
  choiceButtonSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  choiceText: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  choiceTextSelected: {
    color: colors.blue
  },
  fileSelected: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  documentActions: {
    gap: 7
  },
  documentActionButton: {
    minHeight: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  documentActionButtonDanger: {
    borderColor: colors.red
  },
  documentActionText: {
    color: colors.blue,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  documentActionTextDanger: {
    color: colors.red
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 7,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: colors.blue,
    shadowOpacity: 0,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700'
  },
  emptyCard: {
    minHeight: 68,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 1
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  expenseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 10,
    shadowColor: '#16202A',
    shadowOpacity: 0,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 0,
    zIndex: 1
  },
  expenseTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  expenseIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  expenseCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  expenseTitle: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700'
  },
  expenseMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  expenseValue: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700'
  },
  documentLinkButton: {
    minHeight: 44,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  documentLinkText: {
    color: colors.blue,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  noDocumentRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  noDocumentText: {
    color: colors.amber,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  closeFormButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeFormText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  categoryBox: {
    gap: 8
  },
  categoryTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700'
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  categoryChip: {
    minHeight: 44,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  categoryChipSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  categoryChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600'
  },
  categoryChipTextSelected: {
    color: colors.blue,
    fontWeight: '700'
  }
});
