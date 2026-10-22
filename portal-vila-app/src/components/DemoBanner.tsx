import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme';

/** Always on top during the demonstration, so nobody mistakes the example data for the real thing. */
export function DemoBanner() {
  const { session, enterDemo, logout } = useAuth();
  if (!session?.demo) {
    return null;
  }
  const asAdmin = session.role === 'ADMIN';
  return (
    <View style={styles.bar} role="status" accessibilityLiveRegion="polite">
      <Text style={styles.text}>
        <Text style={styles.strong}>Modo demonstração.</Text>
        {' '}Dados de exemplo, nada é salvo. Você está vendo como {asAdmin ? 'a administração' : 'um morador'}.
      </Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => enterDemo(asAdmin ? 'RESIDENT' : 'ADMIN')} style={styles.action}>
          <Text style={styles.actionText}>{asAdmin ? 'Ver como morador' : 'Ver como administração'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => logout()} style={styles.action}>
          <Text style={styles.actionText}>Sair da demonstração</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.amberSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.lg
  },
  text: {
    flexShrink: 1,
    color: colors.amber,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  strong: {
    fontWeight: '800'
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.md
  },
  action: {
    minHeight: 44,
    justifyContent: 'center'
  },
  actionText: {
    color: colors.amber,
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline'
  }
});
