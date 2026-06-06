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
    minHeight: 204,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowColor: '#1D2939',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  qr: {
    width: 156,
    height: 156
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  }
});
