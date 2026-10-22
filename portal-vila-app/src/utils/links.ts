import { Linking, Platform } from 'react-native';

/** Public pages of the app (they are static files in `public/`, served by the same site). */
export const SITE_URL = 'https://portal-vila-app.onrender.com';
export const PRIVACY_URL = `${SITE_URL}/privacidade.html`;
export const DELETE_ACCOUNT_URL = `${SITE_URL}/excluir-conta.html`;

/** Opens a page outside the app (a new tab on the web, the browser on the phone). */
export function openExternal(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener');
    return;
  }
  Linking.openURL(url).catch(() => undefined);
}
