import { CheckCircle2, Clock, ReceiptText } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

export function ChargeStatusTimeline({ status, paidAt }: { status: string; paidAt?: string }) {
  const paid = status === 'PAID';
  return (
    <View style={styles.timeline}>
      <View style={styles.item}>
        <ReceiptText color={colors.blue} size={17} />
        <Text style={styles.text}>Cobrança gerada</Text>
      </View>
      <View style={styles.item}>
        <Clock color={paid ? colors.green : colors.amber} size={17} />
        <Text style={styles.text}>{paid ? 'Webhook recebido' : 'Aguardando pagamento'}</Text>
      </View>
      <View style={styles.item}>
        <CheckCircle2 color={paid ? colors.green : colors.border} size={17} />
        <Text style={styles.text}>{paidAt ? `Pago em ${paidAt.slice(0, 10)}` : 'Confirmação automática'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: {
    gap: spacing.sm
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  text: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800'
  }
});
