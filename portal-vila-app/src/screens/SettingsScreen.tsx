import { useEffect, useState } from 'react';
import { RefreshCw, Save } from 'lucide-react-native';
import { Button, Card, Label, Row, Screen, Value, formatMoney, Facts } from '../components/ui';
import { FormField } from '../components/FormField';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { Alert } from '../utils/alert';
import { currencyFromNumber, finishCurrency, maskCurrency, parseCurrency } from '../utils/inputMasks';

type Settings = {
  villageName: string;
  monthlyAmount: number;
  paymentDueDay: number;
  gatewayProvider: string;
  budgetRequiredAbove?: number | null;
};

export function SettingsScreen() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const next = await api.settings() as Settings;
    setSettings(next);
    setLimit(currencyFromNumber(next.budgetRequiredAbove));
  }

  async function saveLimit(value: number | null) {
    setSaving(true);
    try {
      const next = await api.setBudgetRule(value) as Settings;
      setSettings(next);
      setLimit(currencyFromNumber(next.budgetRequiredAbove));
      Alert.alert(
        'Regra de orçamento',
        next.budgetRequiredAbove ? `Agora serviços acima de ${formatMoney(next.budgetRequiredAbove)} só começam com orçamento aprovado pelas casas.` : 'A exigência foi removida.'
      );
    } catch (err) {
      Alert.alert('Regra de orçamento', apiErrorMessage(err, 'Não consegui salvar.'));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Configurações" subtitle="Parâmetros da vila" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      <Card>
        <Facts
          items={[
            { label: 'Nome', value: settings?.villageName ?? '-' },
            { label: 'Mensalidade', value: formatMoney(settings?.monthlyAmount ?? 0) },
            { label: 'Vencimento', value: `dia ${settings?.paymentDueDay ?? '-'}` },
            { label: 'Gateway', value: settings?.gatewayProvider ?? '-' }
          ]}
        />
      </Card>

      <Card>
        <Value>Orçamento aprovado pelas casas</Value>
        <Label>
          {settings?.budgetRequiredAbove
            ? `Hoje, serviços acima de ${formatMoney(settings.budgetRequiredAbove)} só começam ou são pagos com um orçamento aprovado na votação.`
            : 'Hoje não há exigência: qualquer serviço pode começar sem votação. Defina um valor para exigir orçamento aprovado acima dele.'}
        </Label>
        {isAdmin ? (
          <>
            <FormField
              label="Exigir a partir de (R$)"
              value={limit}
              onChangeText={(value) => setLimit(maskCurrency(value))}
              onBlur={() => setLimit((value) => finishCurrency(value))}
              keyboardType="decimal-pad"
              placeholder="Ex.: 500,00"
              hint="Serviços de valor igual ou menor não precisam de votação."
            />
            <Row style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <Button
                title={saving ? 'Salvando...' : 'Salvar regra'}
                icon={Save}
                disabled={saving || !parseCurrency(limit)}
                onPress={() => saveLimit(parseCurrency(limit) ?? null)}
              />
              {settings?.budgetRequiredAbove ? <Button title="Não exigir" variant="ghost" disabled={saving} onPress={() => saveLimit(null)} /> : null}
            </Row>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}
