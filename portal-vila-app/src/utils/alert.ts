import { Alert as NativeAlert, AlertButton, Platform } from 'react-native';

export type AlertDialog = {
  title: string;
  message?: string;
  buttons: AlertButton[];
};

type Listener = (dialog: AlertDialog) => void;

let listener: Listener | null = null;

/** The host component registers here so web dialogs can be drawn inside the app. */
export function subscribeToAlerts(next: Listener) {
  listener = next;
  return () => {
    if (listener === next) {
      listener = null;
    }
  };
}

/**
 * Drop-in for react-native's Alert. On the phone it is the native alert; on the web, react-native-web's Alert does
 * nothing, so messages and confirmations used to vanish. Here they open a dialog drawn by <AlertHost />.
 */
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') {
      NativeAlert.alert(title, message, buttons);
      return;
    }
    const dialog: AlertDialog = { title, message, buttons: buttons && buttons.length ? buttons : [{ text: 'OK' }] };
    if (listener) {
      listener(dialog);
    } else if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
  }
};
