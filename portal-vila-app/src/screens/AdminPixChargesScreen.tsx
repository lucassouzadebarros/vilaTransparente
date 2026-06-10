import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CheckCircle2, Home, Plus, RefreshCw, RotateCw, Users } from 'lucide-react-native';
import { PixChargeCard } from '../components/pix/PixChargeCard';
import { Badge, Button, Card, Field, Label, Money, Row, Screen, Value } from '../components/ui';
import { api, apiErrorMessage } from '../services/api';
import { PixCharge, Resident } from '../types';
import { colors, spacing } from '../theme';
import { currentMonth } from '../utils/month';

type GenerationMode = 'all' | 'house';

function actionErrorMessage(error: unknown) {
  return apiErrorMessage(error, 'Não consegui falar com a API agora. Confira se o backend está rodando e se o app está apontando para a URL correta.');
}

function parseAmount(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
}

export function AdminPixChargesScreen() {
  const navigation = useNavigation<any>();
  const [billingDate, setBillingDate] = useState(formatBillingDate(currentMonth()));
  const [amount, setAmount] = useState('R$ 100,00');
  const [mode, setMode] = useState<GenerationMode>('all');
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [charges, setCharges] = useState<PixCharge[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [busy, setBusy] = useState(false);

  const activeResidents = useMemo(() => residents.filter((resident) => resident.status === 'ACTIVE'), [residents]);
  const selectedResident = activeResidents.find((resident) => resident.houseId === selectedHouseId);
  const amountValue = parseAmount(amount);
  const month = monthFromBillingDate(billingDate);
  const billingDateError = billingDateFieldError(billingDate);
  const amountError = amountFieldError(amount);
  const canGenerate = !busy && !billingDateError && !amountError && Number.isFinite(amountValue) && amountValue > 0 && (mode === 'all' || Boolean(selectedHouseId));

  const totals = useMemo(() => ({
    paid: charges.filter((charge) => charge.status === 'PAID').length,
    pending: charges.filter((charge) => charge.status === 'PENDING').length,
    overdue: charges.filter((charge) => charge.status === 'OVERDUE').length,
    generated: charges.length,
    value: charges.reduce((sum, charge) => sum + (charge.status === 'PAID' ? charge.value : 0), 0)
  }), [charges]);

  async function load() {
    const [nextCharges, nextResidents] = await Promise.all([
      api.pixCharges(month),
      api.residents()
    ]);
    setCharges(nextCharges);
    setResidents(nextResidents);
    if (!selectedHouseId) {
      setSelectedHouseId(nextResidents.find((resident) => resident.status === 'ACTIVE')?.houseId ?? null);
    }
  }

  async function generate() {
    if (!canGenerate) {
      Alert.alert('Pix', mode === 'house' ? 'Selecione uma casa e informe um valor válido.' : 'Informe um valor válido.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'house') {
        const generated = await api.generatePixChargeForHouse(month, amountValue, selectedHouseId as number);
        await load();
        Alert.alert('Pix', `Cobrança da ${generated.houseLabel} pronta.`);
      } else {
        const generated = await api.generatePixCharges(month, amountValue);
        setCharges(generated);
        Alert.alert('Pix', generated.length ? 'Cobranças do mês geradas.' : 'Nenhuma cobrança foi gerada. Cadastre pelo menos um morador ativo antes de gerar Pix.');
      }
    } catch (error) {
      Alert.alert('Pix', actionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function reconcile() {
    setBusy(true);
    try {
      setCharges(await api.reconcilePixCharges(month));
      Alert.alert('Pix', 'Cobranças reconciliadas com o gateway.');
    } catch (error) {
      Alert.alert('Pix', actionErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function refresh(id: number) {
    try {
      await api.refreshQrCode(id);
      load();
    } catch (error) {
      Alert.alert('Pix', actionErrorMessage(error));
    }
  }

  async function cancel(id: number) {
    try {
      await api.cancelCharge(id, 'Cancelada pelo admin');
      load();
    } catch (error) {
      Alert.alert('Pix', actionErrorMessage(error));
    }
  }

  useEffect(() => {
    load();
  }, [month]);

  return (
    <Screen title="Admin Pix" subtitle="Cobranças do mês" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      <Card>
        <Field
          label="Vencimento"
          value={billingDate}
          onChangeText={(value) => setBillingDate(formatDateInput(value))}
          keyboardType="numeric"
          placeholder="10/06/2026"
          errorText={billingDateError}
          helpText="Use dia/mês/ano. O sistema gera a cobrança pelo mês informado nessa data."
        />
        <Field
          label="Valor"
          value={amount}
          onChangeText={(value) => setAmount(formatCurrencyInput(value))}
          keyboardType="numeric"
          placeholder="R$ 100,00"
          errorText={amountError}
        />

        <View style={styles.modeGroup}>
          <ModeButton
            title="Todas as casas"
            subtitle="Gera para quem ainda não tem Pix no mês."
            icon={Users}
            selected={mode === 'all'}
            onPress={() => setMode('all')}
          />
          <ModeButton
            title="Casa específica"
            subtitle="Permite cobrança complementar no mês."
            icon={Home}
            selected={mode === 'house'}
            onPress={() => setMode('house')}
          />
        </View>

        {mode === 'house' ? (
          <View style={styles.houseSection}>
            <Text style={styles.sectionTitle}>Selecionar casa</Text>
            {activeResidents.length ? (
              <View style={styles.houseList}>
                {activeResidents.map((resident) => {
                  const selected = selectedHouseId === resident.houseId;
                  const existingCharge = charges.find((charge) => charge.houseId === resident.houseId);
                  return (
                    <Pressable
                      key={resident.id}
                      accessibilityRole="button"
                      onPress={() => setSelectedHouseId(resident.houseId)}
                      style={[styles.houseOption, selected ? styles.houseOptionSelected : null]}
                    >
                      <View style={styles.houseInfo}>
                        <Text style={[styles.houseTitle, selected ? styles.houseTitleSelected : null]}>
                          Casa {String(resident.houseId).padStart(2, '0')}
                        </Text>
                        <Text style={styles.houseResident}>{resident.name}</Text>
                      </View>
                      {existingCharge ? <Badge status={existingCharge.status} /> : selected ? <CheckCircle2 color={colors.blue} size={20} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.muted}>Nenhum morador ativo cadastrado.</Text>
            )}
            {selectedResident ? (
              <Text style={styles.selectedHint}>
                Gerando uma cobrança para Casa {String(selectedResident.houseId).padStart(2, '0')} - {selectedResident.name}.
              </Text>
            ) : null}
          </View>
        ) : null}

        <Button
          title={busy ? 'Processando...' : mode === 'house' ? 'Gerar cobrança da casa' : 'Gerar cobranças do mês'}
          icon={Plus}
          onPress={generate}
          disabled={!canGenerate}
        />
        <Button title="Reconciliar com gateway" icon={RotateCw} variant="ghost" onPress={reconcile} disabled={busy} />
      </Card>
      <Card>
        <Row><Label>Geradas</Label><Value>{totals.generated}</Value></Row>
        <Row><Label>Pagas</Label><Value>{totals.paid}</Value></Row>
        <Row><Label>Pendentes</Label><Value>{totals.pending}</Value></Row>
        <Row><Label>Vencidas</Label><Value>{totals.overdue}</Value></Row>
        <Row><Label>Recebido</Label><Money value={totals.value} /></Row>
      </Card>
      {charges.map((charge) => (
        <PixChargeCard
          key={charge.id}
          charge={charge}
          canAdmin
          onOpen={() => navigation.navigate('PixPayment', { id: charge.id })}
          onRefresh={() => refresh(charge.id)}
          onCancel={() => cancel(charge.id)}
        />
      ))}
    </Screen>
  );
}

function ModeButton({
  title,
  subtitle,
  icon: Icon,
  selected,
  onPress
}: {
  title: string;
  subtitle: string;
  icon: typeof Users;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.modeButton, selected ? styles.modeButtonSelected : null]}>
      <Icon color={selected ? colors.blue : colors.muted} size={20} />
      <View style={styles.modeText}>
        <Text style={[styles.modeTitle, selected ? styles.modeTitleSelected : null]}>{title}</Text>
        <Text style={styles.modeSubtitle}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function formatBillingDate(month: string) {
  const [year, monthNumber] = month.split('-');
  return `10/${monthNumber}/${year}`;
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 12);
  const cents = digits ? Number(digits) / 100 : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents);
}

function amountFieldError(value: string) {
  const amount = parseAmount(value);
  if (!value.replace(/\D/g, '')) {
    return 'Informe o valor da cobrança.';
  }
  return amount > 0 ? '' : 'Informe um valor maior que zero.';
}

function formatDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function monthFromBillingDate(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) {
    return currentMonth();
  }
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}`;
}

function billingDateFieldError(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return 'Informe a data de vencimento.';
  }
  if (digits.length !== 8) {
    return 'Informe a data completa no formato dia/mês/ano.';
  }
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(year, month - 1, day);
  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return valid ? '' : 'Informe uma data válida.';
}

const styles = StyleSheet.create({
  modeGroup: {
    gap: spacing.sm
  },
  modeButton: {
    minHeight: 60,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  modeButtonSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  modeText: {
    flex: 1,
    gap: 2
  },
  modeTitle: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900'
  },
  modeTitleSelected: {
    color: colors.blue
  },
  modeSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16
  },
  houseSection: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  houseList: {
    gap: spacing.sm
  },
  houseOption: {
    minHeight: 56,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  houseOptionSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  houseInfo: {
    flex: 1,
    gap: 2
  },
  houseTitle: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900'
  },
  houseTitleSelected: {
    color: colors.blue
  },
  houseResident: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700'
  },
  selectedHint: {
    color: colors.blue,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '800'
  },
  muted: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  }
});
