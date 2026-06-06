import { StyleSheet, View } from 'react-native';
import { Copy, Eye, Home, RefreshCw, XCircle } from 'lucide-react-native';
import { Badge, Button, Card, IconButton, Label, Money, Row, Value } from '../ui';
import { PixCharge } from '../../types';
import { colors, spacing } from '../../theme';

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
      <View style={styles.header}>
        <View style={styles.iconBox}>
          <Home color={colors.blue} size={22} />
        </View>
        <View style={styles.info}>
          <Row>
            <Value>{charge.houseLabel}</Value>
            <Badge status={charge.status} />
          </Row>
          <Label>{charge.residentName ?? 'Morador'}</Label>
          <Row>
            <Label>Vencimento {charge.dueDate}</Label>
            <Money value={charge.value} />
          </Row>
        </View>
      </View>
      <Button title="Ver Pix" icon={Eye} onPress={onOpen} variant="ghost" />
      {canAdmin ? (
        <Row style={styles.adminActions}>
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  info: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0
  },
  adminActions: {
    justifyContent: 'flex-start'
  }
});
