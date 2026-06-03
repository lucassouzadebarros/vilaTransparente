import { Image, StyleSheet, Text, View } from 'react-native';
import { QrCode } from 'lucide-react-native';
import { colors, spacing } from '../../theme';

export function PixQrCodeBox({ base64 }: { base64?: string }) {
  return (
    <View style={styles.box}>
      {base64 ? (
        <Image source={{ uri: `data:image/png;base64,${base64}` }} style={styles.qr} resizeMode="contain" />
      ) : (
        <QrCode color={colors.muted} size={76} />
      )}
      <Text style={styles.label}>QR Code Pix</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 220,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FDFEFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm
  },
  qr: {
    width: 168,
    height: 168
  },
  label: {
    color: colors.muted,
    fontWeight: '700'
  }
});
