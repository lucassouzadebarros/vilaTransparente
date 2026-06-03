import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react-native';
import { Button, Card, Label, Row, Screen, Value, formatMoney } from '../components/ui';
import { api } from '../services/api';

type Settings = {
  villageName: string;
  monthlyAmount: number;
  paymentDueDay: number;
  gatewayProvider: string;
};

export function SettingsScreen() {
  const [settings, setSettings] = useState<Settings | null>(null);

  async function load() {
    setSettings(await api.settings() as Settings);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Configuracoes" subtitle="Parametros da vila" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      <Card>
        <Row><Label>Nome</Label><Value>{settings?.villageName}</Value></Row>
        <Row><Label>Mensalidade</Label><Value>{formatMoney(settings?.monthlyAmount ?? 0)}</Value></Row>
        <Row><Label>Vencimento</Label><Value>dia {settings?.paymentDueDay}</Value></Row>
        <Row><Label>Gateway</Label><Value>{settings?.gatewayProvider}</Value></Row>
      </Card>
    </Screen>
  );
}
