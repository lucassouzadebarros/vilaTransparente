import { useCallback, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CheckCircle2, Eye, FileText, Plus, ReceiptText, RefreshCw, Trash2, Upload, WalletCards } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors } from '../theme';
import { Expense, PortalDocument } from '../types';

type DocumentType = 'RECIBO' | 'NOTA_FISCAL';

const documentTypeLabels: Record<DocumentType, string> = {
  RECIBO: 'Recibo',
  NOTA_FISCAL: 'Nota fiscal'
};

export function ExpensesScreen() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Expense[]>([]);
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [supplier, setSupplier] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('RECIBO');
  const [documentName, setDocumentName] = useState('Recibo');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const documentsById = useMemo(() => {
    return documents.reduce<Record<number, PortalDocument>>((acc, item) => {
      if (item.id) {
        acc[item.id] = item;
      }
      return acc;
    }, {});
  }, [documents]);

  const load = useCallback(async () => {
    const [expenseList, documentList] = await Promise.all([api.expenses(), api.documents()]);
    setItems(sortNewestFirst(expenseList));
    setDocuments(documentList);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load])
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

    setSaving(true);
    try {
      let saved = await api.createExpense({
        description: description.trim(),
        amount: amountValue,
        expenseDate: new Date().toISOString().slice(0, 10),
        category: 'Manual',
        supplier: supplier.trim() || undefined,
        paymentMethod: 'PIX'
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

  function selectPdf() {
    if (typeof document === 'undefined') {
      Alert.alert('Documento', 'Seleção de arquivo disponível no app web.');
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
      if (!documentName.trim() || documentName === 'Recibo' || documentName === 'Nota fiscal') {
        setDocumentName(file.name.replace(/\.pdf$/i, ''));
      }
    };
    input.click();
  }

  function previewDraftDocument() {
    const previewUrl = documentFile ? URL.createObjectURL(documentFile) : documentUrl.trim();
    if (!previewUrl) {
      Alert.alert('Documento', 'Selecione um PDF ou informe o link do documento.');
      return;
    }
    Linking.openURL(api.documentUrl(previewUrl)).catch(() => Alert.alert('Documento', 'Não foi possível abrir o documento.'));
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
    Linking.openURL(api.documentUrl(portalDocument.url)).catch(() => Alert.alert('Documento', 'Não foi possível abrir o documento.'));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SoftBackdrop compact />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Despesas</Text>
          <Text style={styles.subtitle}>Saídas da caixinha</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Atualizar despesas" onPress={load} style={styles.refreshButton}>
          <RefreshCw color={colors.blue} size={22} strokeWidth={2.4} />
        </Pressable>
      </View>

      {isAdmin ? (
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
              <DocumentActionButton title="Selecionar PDF" icon={Upload} onPress={selectPdf} />
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
        </View>
      ) : null}

      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <ReceiptText color={colors.muted} size={22} />
          <Text style={styles.emptyText}>Nenhuma despesa cadastrada.</Text>
        </View>
      ) : null}

      {items.map((item) => {
        const portalDocument = item.documentId ? documentsById[item.documentId] : undefined;
        return (
          <View key={item.id} style={styles.expenseCard}>
            <View style={styles.expenseTop}>
              <View style={styles.expenseIcon}>
                <WalletCards color={colors.red} size={22} strokeWidth={2.4} />
              </View>
              <View style={styles.expenseCopy}>
                <Text style={styles.expenseTitle}>{item.description}</Text>
                <Text style={styles.expenseMeta}>{item.category ?? 'Geral'} - {formatDate(item.expenseDate)}</Text>
                {item.supplier ? <Text style={styles.expenseMeta}>{item.supplier}</Text> : null}
              </View>
              <Text style={styles.expenseValue}>{formatCurrency(item.amount)}</Text>
            </View>

            {portalDocument ? (
              <Pressable accessibilityRole="button" onPress={() => openDocument(portalDocument)} style={styles.documentLinkButton}>
                <Eye color={colors.blue} size={16} strokeWidth={2.4} />
                <Text style={styles.documentLinkText}>Visualizar {portalDocument.type === 'NOTA_FISCAL' ? 'nota fiscal' : 'recibo'}</Text>
              </Pressable>
            ) : (
              <View style={styles.noDocumentRow}>
                <FileText color={colors.muted} size={15} />
                <Text style={styles.noDocumentText}>Sem documento vinculado</Text>
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
  style
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
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
          style={styles.input}
          placeholderTextColor={colors.muted}
        />
      </View>
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
    maxWidth: 430,
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
    fontWeight: '900',
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
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#163052',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
    shadowColor: '#163052',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
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
    fontWeight: '900'
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
    fontWeight: '900'
  },
  inputFrame: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: '#C9D6E8',
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
    backgroundColor: '#FBFDFF',
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
    fontWeight: '900'
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8
  },
  choiceButton: {
    flex: 1,
    minHeight: 36,
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
    fontWeight: '800'
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
    minHeight: 38,
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
    fontWeight: '900'
  },
  documentActionTextDanger: {
    color: colors.red
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 7,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: colors.blue,
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900'
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
    fontWeight: '800'
  },
  expenseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 10,
    shadowColor: '#163052',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
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
    fontWeight: '900'
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
    fontWeight: '900'
  },
  documentLinkButton: {
    minHeight: 36,
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
    fontWeight: '900'
  },
  noDocumentRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  noDocumentText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  }
});
