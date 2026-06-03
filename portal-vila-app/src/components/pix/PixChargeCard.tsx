import { Copy, Eye, RefreshCw, XCircle } from 'lucide-react-native';
import { Badge, Button, Card, IconButton, Label, Money, Row, Value } from '../ui';
import { PixCharge } from '../../types';

export function PixChargeCard({
  charge,
  onOpen,
  onRefresh,
  onCancel,
  canAdmin
}: {
  charge: PixCharge;
  onOpen?: () => void;
  onRefresh?: () => void;
  onCancel?: () => void;
  canAdmin?: boolean;
}) {
  return (
    <Card>
      <Row>
        <Value>{charge.houseLabel}</Value>
        <Badge status={charge.status} />
      </Row>
      <Row>
        <Label>{charge.residentName ?? 'Morador'}</Label>
        <Money value={charge.value} />
      </Row>
      <Row>
        <Label>Vencimento</Label>
        <Value>{charge.dueDate}</Value>
      </Row>
      <Button title="Ver Pix" icon={Eye} onPress={onOpen} />
      {canAdmin ? (
        <Row>
          <IconButton icon={RefreshCw} label="Atualizar QR Code" onPress={onRefresh} />
          <IconButton icon={XCircle} label="Cancelar cobrança" danger onPress={onCancel} />
        </Row>
      ) : null}
    </Card>
  );
}

export function CopyPixAction({ onPress }: { onPress: () => void }) {
  return <Button title="Copiar Pix" icon={Copy} onPress={onPress} variant="ghost" />;
}
