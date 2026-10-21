import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { api } from '../services/api';

/**
 * Asks the phone for permission to show notices and tells the server where to send them. It does nothing on the web
 * and on a build without an EAS project id (Expo cannot create a push token without one), so it is safe to call on every
 * sign-in. Returns the token, or null when notices are not available.
 */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return null;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false })
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Avisos da vila',
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return null;
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.registerPushToken(token, Platform.OS);
  return token;
}
