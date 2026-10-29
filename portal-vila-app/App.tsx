import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertHost } from './src/components/AlertHost';
import { DemoBanner } from './src/components/DemoBanner';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { colors, isDark } from './src/theme';
import { useWideLayout } from './src/utils/layout';
import { setupWebAccessibility } from './src/utils/webAccessibility';
import { setupWebFont } from './src/utils/webFont';

setupWebAccessibility();
setupWebFont();

function Entry() {
  const { session } = useAuth();
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  // The side-menu layout is only for a signed-in session; the login stays a narrow card.
  const signedIn = Boolean(session) && !session?.mustChangePassword;
  const useWideFrame = wide && signedIn;
  // On Android the app is drawn from edge to edge, under the status bar and the phone's own buttons: the content starts
  // below the one and ends above the other. The bottom bar of tabs keeps itself clear of the buttons (see AppNavigator).
  const clearOfPhoneBars = Platform.OS === 'web' ? null : { paddingTop: insets.top, paddingBottom: signedIn && !wide ? 0 : insets.bottom };
  return (
    <View style={styles.host}>
      <View style={[styles.appFrame, useWideFrame ? styles.appFrameWide : null, clearOfPhoneBars]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {session?.demo ? <DemoBanner /> : null}
        {session?.mustChangePassword ? <ChangePasswordScreen forced /> : session ? <AppNavigator key={session.demo ? session.role : 'app'} /> : <LoginScreen />}
        <AlertHost />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Entry />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
    backgroundColor: colors.bg,
    ...(Platform.OS === 'web'
      ? {
          alignItems: 'center'
        }
      : null)
  },
  appFrame: {
    flex: 1,
    width: '100%',
    backgroundColor: colors.bg,
    ...(Platform.OS === 'web'
      ? {
          maxWidth: 430,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden'
        }
      : null)
  },
  appFrameWide: {
    maxWidth: 1280
  }
});
