import { ReactNode, useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, CalendarDays, CheckCircle2, ExternalLink, FileText, Flag, Info, Save, Trash2, Upload, UserRound, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Card, Label } from '../components/ui';
import { FormField } from '../components/FormField';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ServiceOrder } from '../types';
import {
  currencyFromNumber,
  dateBRToISO,
  finishCurrency,
  isValidDocument,
  isValidPhoneBR,
  isoToDateBR,
  maskCurrency,
  maskDateBR,
  maskDocument,
  maskPhoneBR,
  parseCurrency
} from '../utils/inputMasks';
import { Camera as CameraIcon } from 'lucide-react-native';
import { PickedFile, choosePhoto, nameWithoutExtension, pickPdf, pickerErrorMessage, previewPickedFile } from '../utils/filePicker';

const statusOptions: Array<Budget['status']> = ['EM_ANALISE', 'APROVADO', 'REJEITADO', 'CANCELADO'];

const statusLabels: Record<Budget['status'], string> = {
  EM_ANALISE: 'Em votação',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  CANCELADO: 'Cancelado'
};

/**
 * Approving or rejecting is up to the houses' vote, so the admin only keeps the current status,
 * cancels, or sends a rejected/cancelled budget back to a new vote.
 */
function allowedStatuses(savedStatus: Budget['status'] | null): Array<Budget['status']> {
  if (!savedStatus) {
    return ['EM_ANALISE'];
  }
  return statusOptions.filter((option) =>
    option === savedStatus
    || option === 'CANCELADO'
    || (option === 'EM_ANALISE' && savedStatus !== 'APROVADO')
  );
}

type FieldErrors = Partial<Record<'title' | 'scope' | 'supplier' | 'amount' | 'supplierDocument' | 'phone' | 'budgetDate' | 'validUntil' | 'expectedDate', string>>;

function positiveId(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function BudgetFormScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const scrollRef = useRef<ScrollView>(null);
  const formMode = route.params?.formMode as 'create' | 'edit' | undefined;
  const routeBudgetId = positiveId(route.params?.budgetId ?? route.params?.budget?.id);
  const editingBudgetId = formMode === 'create' ? null : routeBudgetId;
  const formKey = route.params?.formKey ?? route.key;
  const routeServiceId = positiveId(route.params?.serviceId);

  const [budgetId, setBudgetId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [supplier, setSupplier] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');
  const [loadedSupplierDocument, setLoadedSupplierDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [loadedPhone, setLoadedPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState('');
  const [forService, setForService] = useState<ServiceOrder | null>(null);
  const [budgetDate, setBudgetDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [status, setStatus] = useState<Budget['status']>('EM_ANALISE');
  const [savedStatus, setSavedStatus] = useState<Budget['status'] | null>(null);
  const [notes, setNotes] = useState('');
  const [documentName, setDocumentName] = useState('Orçamento');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentFile, setDocumentFile] = useState<PickedFile | null>(null);
  const [existingDocument, setExistingDocument] = useState<PortalDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const isEditing = Boolean(budgetId);

  function resetForm() {
    setBudgetId(null);
    setTitle('');
    setSupplier('');
    setSupplierDocument('');
    setLoadedSupplierDocument('');
    setPhone('');
    setLoadedPhone('');
    setAmount('');
    setScope('');
    setForService(null);
    setBudgetDate('');
    setValidUntil('');
    setExpectedDate('');
    setStatus('EM_ANALISE');
    setSavedStatus(null);
    setNotes('');
    setDocumentName('Orçamento');
    setDocumentUrl('');
    setDocumentFile(null);
    setExistingDocument(null);
    setFieldErrors({});
  }

  function fillForm(budget: Budget, documents: PortalDocument[]) {
    const document = documents.find((item) => item.type === 'ORCAMENTO') ?? documents[0] ?? null;
    const maskedDocument = maskDocument(budget.supplierDocument ?? '');
    const maskedPhone = maskPhoneBR(budget.phone ?? '');
    setBudgetId(budget.id ?? null);
    setTitle(budget.title ?? '');
    setSupplier(budget.supplier ?? '');
    setSupplierDocument(maskedDocument);
    setLoadedSupplierDocument(maskedDocument);
    setPhone(maskedPhone);
    setLoadedPhone(maskedPhone);
    setAmount(currencyFromNumber(budget.amount));
    setScope(budget.scope ?? '');
    setBudgetDate(isoToDateBR(budget.budgetDate));
    setValidUntil(isoToDateBR(budget.validUntil));
    setExpectedDate(isoToDateBR(budget.expectedDate));
    setStatus(budget.status ?? 'EM_ANALISE');
    setSavedStatus(budget.status ?? 'EM_ANALISE');
    setNotes(budget.notes ?? '');
    setDocumentName(document?.name ?? 'Orçamento');
    setDocumentUrl(document?.url ?? '');
    setDocumentFile(null);
    setExistingDocument(document);
    setFieldErrors({});
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setLoading(true);
        setError('');
        try {
          if (editingBudgetId) {
            const [nextBudget, nextDocuments] = await Promise.all([
              api.budget(editingBudgetId),
              api.documents('BUDGET', editingBudgetId)
            ]);
            if (active) {
              fillForm(nextBudget, nextDocuments);
              if (nextBudget.serviceId) {
                const linked = await api.service(nextBudget.serviceId).catch(() => null);
                if (active) {
                  setForService(linked);
                }
              }
            }
            return;
          }
          resetForm();
          if (routeServiceId) {
            const service = await api.service(routeServiceId);
            if (!active) {
              return;
            }
            setForService(service);
            setTitle(service.title);
            setScope(service.description ?? '');
          }
        } catch (err) {
          if (active) {
            resetForm();
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

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function validate() {
    const next: FieldErrors = {};
    const amountValue = parseCurrency(amount);
    if (!title.trim()) {
      next.title = 'Informe o título do orçamento.';
    }
    if (!isEditing && !scope.trim()) {
      next.scope = 'Descreva o que o fornecedor vai fazer, para as casas saberem o que estão votando.';
    }
    if (!supplier.trim()) {
      next.supplier = 'Informe o nome do fornecedor.';
    }
    if (amountValue === undefined || amountValue <= 0) {
      next.amount = 'Informe o valor do orçamento, maior que zero.';
    }
    // Numbers already on file are not re-checked unless they were changed.
    if (supplierDocument.trim() && supplierDocument !== loadedSupplierDocument && !isValidDocument(supplierDocument)) {
      next.supplierDocument = 'CPF ou CNPJ inválido. Confira os números ou deixe em branco.';
    }
    if (phone.trim() && phone !== loadedPhone && !isValidPhoneBR(phone)) {
      next.phone = 'Telefone incompleto. Use o DDD e o número.';
    }
    const dateMessage = 'Data inválida. Use dia/mês/ano, por exemplo 25/12/2026.';
    if (budgetDate.trim() && !dateBRToISO(budgetDate)) {
      next.budgetDate = dateMessage;
    }
    if (validUntil.trim() && !dateBRToISO(validUntil)) {
      next.validUntil = dateMessage;
    }
    if (expectedDate.trim() && !dateBRToISO(expectedDate)) {
      next.expectedDate = dateMessage;
    }
    const issued = dateBRToISO(budgetDate);
    const valid = dateBRToISO(validUntil);
    if (issued && valid && valid < issued) {
      next.validUntil = 'A validade não pode ser antes da data do orçamento.';
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
      const payload: Budget = {
        id: budgetId ?? undefined,
        title: title.trim(),
        serviceId: isEditing ? undefined : routeServiceId,
        scope: scope.trim() || undefined,
        supplier: supplier.trim(),
        supplierDocument: supplierDocument.trim() || undefined,
        phone: phone.trim() || undefined,
        amount: parseCurrency(amount) ?? 0,
        budgetDate: dateBRToISO(budgetDate),
        validUntil: dateBRToISO(validUntil),
        expectedDate: dateBRToISO(expectedDate),
        status,
        documentId: existingDocument?.id,
        notes: notes.trim() || undefined
      };

      let saved = budgetId
        ? await api.updateBudget(budgetId, payload)
        : await api.createBudget(payload);

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
      if (saved.id) {
        navigation.navigate('BudgetDetails', { id: saved.id, refreshKey: Date.now() });
      } else {
        navigation.navigate('Budgets', { refreshKey: Date.now() });
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Não consegui salvar o orçamento.'));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  function previewDocument() {
    if (documentFile) {
      previewPickedFile(documentFile).catch(() => Alert.alert('Orçamento', 'Não consegui abrir o arquivo escolhido.'));
      return;
    }
    const previewUrl = documentUrl.trim();
    if (!previewUrl) {
      Alert.alert('Orçamento', 'Informe o PDF ou link do orçamento.');
      return;
    }
    api.openDocument(previewUrl).catch(() => Alert.alert('Orçamento', 'Não foi possível abrir o documento.'));
  }

  async function attachFile(pick: () => Promise<PickedFile | null>) {
    try {
      const file = await pick();
      if (!file) {
        return;
      }
      setDocumentFile(file);
      setDocumentUrl('');
      if (!documentName.trim() || documentName === 'Orçamento') {
        setDocumentName(nameWithoutExtension(file.name));
      }
    } catch (err) {
      Alert.alert('Orçamento', pickerErrorMessage(err));
    }
  }

  function cancel() {
    navigation.navigate(isEditing && budgetId ? 'BudgetDetails' : 'Budgets', isEditing && budgetId ? { id: budgetId } : undefined);
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
            <Text style={styles.title}>{isEditing ? 'Editar orçamento' : 'Novo orçamento'}</Text>
            <Text style={styles.subtitle}>{isEditing ? `Orçamento #${budgetId}` : 'Cotação de fornecedor'}</Text>
          </View>
        </View>

        {error ? (
          <Card style={styles.errorCard}>
            <Label>{error}</Label>
          </Card>
        ) : null}

        {isEditing ? (
          <FormSection icon={Flag} title="Situação">
            {loading ? <Text style={styles.sectionHelp}>Carregando...</Text> : null}
            <View style={styles.statusGrid}>
              {allowedStatuses(savedStatus).map((item) => (
                <StatusChoice key={item} label={statusLabels[item]} selected={item === status} onPress={() => setStatus(item)} />
              ))}
            </View>
            <Text style={styles.sectionHelp}>
              {savedStatus === 'EM_ANALISE'
                ? 'Aprovar ou recusar é decidido pela votação das casas. Mudar título, fornecedor ou valor zera os votos já dados.'
                : 'Aprovar ou recusar é decidido pela votação das casas.'}
            </Text>
          </FormSection>
        ) : (
          <View style={styles.infoBox}>
            <Info color={colors.blue} size={18} />
            <Text style={styles.infoText}>
              {forService
                ? `Cotação para o serviço "${forService.title}". Cada casa aprova só uma cotação do serviço: vence a que chegar primeiro à maioria, e as outras são encerradas.`
                : 'Todo orçamento novo vai para a votação das casas. Ele é aprovado quando a maioria das casas votar "Aprovar".'}
            </Text>
          </View>
        )}

        <FormSection icon={UserRound} title="Fornecedor e valor">
          <FormField
            label="Título do orçamento"
            required
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              clearFieldError('title');
            }}
            placeholder="Ex.: Pintura do muro externo"
            error={fieldErrors.title}
          />
          <FormField
            label="Fornecedor"
            required
            value={supplier}
            onChangeText={(value) => {
              setSupplier(value);
              clearFieldError('supplier');
            }}
            placeholder="Nome da empresa ou do prestador"
            error={fieldErrors.supplier}
          />
          <FormField
            label="O que será feito"
            required={!isEditing}
            value={scope}
            onChangeText={(value) => {
              setScope(value);
              clearFieldError('scope');
            }}
            placeholder="Descreva o serviço que o fornecedor vai executar."
            multiline
            error={fieldErrors.scope}
          />
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
            label="Telefone"
            value={phone}
            onChangeText={(value) => {
              setPhone(maskPhoneBR(value));
              clearFieldError('phone');
            }}
            keyboardType="phone-pad"
            maxLength={15}
            placeholder="(00) 00000-0000"
            error={fieldErrors.phone}
          />
          <FormField
            label="Valor"
            required
            value={amount}
            onChangeText={(value) => {
              setAmount(maskCurrency(value));
              clearFieldError('amount');
            }}
            onBlur={() => setAmount((value) => finishCurrency(value))}
            keyboardType="decimal-pad"
            placeholder="R$ 0,00"
            error={fieldErrors.amount}
          />
        </FormSection>

        <FormSection icon={CalendarDays} title="Datas e observações">
          <View style={styles.twoColumns}>
            <FormField
              label="Data do orçamento"
              value={budgetDate}
              onChangeText={(value) => {
                setBudgetDate(maskDateBR(value));
                clearFieldError('budgetDate');
              }}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="dd/mm/aaaa"
              error={fieldErrors.budgetDate}
              style={styles.columnField}
            />
            <FormField
              label="Validade"
              value={validUntil}
              onChangeText={(value) => {
                setValidUntil(maskDateBR(value));
                clearFieldError('validUntil');
              }}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="dd/mm/aaaa"
              error={fieldErrors.validUntil}
              style={styles.columnField}
            />
          </View>
          <FormField
            label="Previsão de execução"
            value={expectedDate}
            onChangeText={(value) => {
              setExpectedDate(maskDateBR(value));
              clearFieldError('expectedDate');
            }}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="dd/mm/aaaa"
            error={fieldErrors.expectedDate}
          />
          <FormField
            label="Observações"
            value={notes}
            onChangeText={setNotes}
            placeholder="O que está incluso, forma de pagamento, garantia..."
            multiline
          />
        </FormSection>

        <FormSection icon={FileText} title="Documento do orçamento">
          <FormField label="Nome do documento" value={documentName} onChangeText={setDocumentName} placeholder="Orçamento" />
          <FormField label="Link do PDF" value={documentUrl} onChangeText={setDocumentUrl} placeholder="https://.../orcamento.pdf" />
          {documentFile ? <Text style={styles.sectionHelp}>Arquivo selecionado: {documentFile.name}</Text> : null}
          {existingDocument && !documentFile ? <Text style={styles.sectionHelp}>Documento atual: {existingDocument.name}</Text> : null}
          <View style={styles.documentActions}>
            <DocumentActionButton title="Selecionar PDF" icon={Upload} onPress={() => attachFile(pickPdf)} />
            <DocumentActionButton title="Enviar foto" icon={CameraIcon} onPress={() => attachFile(choosePhoto)} />
            <DocumentActionButton title="Visualizar PDF" icon={ExternalLink} onPress={previewDocument} />
            <DocumentActionButton title="Limpar documento" icon={Trash2} danger onPress={() => { setDocumentUrl(''); setDocumentFile(null); setExistingDocument(null); }} />
          </View>
        </FormSection>

        <View style={styles.footerActions}>
          <FooterActionButton title="Cancelar" icon={X} onPress={cancel} />
          <FooterActionButton title={saving ? 'Salvando...' : isEditing ? 'Atualizar orçamento' : 'Salvar orçamento'} icon={Save} onPress={save} primary disabled={saving || loading} />
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
      {selected ? <CheckCircle2 color={colors.surface} size={15} /> : null}
      <Text style={[styles.statusChoiceText, selected ? styles.statusChoiceTextSelected : null]}>{label}</Text>
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C9DAF2',
    backgroundColor: colors.blueSoft,
    padding: spacing.md,
    zIndex: 1
  },
  infoText: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
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
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  statusChoice: {
    minHeight: 44,
    flex: 1,
    minWidth: 100,
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
  twoColumns: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  columnField: {
    flex: 1,
    minWidth: 0
  },
  documentActions: {
    gap: spacing.sm
  },
  documentActionButton: {
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
