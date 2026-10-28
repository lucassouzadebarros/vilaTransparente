import { useNavigation } from '@react-navigation/native';
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  ClipboardList,
  FileClock,
  HandCoins,
  History,
  KeyRound,
  ListChecks,
  LockOpen,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserX,
  Users,
  WalletCards
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { colors, spacing } from '../theme';
import { openExternal, PRIVACY_URL } from '../utils/links';

type MenuItem = {
  title: string;
  description: string;
  icon: LucideIcon;
  route: string;
  /** An address outside the app: the row opens it instead of a screen. */
  url?: string;
  adminOnly?: boolean;
  /** The administration and the síndico. */
  managersOnly?: boolean;
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
    title: 'Excluir minha conta',
    description: 'Apague seus dados pessoais do portal.',
    icon: UserX,
    route: 'DeleteAccount'
  },
  {
    title: 'Política de privacidade',
    description: 'Quais dados guardamos e seus direitos.',
    icon: ShieldCheck,
    route: 'PrivacyPolicy',
    url: PRIVACY_URL
  },
  {
    title: 'Contribuições',
    description: 'Contribuições e Pix de cada casa no mês.',
    icon: ListChecks,
    route: 'Contributions'
  },
  {
    title: 'Despesas',
    description: 'Saídas da caixinha, com os comprovantes.',
    icon: ReceiptText,
    route: 'Expenses'
  },
  {
    title: 'Contas a pagar',
    description: 'Aprove e registre o pagamento das contas do condomínio.',
    icon: HandCoins,
    route: 'Payables',
    managersOnly: true
  },
  {
    title: 'Orçamentos',
    description: 'Vote e acompanhe os orçamentos.',
    icon: ClipboardList,
    route: 'Budgets'
  },
  {
    title: 'Prestação de contas',
    description: 'Entradas e saídas de cada mês, com planilha e PDF.',
    icon: BarChart3,
    route: 'Reports'
  },
  {
    title: 'Moradores',
    description: 'Cadastre e edite os moradores de cada casa.',
    icon: Users,
    route: 'Residents',
    adminOnly: true
  },
  {
    title: 'Liberar casa',
    description: 'Libere uma casa quando o morador mudar.',
    icon: LockOpen,
    route: 'ReleaseHouse',
    adminOnly: true
  },
  {
    title: 'Cobranças Pix',
    description: 'Gere e acompanhe as cobranças Pix do mês.',
    icon: WalletCards,
    route: 'AdminPixCharges',
    adminOnly: true
  },
  {
    title: 'Logs Webhook',
    description: 'Pagamentos avisados pelo Asaas.',
    icon: FileClock,
    route: 'WebhookEvents',
    adminOnly: true
  },
  {
    title: 'Histórico de alterações',
    description: 'Quem mexeu em dinheiro e acessos, e quando.',
    icon: History,
    route: 'AuditLog',
    adminOnly: true
  },
  {
    title: 'Problemas do condomínio',
    description: 'Relate um problema e acompanhe os relatos.',
    icon: AlertTriangle,
    route: 'ProblemReports'
  },
  {
    title: 'Configurações',
    description: 'Valor, vencimento e dados do condomínio.',
    icon: Settings,
    route: 'Settings',
    adminOnly: true
  }
];

/** The menu is read in groups, so a long list does not have to be scanned from top to bottom. */
const menuGroups: Array<{ title: string; routes: string[] }> = [
  { title: 'Financeiro', routes: ['Contributions', 'Expenses', 'Payables', 'Reports', 'AdminPixCharges'] },
  { title: 'Demandas', routes: ['ProblemReports', 'Budgets'] },
  { title: 'Moradores', routes: ['Residents', 'ReleaseHouse'] },
  { title: 'Administração', routes: ['Settings', 'AuditLog', 'WebhookEvents'] },
  { title: 'Minha conta', routes: ['ChangePassword', 'DeleteAccount', 'PrivacyPolicy'] }
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { isAdmin, canManageBudgets } = useAuth();
  const { width } = useWindowDimensions();
  const compact = Math.min(width, 430) < 560;
  const visibleItems = menuItems.filter((item) => (!item.adminOnly || isAdmin) && (!item.managersOnly || canManageBudgets));

  return (
    <ScrollView role="main" style={styles.screen} contentContainerStyle={[styles.content, compact ? styles.contentCompact : null]}>
      <SoftBackdrop compact />
      <View style={[styles.menuCard, compact ? styles.menuCardCompact : null]}>
        <View style={styles.header}>
          <Text role="heading" style={[styles.title, compact ? styles.titleCompact : null]}>Menu</Text>
          <Text style={[styles.subtitle, compact ? styles.subtitleCompact : null]}>Acesse as principais funcionalidades do sistema.</Text>
        </View>
        {menuGroups.map((group) => {
          const items = group.routes
            .map((route) => visibleItems.find((item) => item.route === route))
            .filter((item): item is MenuItem => Boolean(item));
          if (items.length === 0) {
            return null;
          }
          return (
            <View key={group.title} style={styles.group}>
              <Text role="heading" aria-level={2} style={styles.groupTitle}>
                {group.title}
              </Text>
              <View style={styles.list}>
                {items.map((item, index) => (
                  <MenuRow
                    key={item.route}
                    item={item}
                    first={index === 0}
                    last={index === items.length - 1}
                    compact={compact}
                    onPress={() => (item.url ? openExternal(item.url) : navigation.navigate(item.route))}
                  />
                ))}
              </View>
            </View>
          );
        })}
        {Platform.OS === 'web' ? (
          <View style={styles.group}>
            <Text role="heading" aria-level={2} style={styles.groupTitle}>
              Aparência
            </Text>
            <ThemeSwitch />
          </View>
        ) : null}
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
      <View style={[styles.iconBox, compact ? styles.iconBoxCompact : null, { backgroundColor: 'transparent' }]}>
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
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 118,
    position: 'relative'
  },
  contentCompact: {
    paddingHorizontal: 16,
    paddingTop: 24
  },
  menuCard: {
    width: '100%',
    padding: 0,
    gap: 24,
    shadowColor: colors.ink,
    shadowOpacity: 0,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0,
    zIndex: 1
  },
  menuCardCompact: {
    padding: 0,
    gap: 20
  },
  header: {
    gap: spacing.xs
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: 0
  },
  titleCompact: {
    fontSize: 26,
    lineHeight: 32
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
  },
  subtitleCompact: {
    fontSize: 14,
    lineHeight: 20
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface
  },
  menuRow: {
    minHeight: 72,
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
  group: {
    gap: 8
  },
  groupTitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 4
  },
  rowPressed: {
    backgroundColor: colors.blueSoft
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  iconBoxCompact: {
    width: 32,
    height: 32,
    borderRadius: 0
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
    fontWeight: '700'
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
