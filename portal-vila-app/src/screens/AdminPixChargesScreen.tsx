import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Plus, RefreshCw, RotateCw } from 'lucide-react-native';
import { PixChargeCard } from '../components/pix/PixChargeCard';
import { Button, Card, Field, Label, Money, Row, Screen, Value } from '../components/ui';
import { api } from '../services/api';
import { PixCharge } from '../types';
import { currentMonth } from '../utils/month';

function actionErrorMessage(error: unknown) {
  const response = (error as { response?: { status?: number } }).response;
  if (response?.status === 401 || response?.status === 403) {
    return 'Sua sessao nao tem permissao para essa acao. Saia e entre novamente como admin.';
  }
  return 'Nao consegui falar com a API agora. Confira se o backend esta rodando e se o app esta apontando para a URL correta.';
}

export function AdminPixChargesScreen() {
  const navigation = useNavigation<any>();
  const [month, setMonth] = useState(currentMonth());
  const [amount, setAmount] = useState('100');
  const [charges, setCharges] = useState<PixCharge[]>([]);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => ({
    paid: charges.filter((charge) => charge.status === 'PAID').length,
    pending: charges.filter((charge) => charge.status === 'PENDING').length,
    overdue: charges.filter((charge) => charge.status === 'OVERDUE').length,
    generated: charges.length,
    value: charges.reduce((sum, charge) => sum + (charge.status === 'PAID' ? charge.value : 0), 0)
  }), [charges]);

  async function load() {
    setCharges(await api.pixCharges(month));
  }

  async function generate() {
    setBusy(true);
    try {
      const generated = await api.generatePixCharges(month, Number(amount.replace(',', '.')));
      setCharges(generated);
      Alert.alert('Pix', 'Cobrancas do mes geradas no Asaas Sandbox.');
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
      Alert.alert('Pix', 'Cobrancas reconciliadas com o gateway.');
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
    <Screen title="Admin Pix" subtitle="Cobrancas do mes" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      <Card>
        <Field label="Mes" value={month} onChangeText={setMonth} />
        <Field label="Valor padrao" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <Button title={busy ? 'Processando...' : 'Gerar cobrancas do mes'} icon={Plus} onPress={generate} disabled={busy} />
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
