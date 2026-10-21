import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Alert } from './alert';

/**
 * A photo or PDF chosen on the web or on the phone. On the web `file` is the browser File; on the phone only `uri`
 * (a file in the app cache) exists, and the upload sends it as { uri, name, type }.
 */
export type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  file?: File;
};

export class PermissionDeniedError extends Error {}

function fileName(candidate: string | null | undefined, fallback: string) {
  const clean = (candidate ?? '').trim();
  return clean || fallback;
}

/** A photo from the gallery or, with `camera`, a new one. Returns null when the person closes the picker. */
export async function pickImage(source: 'library' | 'camera'): Promise<PickedFile | null> {
  if (Platform.OS !== 'web') {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new PermissionDeniedError(
        source === 'camera'
          ? 'Sem permissão para usar a câmera. Libere nas configurações do aparelho.'
          : 'Sem permissão para ver as fotos. Libere nas configurações do aparelho.'
      );
    }
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    // Phone photos are large: re-encoding at 70% keeps them well under the upload limit and still readable.
    quality: 0.7,
    allowsEditing: false
  };
  const result = source === 'camera'
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) {
    return null;
  }
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: fileName(asset.fileName, `foto-${Date.now()}.jpg`),
    mimeType: asset.mimeType ?? 'image/jpeg',
    size: asset.fileSize,
    file: (asset as { file?: File }).file
  };
}

/** A PDF (budget, invoice or receipt). */
export async function pickPdf(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.length) {
    return null;
  }
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: fileName(asset.name, `documento-${Date.now()}.pdf`),
    mimeType: asset.mimeType ?? 'application/pdf',
    size: asset.size,
    file: asset.file
  };
}

/** What goes in the multipart body: the browser File on the web, the { uri, name, type } triple the phone expects. */
export function toFormPart(file: PickedFile): Blob {
  if (file.file) {
    return file.file;
  }
  return { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob;
}

/** Shows the chosen file before it is sent: a new tab on the web, the share sheet (with viewers) on the phone. */
export async function previewPickedFile(file: PickedFile) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.open(file.uri, '_blank');
    }
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: file.mimeType });
  }
}

export function formatFileSize(bytes?: number) {
  if (!bytes) {
    return '';
  }
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Asks where the photo comes from (camera or gallery), then opens that picker. Null when the person gives up. */
export function choosePhoto(): Promise<PickedFile | null> {
  return new Promise((resolve, reject) => {
    Alert.alert('Foto', 'De onde vem a foto?', [
      { text: 'Tirar foto', onPress: () => pickImage('camera').then(resolve, reject) },
      { text: 'Escolher da galeria', onPress: () => pickImage('library').then(resolve, reject) },
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) }
    ]);
  });
}

export function pickerErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Não consegui abrir o seletor de arquivos.';
}

/** "foto-123.jpg" -> "foto-123", for the document name field. */
export function nameWithoutExtension(name: string) {
  return name.replace(/\.[A-Za-z0-9]{2,5}$/, '');
}
