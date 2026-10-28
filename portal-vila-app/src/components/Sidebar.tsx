import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NavigationContainerRefWithCurrent, ParamListBase } from '@react-navigation/native';
import {
  BarChart3,
  ClipboardList,
  FileClock,
  FileText,
  HandCoins,
  History,
  Home,
  KeyRound,
  ListChecks,
  LockOpen,
  LogOut,
  ReceiptText,
  Settings,
  Shield,
  TriangleAlert,
  UserX,
  Users,
  WalletCards,
  Wrench
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, TOUCH_TARGET } from '../theme';
import { ThemeSwitch } from './ThemeSwitch';

type Entry = {
  label: string;
  icon: LucideIcon;
  /** Where the entry goes. A screen inside the "Mais" stack is opened through it. */
  route: string;
  inMore?: boolean;
  /** Screens that count as being "in" this entry, so it stays marked while you move around inside it. */
  match: string[];
  adminOnly?: boolean;
  /** The administration and the síndico. */
  managersOnly?: boolean;
};

type Section = { title?: string; entries: Entry[] };

const sections: Section[] = [
  {
    entries: [
      { label: 'Início', icon: Home, route: 'Inicio', match: ['Inicio'] },
      { label: 'Caixa', icon: WalletCards, route: 'Caixa', match: ['Caixa'] },
      { label: 'Documentos', icon: FileText, route: 'Docs', match: ['Docs'] }
    ]
  },
  {
    title: 'Demandas',
    entries: [
      { label: 'Problemas', icon: TriangleAlert, route: 'ProblemReports', inMore: true, match: ['ProblemReports', 'ProblemDetails', 'ReportProblem'] },
      { label: 'Orçamentos', icon: ClipboardList, route: 'Budgets', match: ['Budgets', 'BudgetDetails', 'BudgetForm'] },
      { label: 'Serviços', icon: Wrench, route: 'Servicos', match: ['Servicos', 'ServiceDetails', 'ServiceForm', 'FinishService'] }
    ]
  },
  {
    title: 'Financeiro',
    entries: [
      { label: 'Contribuições', icon: ListChecks, route: 'Contributions', match: ['Contributions', 'PixPayment'] },
      { label: 'Despesas', icon: ReceiptText, route: 'Expenses', match: ['Expenses'] },
      { label: 'Contas a pagar', icon: HandCoins, route: 'Payables', match: ['Payables'], managersOnly: true },
      { label: 'Prestação de contas', icon: BarChart3, route: 'Reports', match: ['Reports'] },
      { label: 'Cobranças Pix', icon: WalletCards, route: 'AdminPixCharges', match: ['AdminPixCharges'], adminOnly: true }
    ]
  },
  {
    title: 'Moradores',
    entries: [
      { label: 'Moradores', icon: Users, route: 'Residents', match: ['Residents'], adminOnly: true },
      { label: 'Liberar casa', icon: LockOpen, route: 'ReleaseHouse', match: ['ReleaseHouse'], adminOnly: true }
    ]
  },
  {
    title: 'Administração',
    entries: [
      { label: 'Configurações', icon: Settings, route: 'Settings', match: ['Settings'], adminOnly: true },
      { label: 'Histórico de alterações', icon: History, route: 'AuditLog', match: ['AuditLog'], adminOnly: true },
      { label: 'Logs do webhook', icon: FileClock, route: 'WebhookEvents', match: ['WebhookEvents'], adminOnly: true }
    ]
  },
  {
    title: 'Minha conta',
    entries: [
      { label: 'Alterar senha', icon: KeyRound, route: 'ChangePassword', match: ['ChangePassword'] },
      { label: 'Excluir minha conta', icon: UserX, route: 'DeleteAccount', match: ['DeleteAccount'] }
    ]
  }
];

type Props = {
  navigationRef: NavigationContainerRefWithCurrent<ParamListBase>;
  /** Name of the screen being shown, used to mark the entry the reader is in. */
  current: string;
};

/** The side menu of the wide (computer) layout: the same places as the bottom bar and the Menu, always in view. */
export function Sidebar({ navigationRef, current }: Props) {
  const { isAdmin, canManageBudgets, logout } = useAuth();

  function open(entry: Entry) {
    if (!navigationRef.isReady()) {
      return;
    }
    const navigate = navigationRef.navigate as unknown as (name: string, params?: object) => void;
    if (entry.inMore) {
      navigate('Mais', { screen: entry.route });
    } else {
      navigate(entry.route);
    }
  }

  return (
    <View role="navigation" aria-label="Menu principal" style={styles.bar}>
      <View style={styles.brand}>
        <Shield color={colors.blue} size={26} strokeWidth={2} />
        <Text style={styles.brandText}>Portal da Vila</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {sections.map((section, index) => {
          const entries = section.entries.filter((entry) => (!entry.adminOnly || isAdmin) && (!entry.managersOnly || canManageBudgets));
          if (entries.length === 0) {
            return null;
          }
          return (
            <View key={section.title ?? `section-${index}`} style={styles.section}>
              {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
              {entries.map((entry) => {
                const active = entry.match.includes(current);
                const Icon = entry.icon;
                return (
                  <Pressable
                    key={entry.route}
                    accessibilityRole="link"
                    accessibilityLabel={entry.label}
                    {...(active ? ({ 'aria-current': 'page' } as object) : null)}
                    onPress={() => open(entry)}
                    style={({ pressed }) => [styles.item, active ? styles.itemActive : null, pressed && !active ? styles.itemPressed : null]}
                  >
                    <Icon color={active ? colors.blue : colors.muted} size={18} />
                    <Text style={[styles.itemText, active ? styles.itemTextActive : null]}>{entry.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.theme}>
        <Text style={styles.sectionTitle}>Aparência</Text>
        <ThemeSwitch />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Sair" onPress={logout} style={({ pressed }) => [styles.item, styles.logout, pressed ? styles.itemPressed : null]}>
        <LogOut color={colors.muted} size={18} />
        <Text style={styles.itemText}>Sair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: 264,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.md
  },
  brandText: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.2
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.md
  },
  section: {
    gap: 2
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
    paddingBottom: 4
  },
  item: {
    minHeight: 36,
    borderRadius: radius.control,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  itemActive: {
    backgroundColor: colors.blueSoft
  },
  itemPressed: {
    backgroundColor: colors.pressed
  },
  itemText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
  },
  itemTextActive: {
    color: colors.blue,
    fontWeight: '700'
  },
  theme: {
    gap: spacing.xs,
    paddingTop: spacing.sm
  },
  logout: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderRadius: 0,
    marginTop: spacing.sm,
    paddingTop: spacing.sm
  }
});
