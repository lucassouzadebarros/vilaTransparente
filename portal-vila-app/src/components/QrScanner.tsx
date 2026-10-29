import { useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import { Camera, X } from 'lucide-react-native';
import { Button, Label } from './ui';
import { colors, spacing } from '../theme';
import { pickImage } from '../utils/filePicker';

/** A Pix QR code carries a "copia e cola" code (EMV), which always starts like this. */
export function isPixCode(text: string) {
  return text.trim().startsWith('000201');
}

/**
 * The text of the QR code in a picture from the gallery (a screenshot of the store's page, a photo of the card machine),
 * or null when there is none; undefined when the person closed the gallery.
 */
export async function readQrFromGallery(): Promise<string | null | undefined> {
  const picture = await pickImage('library');
  if (!picture) return undefined;
  const found = await scanFromURLAsync(picture.uri, ['qr']);
  return found[0]?.data ?? null;
}

/**
 * The back camera reading QR codes: the first one read is handed over once, and the camera closes with the reader. It
 * asks for the camera the first time, as the app already does for photos.
 */
export function QrScanner({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const done = useRef(false);

  if (!permission) {
    return <Label>Abrindo a câmera...</Label>;
  }
  if (!permission.granted) {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>
          {permission.canAskAgain
            ? 'Para ler o QR Code, o Portal precisa usar a câmera.'
            : 'A câmera está bloqueada para o Portal. Libere nas configurações do celular: Apps › Portal da Vila › Permissões.'}
        </Text>
        {permission.canAskAgain ? <Button title="Permitir a câmera" icon={Camera} onPress={requestPermission} /> : null}
        <Button title="Voltar" variant="ghost" onPress={onClose} />
      </View>
    );
  }
  return (
    <View style={styles.box}>
      <View style={styles.frame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(result) => {
            if (done.current) return;
            done.current = true;
            onResult(result.data);
          }}
        />
        <View pointerEvents="none" style={styles.target} />
      </View>
      <Label>Aponte para o QR Code do Pix, sem reflexo. Ele é lido sozinho.</Label>
      <Button title="Fechar a câmera" icon={X} variant="ghost" onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm
  },
  frame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000'
  },
  target: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    right: '15%',
    bottom: '15%',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)'
  },
  text: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20
  }
});
