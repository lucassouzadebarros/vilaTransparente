import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ban, Camera, CheckCircle2, Eye, FileText, Info, Plus, RefreshCw, Repeat, Send, ShieldCheck, Upload } from 'lucide-react-native';
import { EmptyFilter, FilterBar, FilterOption } from '../components/FilterBar';
import { Badge, Button, Card, Facts, Field, Label, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing, TOUCH_TARGET } from '../theme';
import { Payable, PIX_IN_FLIGHT, PixPaymentStatus, Supplier } from '../types';
import { Alert } from '../utils/alert';
import { PickedFile, choosePhoto, pickPdf, pickerErrorMessage } from '../utils/filePicker';
import { formatDateBR, formatMoneyBR } from '../utils/format';
import { dateBRToISO, finishCurrency, isoToDateBR, maskCurrency, maskDateBR, parseCurrency } from '../utils/inputMasks';

type Filter = 'OPEN' | 'APPROVE' | 'PAID' | 'ALL';

/** The same list as the web panel, so both add up the same way. */
const CATEGORIES = ['Manutenção', 'Limpeza', 'Pessoal', 'Energia', 'Água', 'Gás', 'Taxas', 'Seguro', 'Administração', 'Obras', 'Outros'];

const METHODS: Array<{ key: string; label: string }> = [
  { key: 'PIX', label: 'Pix' },
  { key: 'TED', label: 'TED' },
  { key: 'BOLETO', label: 'Boleto' },
  { key: 'DINHEIRO', label: 'Dinheiro' },
  { key: 'CARTAO', label: 'Cartão' },
  { key: 'OUTRO', label: 'Outro' }
];

const isOpen = (payable: Payable) => payable.status === 'APPROVED' || payable.status === 'PENDING_APPROVAL';
const today = () => isoToDateBR(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString());
const sum = (items: Payable[]) => items.reduce((total, item) => total + Number(item.amount), 0);

/** The status word of a bill: an approved one not yet paid is "A pagar", or "Vencida" past its due date. */
function statusKey(payable: Payable) {
  if (payable.status === 'PAID') return 'PAGA';
  if (payable.status === 'CANCELLED') return 'CANCELADA';
  if (payable.status === 'PENDING_APPROVAL') return 'PENDING_APPROVAL';
  return payable.overdue ? 'OVERDUE' : 'APPROVED';
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected ? styles.choiceSelected : null, { opacity: pressed ? 0.82 : 1 }]}
    >
      {selected ? <CheckCircle2 color={colors.blue} size={14} strokeWidth={2.6} /> : null}
      <Text style={[styles.choiceText, selected ? styles.choiceTextSelected : null]}>{label}</Text>
    </Pressable>
  );
}

function Choices({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.choiceGroup}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.choiceRow}>
        {children}
      </View>
    </View>
  );
}

/** A photo or PDF attached to the bill or the payment, chosen from the phone. */
function Attachment({ file, onPick, onClear }: { file: PickedFile | null; onPick: (pick: () => Promise<PickedFile | null>) => void; onClear: () => void }) {
  return (
    <View style={styles.attach}>
      {file ? <Text style={styles.attachName}>Arquivo: {file.name}</Text> : null}
      <View style={styles.choiceRow}>
        <Button title="Foto" icon={Camera} variant="ghost" onPress={() => onPick(choosePhoto)} />
        <Button title="PDF" icon={Upload} variant="ghost" onPress={() => onPick(pickPdf)} />
        {file ? <Button title="Tirar" icon={Ban} variant="danger" onPress={onClear} /> : null}
      </View>
    </View>
  );
}

async function pickInto(pick: () => Promise<PickedFile | null>, set: (file: PickedFile) => void) {
  try {
    const file = await pick();
    if (file) set(file);
  } catch (error) {
    Alert.alert('Arquivo', pickerErrorMessage(error));
  }
}

/** A new bill: what, to whom, how much, when; once, in installments or every month; with the invoice or boleto. */
function NewPayableForm({ suppliers, onDone, onClose }: { suppliers: Supplier[]; onDone: () => void; onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(today());
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [category, setCategory] = useState('Manutenção');
  const [repetition, setRepetition] = useState<'ONCE' | 'INSTALLMENTS' | 'MONTHLY'>('ONCE');
  const [installments, setInstallments] = useState('2');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [reason, setReason] = useState('');
  const [askReason, setAskReason] = useState(false);
  const [saving, setSaving] = useState(false);
  const value = parseCurrency(amount) ?? 0;
  const due = dateBRToISO(dueDate);
  const parts = repetition === 'INSTALLMENTS' ? Number(installments) : 1;
  const ready = description.trim().length >= 3 && value > 0 && Boolean(due) && (repetition !== 'INSTALLMENTS' || (parts >= 2 && parts <= 60));

  async function save() {
    setSaving(true);
    try {
      const document = file
        ? await api.uploadDocument(file, { name: file.name, type: 'NOTA_FISCAL', relatedType: 'PAYABLE', description: `Conta: ${description.trim()}` })
        : null;
      const created = await api.createPayable({
        supplierId,
        description: description.trim(),
        category,
        amount: value,
        dueDate: due as string,
        installments: parts,
        monthly: repetition === 'MONTHLY',
        documentId: document?.id ?? null,
        exceptionReason: reason.trim() || null,
        notes: null
      });
      Alert.alert(
        'Contas a pagar',
        created[0]?.status === 'PENDING_APPROVAL' ? 'Conta lançada. Ela espera a aprovação de outra pessoa.' : created.length > 1 ? `${created.length} parcelas lançadas.` : 'Conta lançada.'
      );
      onDone();
    } catch (error) {
      const message = apiErrorMessage(error, 'Não consegui lançar a conta.');
      if (/justificativa/i.test(message)) setAskReason(true);
      Alert.alert('Contas a pagar', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <Value>Nova conta</Value>
      <Field label="O que é" value={description} onChangeText={setDescription} placeholder="Ex.: Limpeza da caixa d'água" />
      <Field
        label={repetition === 'INSTALLMENTS' ? 'Valor total' : 'Valor'}
        value={amount}
        onChangeText={(text) => setAmount(maskCurrency(text))}
        keyboardType="numeric"
        placeholder="R$ 0,00"
        helpText={repetition === 'INSTALLMENTS' && value > 0 && parts >= 2 ? `${parts} × ${formatMoneyBR(Math.floor((value / parts) * 100) / 100)}, uma por mês` : undefined}
      />
      <Field
        label={repetition === 'INSTALLMENTS' ? 'Vencimento da 1ª parcela' : 'Vencimento'}
        value={dueDate}
        onChangeText={(text) => setDueDate(maskDateBR(text))}
        keyboardType="numeric"
        placeholder="dd/mm/aaaa"
        errorText={dueDate.length === 10 && !due ? 'Data inválida.' : undefined}
      />
      <Choices label="Fornecedor">
        <Choice label="Sem fornecedor" selected={supplierId == null} onPress={() => setSupplierId(null)} />
        {suppliers
          .filter((supplier) => supplier.active)
          .map((supplier) => (
            <Choice key={supplier.id} label={supplier.name} selected={supplierId === supplier.id} onPress={() => setSupplierId(supplier.id)} />
          ))}
      </Choices>
      <Choices label="Categoria">
        {CATEGORIES.map((name) => (
          <Choice key={name} label={name} selected={category === name} onPress={() => setCategory(name)} />
        ))}
      </Choices>
      <Choices label="Repetição">
        <Choice label="Uma vez" selected={repetition === 'ONCE'} onPress={() => setRepetition('ONCE')} />
        <Choice label="Parcelada" selected={repetition === 'INSTALLMENTS'} onPress={() => setRepetition('INSTALLMENTS')} />
        <Choice label="Todo mês" selected={repetition === 'MONTHLY'} onPress={() => setRepetition('MONTHLY')} />
      </Choices>
      {repetition === 'INSTALLMENTS' ? (
        <Field label="Parcelas" value={installments} onChangeText={(text) => setInstallments(text.replace(/\D/g, '').slice(0, 2))} keyboardType="numeric" />
      ) : null}
      {repetition === 'MONTHLY' ? <Label>Ao pagar, a do mês seguinte já aparece aprovada. Para parar, cancele a próxima.</Label> : null}
      <Text style={styles.groupLabel}>Nota fiscal ou boleto (opcional)</Text>
      <Attachment file={file} onPick={(pick) => pickInto(pick, setFile)} onClear={() => setFile(null)} />
      {askReason ? (
        <Field label="Justificativa (aparece para todos)" value={reason} onChangeText={setReason} multiline helpText="Pelo menos 20 letras." />
      ) : null}
      <Button title={saving ? 'Lançando...' : 'Lançar conta'} icon={Plus} onPress={save} disabled={saving || !ready} />
      <Button title="Fechar sem salvar" variant="ghost" onPress={onClose} />
    </Card>
  );
}

/**
 * Paying a bill: by Pix straight from the condominium's Asaas account, confirmed with the person's own password (the bill
 * is settled with the receipt when Asaas confirms it), or registering what was already paid at the bank or in cash.
 */
function PayForm({ payable, supplier, onDone, onClose }: { payable: Payable; supplier: Supplier | null; onDone: () => void; onClose: () => void }) {
  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState('PIX');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [pix, setPix] = useState<PixPaymentStatus | null>(null);
  const [mode, setMode] = useState<'PIX' | 'OUTSIDE' | null>(null);
  const [password, setPassword] = useState('');
  const iso = dateBRToISO(paidAt);
  const future = Boolean(iso) && (iso as string) > (dateBRToISO(today()) as string);

  useEffect(() => {
    api.pixStatus()
      .then(setPix)
      .catch(() => setPix({ available: false, reason: 'Não consegui consultar o Pix agora.', dailyLimit: null, usedToday: 0, balance: null }));
  }, []);
  const left = pix?.dailyLimit != null ? Number(pix.dailyLimit) - Number(pix.usedToday) : null;
  const blocked = !pix
    ? null
    : !pix.available
      ? pix.reason
      : !payable.supplierHasPix
        ? 'O fornecedor desta conta não tem chave Pix cadastrada.'
        : left != null && Number(payable.amount) > left
          ? `Passa do limite de Pix de hoje: ainda dá para mandar ${formatMoneyBR(Math.max(0, left))}.`
          : null;
  // Pix first whenever it can go; otherwise the payment made elsewhere.
  const chosen = mode ?? (pix && !blocked ? 'PIX' : 'OUTSIDE');

  async function sendPix() {
    setSaving(true);
    try {
      await api.payByPix(payable.id, password);
      Alert.alert('Contas a pagar', 'Pix enviado. A baixa e o comprovante entram sozinhos quando o Asaas confirmar.');
      onDone();
    } catch (error) {
      Alert.alert('Contas a pagar', apiErrorMessage(error, 'O Pix não saiu.'));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const receipt = file
        ? await api.uploadDocument(file, { name: file.name, type: 'RECIBO', relatedType: 'PAYABLE', description: `Comprovante: ${payable.description}` })
        : null;
      await api.payPayable(payable.id, { paidAt: iso as string, method, receiptDocumentId: receipt?.id ?? null, notes: null });
      Alert.alert('Contas a pagar', 'Pagamento registrado e lançado nas despesas.');
      onDone();
    } catch (error) {
      Alert.alert('Contas a pagar', apiErrorMessage(error, 'Não consegui registrar o pagamento.'));
    } finally {
      setSaving(false);
    }
  }

  const choice = (
    <Choices label="Como pagar">
      <Choice label="Pix pelo Asaas" selected={chosen === 'PIX'} onPress={() => setMode('PIX')} />
      <Choice label="Já foi pago por fora" selected={chosen === 'OUTSIDE'} onPress={() => setMode('OUTSIDE')} />
    </Choices>
  );

  if (chosen === 'PIX') {
    return (
      <View style={styles.inlineForm}>
        {choice}
        {!pix ? (
          <Label>Consultando o Pix...</Label>
        ) : (
          <>
            <Facts
              items={[
                { label: 'Para', value: payable.supplierName ?? 'Sem fornecedor' },
                { label: 'Chave Pix', value: supplier?.pixKey ?? '—' },
                { label: 'Valor', value: formatMoneyBR(payable.amount) },
                { label: 'Hoje pelo Asaas', value: pix.dailyLimit != null ? `${formatMoneyBR(pix.usedToday)} de ${formatMoneyBR(pix.dailyLimit)}` : '—' }
              ]}
            />
            {blocked ? (
              <Text style={styles.warn}>{blocked}</Text>
            ) : (
              <>
                <Field
                  label="Sua senha"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  helpText="A senha da sua conta confirma que é você mandando o dinheiro."
                />
                <Label>O Pix sai da conta Asaas do condomínio. Quando o Asaas confirmar, a conta é dada como paga e o comprovante entra sozinho.</Label>
                <Button title={saving ? 'Enviando...' : 'Enviar Pix'} icon={Send} onPress={sendPix} disabled={saving || !password} />
              </>
            )}
          </>
        )}
        <Button title="Voltar" variant="ghost" onPress={onClose} />
      </View>
    );
  }

  return (
    <View style={styles.inlineForm}>
      {choice}
      <Label>Para o que já foi pago no banco ou em dinheiro: vira despesa no caixa, com o comprovante.</Label>
      <Field
        label="Pago em"
        value={paidAt}
        onChangeText={(text) => setPaidAt(maskDateBR(text))}
        keyboardType="numeric"
        placeholder="dd/mm/aaaa"
        errorText={paidAt.length === 10 && (!iso || future) ? 'Hoje ou um dia que já passou.' : undefined}
      />
      <Choices label="Como foi pago">
        {METHODS.map((option) => (
          <Choice key={option.key} label={option.label} selected={method === option.key} onPress={() => setMethod(option.key)} />
        ))}
      </Choices>
      <Text style={styles.groupLabel}>Comprovante</Text>
      <Attachment file={file} onPick={(pick) => pickInto(pick, setFile)} onClear={() => setFile(null)} />
      <Button title={saving ? 'Registrando...' : 'Registrar pagamento'} icon={CheckCircle2} onPress={save} disabled={saving || !iso || future} />
      <Button title="Voltar" variant="ghost" onPress={onClose} />
    </View>
  );
}

function CancelForm({ payable, onDone, onClose }: { payable: Payable; onDone: () => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.cancelPayable(payable.id, reason.trim());
      onDone();
    } catch (error) {
      Alert.alert('Contas a pagar', apiErrorMessage(error, 'Não consegui cancelar a conta.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.inlineForm}>
      <Field label="Motivo do cancelamento" value={reason} onChangeText={setReason} helpText="Fica na auditoria." />
      <Button title={saving ? 'Cancelando...' : 'Cancelar conta'} icon={Ban} variant="danger" onPress={save} disabled={saving || reason.trim().length < 3} />
      <Button title="Voltar" variant="ghost" onPress={onClose} />
    </View>
  );
}

function trail(payable: Payable) {
  const parts = [
    payable.createdBy && `Lançada por ${payable.createdBy}`,
    payable.approvedBy && payable.approvedBy !== payable.createdBy && `aprovada por ${payable.approvedBy}`,
    payable.paidBy && `paga por ${payable.paidBy}`,
    payable.cancelledBy && `cancelada por ${payable.cancelledBy}${payable.cancelReason ? `: ${payable.cancelReason}` : ''}`
  ].filter(Boolean);
  return parts.join(' · ');
}

/** The condominium's bills on the phone: what is due, what waits for approval, and recording what was paid. */
export function PayablesScreen() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Payable[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [canPay, setCanPay] = useState(isAdmin);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [approving, setApproving] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, session, supplierList] = await Promise.all([api.payables(), api.session().catch(() => null), api.suppliers().catch(() => [])]);
      setItems(list);
      setSuppliers(supplierList);
      if (session) setCanPay(session.canPay);
    } catch (error) {
      Alert.alert('Contas a pagar', apiErrorMessage(error, 'Não consegui carregar as contas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const open = items.filter(isOpen);
  const toApprove = items.filter((item) => item.canApprove);
  const overdue = open.filter((item) => item.overdue);
  const monthStart = (dateBRToISO(today()) as string).slice(0, 7);
  const paidThisMonth = items.filter((item) => item.status === 'PAID' && (item.paidAt ?? '').startsWith(monthStart));

  const options = useMemo<Array<FilterOption<Filter>>>(
    () => [
      { key: 'OPEN', label: 'A pagar', count: open.length },
      { key: 'APPROVE', label: 'Para aprovar', count: toApprove.length },
      { key: 'PAID', label: 'Pagas', count: items.filter((item) => item.status === 'PAID').length },
      { key: 'ALL', label: 'Todas', count: items.length }
    ],
    [items, open.length, toApprove.length]
  );
  const visible =
    filter === 'OPEN' ? open : filter === 'APPROVE' ? toApprove : filter === 'PAID' ? [...items.filter((item) => item.status === 'PAID')].reverse() : items;

  async function approve(payable: Payable) {
    setApproving(payable.id);
    try {
      await api.approvePayable(payable.id);
      await load();
    } catch (error) {
      Alert.alert('Contas a pagar', apiErrorMessage(error, 'Não consegui aprovar a conta.'));
    } finally {
      setApproving(null);
    }
  }

  function openDocument(id: number) {
    api.openDocument(`/api/documents/${id}/file`).catch(() => Alert.alert('Documento', 'Não foi possível abrir o documento.'));
  }

  function done() {
    setCreating(false);
    setPaying(null);
    setCancelling(null);
    load();
  }

  return (
    <Screen
      title="Contas a pagar"
      subtitle="O que o condomínio deve pagar, quem aprovou e o que já foi pago."
      right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} accessibilityLabel="Atualizar as contas" />}
    >
      {!canPay ? (
        <Card style={styles.note}>
          <Info color={colors.blue} size={18} />
          <Text style={styles.noteText}>Você acompanha as contas. Para lançar, aprovar e pagar, a administração precisa liberar no painel.</Text>
        </Card>
      ) : null}

      <Card>
        <Facts
          items={[
            { label: 'A pagar', value: `${formatMoneyBR(sum(open))} (${open.length})` },
            { label: 'Vencidas', value: overdue.length > 0 ? <Text style={styles.danger}>{`${formatMoneyBR(sum(overdue))} (${overdue.length})`}</Text> : 'Nenhuma' },
            { label: 'Para você aprovar', value: String(toApprove.length) },
            { label: 'Pagas no mês', value: formatMoneyBR(sum(paidThisMonth)) }
          ]}
        />
      </Card>

      {canPay && !creating ? <Button title="Nova conta" icon={Plus} onPress={() => setCreating(true)} /> : null}
      {creating ? <NewPayableForm suppliers={suppliers} onDone={done} onClose={() => setCreating(false)} /> : null}

      <FilterBar label="Quais contas mostrar" options={options} value={filter} onChange={setFilter} />
      {!loading && visible.length === 0 ? (
        <EmptyFilter message={items.length === 0 ? 'Nenhuma conta lançada ainda.' : 'Nenhuma conta neste filtro.'} onClear={filter !== 'ALL' && items.length > 0 ? () => setFilter('ALL') : undefined} />
      ) : null}

      {visible.map((payable) => (
        <Card key={payable.id}>
          <View style={styles.cardTop}>
            <View style={styles.cardCopy}>
              <Value>{payable.description}</Value>
              <Label>{[payable.supplierName, payable.category].filter(Boolean).join(' · ') || 'Sem fornecedor'}</Label>
            </View>
            <Badge status={statusKey(payable)} />
          </View>
          <Facts
            items={[
              { label: 'Valor', value: formatMoneyBR(payable.amount) },
              payable.status === 'PAID'
                ? { label: 'Paga em', value: formatDateBR(payable.paidAt) }
                : { label: 'Vencimento', value: payable.overdue ? <Text style={styles.danger}>{formatDateBR(payable.dueDate)}</Text> : formatDateBR(payable.dueDate) },
              ...(payable.installments ? [{ label: 'Parcela', value: `${payable.installment} de ${payable.installments}` }] : []),
              ...(payable.recurrence ? [{ label: 'Repete', value: <View style={styles.inline}><Repeat color={colors.muted} size={14} /><Text style={styles.small}>Todo mês</Text></View> }] : [])
            ]}
          />
          {trail(payable) ? <Text style={styles.small}>{trail(payable)}</Text> : null}
          {payable.exceptionReason ? <Text style={styles.warn}>Sem votação: {payable.exceptionReason}</Text> : null}

          {payable.pixStatus && PIX_IN_FLIGHT.includes(payable.pixStatus) ? (
            <Text style={styles.small}>Pix a caminho pelo Asaas: a baixa e o comprovante entram sozinhos quando ele confirmar.</Text>
          ) : isOpen(payable) && (payable.pixStatus === 'FAILED' || payable.pixStatus === 'CANCELLED') ? (
            <Text style={styles.danger}>O último Pix não saiu{payable.pixFailReason ? `: ${payable.pixFailReason}` : ''}.</Text>
          ) : null}

          {payable.pixStatus && PIX_IN_FLIGHT.includes(payable.pixStatus) ? null : paying === payable.id ? (
            <PayForm payable={payable} supplier={suppliers.find((item) => item.id === payable.supplierId) ?? null} onDone={done} onClose={() => setPaying(null)} />
          ) : cancelling === payable.id ? (
            <CancelForm payable={payable} onDone={done} onClose={() => setCancelling(null)} />
          ) : (
            <View style={styles.actions}>
              {payable.canApprove ? (
                <Button title={approving === payable.id ? 'Aprovando...' : 'Aprovar'} icon={ShieldCheck} onPress={() => approve(payable)} disabled={approving != null} />
              ) : null}
              {canPay && payable.status === 'APPROVED' ? <Button title="Pagar" icon={CheckCircle2} variant="ghost" onPress={() => setPaying(payable.id)} /> : null}
              {payable.documentId ? <Button title="Nota / boleto" icon={FileText} variant="ghost" onPress={() => openDocument(payable.documentId as number)} /> : null}
              {payable.receiptDocumentId ? <Button title="Comprovante" icon={Eye} variant="ghost" onPress={() => openDocument(payable.receiptDocumentId as number)} /> : null}
              {canPay && isOpen(payable) ? <Button title="Cancelar" icon={Ban} variant="danger" onPress={() => setCancelling(payable.id)} /> : null}
            </View>
          )}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  noteText: {
    flex: 1,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  inlineForm: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md
  },
  choiceGroup: {
    gap: spacing.xs
  },
  groupLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600'
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  choice: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  choiceSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  choiceText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '500'
  },
  choiceTextSelected: {
    color: colors.blue,
    fontWeight: '700'
  },
  attach: {
    gap: spacing.xs
  },
  attachName: {
    color: colors.muted,
    fontSize: 13
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  small: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  warn: {
    color: colors.amber,
    fontSize: 13,
    lineHeight: 18
  },
  danger: {
    color: colors.red,
    fontWeight: '600'
  }
});
