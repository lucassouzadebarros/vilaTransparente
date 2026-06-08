import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ChangePasswordScreen } from './src/screens/ChangePasswordScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { colors } from './src/theme';

function Entry() {
  const { session } = useAuth();
  return (
    <View style={styles.host}>
      <View style={styles.appFrame}>
        <StatusBar style="dark" />
        {session?.mustChangePassword ? <ChangePasswordScreen forced /> : session ? <AppNavigator /> : <LoginScreen />}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Entry />
    </AuthProvider>
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
  }
});
