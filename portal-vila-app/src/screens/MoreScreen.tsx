import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { BarChart3, ChevronDown, ClipboardList, FileClock, ListChecks, LockOpen, LogOut, ReceiptText, Settings, Users, WalletCards } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme';

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { logout, isAdmin, session } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const firstName = session?.name?.split(' ')[0] ?? 'Usuario';

  return (
    <Screen title="Mais" subtitle={session?.name}>
      <View style={styles.userArea}>
        <Pressable style={styles.greeting} onPress={() => setUserMenuOpen((current) => !current)}>
          <Text style={styles.greetingText}>Ola, {firstName}</Text>
          <ChevronDown color={colors.muted} size={16} />
        </Pressable>
        {userMenuOpen ? (
          <View style={styles.userMenu}>
            <Pressable style={styles.logoutMenuItem} onPress={logout}>
              <LogOut color={colors.red} size={18} />
              <Text style={styles.logoutMenuText}>Sair</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <Card>
        <Value>Menu</Value>
        <Button title="Contribuicoes" icon={ListChecks} variant="ghost" onPress={() => navigation.navigate('Contributions')} />
        <Button title="Despesas" icon={ReceiptText} variant="ghost" onPress={() => navigation.navigate('Expenses')} />
        <Button title="Orcamentos" icon={ClipboardList} variant="ghost" onPress={() => navigation.navigate('Budgets')} />
        <Button title="Relatorios" icon={BarChart3} variant="ghost" onPress={() => navigation.navigate('Reports')} />
        {isAdmin ? <Button title="Moradores" icon={Users} variant="ghost" onPress={() => navigation.navigate('Residents')} /> : null}
        {isAdmin ? <Button title="Liberar casa" icon={LockOpen} variant="ghost" onPress={() => navigation.navigate('ReleaseHouse')} /> : null}
        {isAdmin ? <Button title="Cobrancas Pix" icon={WalletCards} variant="ghost" onPress={() => navigation.navigate('AdminPixCharges')} /> : null}
        {isAdmin ? <Button title="Logs Webhook" icon={FileClock} variant="ghost" onPress={() => navigation.navigate('WebhookEvents')} /> : null}
        {isAdmin ? <Button title="Configuracoes" icon={Settings} variant="ghost" onPress={() => navigation.navigate('Settings')} /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  userArea: {
    alignSelf: 'flex-start',
    position: 'relative',
    zIndex: 5
  },
  greeting: {
    alignSelf: 'flex-start',
    minHeight: 38,
    minWidth: 130,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  greetingText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 13
  },
  userMenu: {
    position: 'absolute',
    top: 44,
    left: 0,
    minWidth: 130,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4
  },
  logoutMenuItem: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  logoutMenuText: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '900'
  }
});
