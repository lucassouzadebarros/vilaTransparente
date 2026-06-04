import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { Copy, RefreshCw } from 'lucide-react-native';
import { ChargeStatusTimeline } from '../components/pix/ChargeStatusTimeline';
import { PixQrCodeBox } from '../components/pix/PixQrCodeBox';
import { Badge, Button, Card, Label, Money, Row, Screen, Value } from '../components/ui';
import { api } from '../services/api';
import { PixCharge } from '../types';
import { colors } from '../theme';

export function PixPaymentScreen() {
  const route = useRoute<any>();
  const id = Number(route.params?.id ?? 1);
  const [charge, setCharge] = useState<PixCharge | null>(null);

  async function load() {
    setCharge(await api.pixCharge(id));
  }

  async function copy() {
    if (charge?.pixCopyPaste) {
      await Clipboard.setStringAsync(charge.pixCopyPaste);
      Alert.alert('Pix', 'Codigo copiado.');
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  return (
    <Screen title="Pagar contribuição" subtitle={charge ? `${charge.houseLabel} - ${charge.month}` : ''} right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {charge ? (
        <>
          <Card>
            <Row>
              <Value>Cobranca Pix</Value>
              <Badge status={charge.status} />
            </Row>
            <Money value={charge.value} strong />
            <Row>
              <Label>Vencimento</Label>
              <Value>{charge.dueDate}</Value>
            </Row>
          </Card>
          <PixQrCodeBox base64={charge.qrCodeBase64} />
          <Card>
            <Label>Pix Copia e Cola</Label>
            <Text style={{ color: colors.ink }}>{charge.pixCopyPaste}</Text>
            <Button title="Copiar codigo Pix" icon={Copy} onPress={copy} />
          </Card>
          <Card>
            <ChargeStatusTimeline status={charge.status} paidAt={charge.paidAt} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
