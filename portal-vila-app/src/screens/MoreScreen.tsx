import { useNavigation } from '@react-navigation/native';
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  ClipboardList,
  FileClock,
  KeyRound,
  ListChecks,
  LockOpen,
  ReceiptText,
  Settings,
  Users,
  WalletCards
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../theme';

type MenuItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  route: string;
  adminOnly?: boolean;
  danger?: boolean;
};

const menuItems: MenuItem[] = [
  {
    title: 'Alterar senha',
    description: 'Atualize sua senha de acesso ao sistema.',
    icon: KeyRound,
    route: 'ChangePassword'
  },
  {
    title: 'Contribuições',
    description: 'Visualize e gerencie suas contribuições.',
    icon: ListChecks,
    route: 'Contributions'
  },
  {
    title: 'Despesas',
    description: 'Acompanhe e gerencie suas despesas.',
    icon: ReceiptText,
    route: 'Expenses'
  },
  {
    title: 'Orçamentos',
    description: 'Crie e acompanhe seus orçamentos.',
    icon: ClipboardList,
    route: 'Budgets'
  },
  {
    title: 'Relatórios',
    description: 'Acesse seus relatórios e indicadores.',
    icon: BarChart3,
    route: 'Reports'
  },
  {
    title: 'Moradores',
    description: 'Gerencie os moradores da sua casa.',
    icon: Users,
    route: 'Residents',
    adminOnly: true
  },
  {
    title: 'Liberar casa',
    description: 'Libere o acesso da sua casa para outros usuários.',
    icon: LockOpen,
    route: 'ReleaseHouse',
    adminOnly: true
  },
  {
    title: 'Cobranças Pix',
    description: 'Gerencie suas cobranças via Pix.',
    icon: WalletCards,
    route: 'AdminPixCharges',
    adminOnly: true
  },
  {
    title: 'Logs Webhook',
    description: 'Visualize os logs de integração do sistema.',
    icon: FileClock,
    route: 'WebhookEvents',
    adminOnly: true
  },
  {
    title: 'Relatar problema',
    description: 'Informe um problema ou envie um feedback.',
    icon: AlertTriangle,
    route: 'ProblemReports',
    danger: true
  },
  {
    title: 'Configurações',
    description: 'Ajuste as preferências do sistema.',
    icon: Settings,
    route: 'Settings',
    adminOnly: true
  }
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const compact = Math.min(width, 430) < 560;
  const visibleItems = menuItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, compact ? styles.contentCompact : null]}>
      <SoftBackdrop compact />
      <View style={[styles.menuCard, compact ? styles.menuCardCompact : null]}>
        <View style={styles.header}>
          <Text style={[styles.title, compact ? styles.titleCompact : null]}>Menu</Text>
          <Text style={[styles.subtitle, compact ? styles.subtitleCompact : null]}>Acesse as principais funcionalidades do sistema.</Text>
        </View>
        <View style={styles.list}>
          {visibleItems.map((item, index) => (
            <MenuRow
              key={item.route}
              item={item}
              first={index === 0}
              last={index === visibleItems.length - 1}
              compact={compact}
              onPress={() => navigation.navigate(item.route)}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function MenuRow({
  item,
  first,
  last,
  compact,
  onPress
}: {
  item: MenuItem;
  first: boolean;
  last: boolean;
  compact: boolean;
  onPress: () => void;
}) {
  const Icon = item.icon;
  const color = item.danger ? colors.red : colors.blue;
  const softColor = item.danger ? colors.redSoft : colors.blueSoft;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        compact ? styles.menuRowCompact : null,
        first ? styles.firstRow : null,
        last ? styles.lastRow : null,
        pressed ? styles.rowPressed : null
      ]}
    >
      <View style={[styles.iconBox, compact ? styles.iconBoxCompact : null, { backgroundColor: softColor }]}>
        <Icon color={color} size={compact ? 20 : 24} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, compact ? styles.rowTitleCompact : null, item.danger ? styles.dangerText : null]}>{item.title}</Text>
        <Text style={[styles.rowDescription, compact ? styles.rowDescriptionCompact : null]}>{item.description}</Text>
      </View>
      <ChevronRight color={color} size={compact ? 20 : 25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 118,
    position: 'relative'
  },
  contentCompact: {
    paddingHorizontal: 10,
    paddingTop: 12
  },
  menuCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 30,
    gap: 24,
    shadowColor: '#163052',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    zIndex: 1
  },
  menuCardCompact: {
    padding: 12,
    gap: 12
  },
  header: {
    gap: spacing.xs
  },
  title: {
    color: colors.ink,
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: 0
  },
  titleCompact: {
    fontSize: 30,
    lineHeight: 36
  },
  subtitle: {
    color: colors.muted,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600'
  },
  subtitleCompact: {
    fontSize: 15,
    lineHeight: 21
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface
  },
  menuRow: {
    minHeight: 102,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 22,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24
  },
  menuRowCompact: {
    minHeight: 76,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 12
  },
  firstRow: {
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8
  },
  lastRow: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8
  },
  rowPressed: {
    backgroundColor: '#F8FBFF'
  },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  iconBoxCompact: {
    width: 44,
    height: 44,
    borderRadius: 10
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '900'
  },
  rowTitleCompact: {
    fontSize: 14,
    lineHeight: 18
  },
  dangerText: {
    color: colors.red
  },
  rowDescription: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600'
  },
  rowDescriptionCompact: {
    fontSize: 12,
    lineHeight: 16
  }
});
