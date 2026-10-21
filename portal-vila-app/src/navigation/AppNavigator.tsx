import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FileText, Home, MoreHorizontal, WalletCards, Wrench } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '../theme';
import { AdminPixChargesScreen } from '../screens/AdminPixChargesScreen';
import { AuditLogScreen } from '../screens/AuditLogScreen';
import { BudgetDetailsScreen } from '../screens/BudgetDetailsScreen';
import { BudgetFormScreen } from '../screens/BudgetFormScreen';
import { BudgetsScreen } from '../screens/BudgetsScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { CashBoxScreen } from '../screens/CashBoxScreen';
import { ContributionsScreen } from '../screens/ContributionsScreen';
import { DocumentsScreen } from '../screens/DocumentsScreen';
import { ExpensesScreen } from '../screens/ExpensesScreen';
import { FinishServiceScreen } from '../screens/FinishServiceScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { PixPaymentScreen } from '../screens/PixPaymentScreen';
import { ProblemDetailsScreen } from '../screens/ProblemDetailsScreen';
import { ProblemReportsScreen } from '../screens/ProblemReportsScreen';
import { ReleaseHouseScreen } from '../screens/ReleaseHouseScreen';
import { ReportProblemScreen } from '../screens/ReportProblemScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ResidentsScreen } from '../screens/ResidentsScreen';
import { ServiceDetailsScreen } from '../screens/ServiceDetailsScreen';
import { ServiceFormScreen } from '../screens/ServiceFormScreen';
import { ServicesScreen } from '../screens/ServicesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WebhookEventsScreen } from '../screens/WebhookEventsScreen';

/** The title of the browser tab and of the page for screen readers, by screen. */
const screenTitles: Record<string, string> = {
  Inicio: 'Início',
  Caixa: 'Caixa',
  Servicos: 'Serviços',
  Docs: 'Documentos',
  Mais: 'Menu',
  MoreMenu: 'Menu',
  ProblemReports: 'Problemas',
  ProblemDetails: 'Detalhe do problema',
  ReportProblem: 'Novo relato',
  Contributions: 'Contribuições',
  PixPayment: 'Pagamento Pix',
  Expenses: 'Despesas',
  Budgets: 'Orçamentos',
  BudgetForm: 'Orçamento',
  BudgetDetails: 'Detalhe do orçamento',
  ServiceForm: 'Serviço',
  ServiceDetails: 'Detalhe do serviço',
  FinishService: 'Finalizar serviço',
  Residents: 'Moradores',
  ReleaseHouse: 'Liberar casa',
  Reports: 'Prestação de contas',
  AdminPixCharges: 'Cobranças Pix',
  WebhookEvents: 'Logs do webhook',
  AuditLog: 'Histórico de alterações',
  Settings: 'Configurações',
  ChangePassword: 'Alterar senha'
};

/** A tab icon with a short bar above it on the current tab, so the place you are in does not depend on color alone. */
function tabIcon(Icon: LucideIcon) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <View style={{ alignItems: 'center' }}>
      <View style={{ position: 'absolute', top: -12, width: 28, height: 3, borderRadius: 2, backgroundColor: focused ? colors.blue : 'transparent' }} />
      <Icon color={color} size={size} />
    </View>
  );
}

const Tabs = createBottomTabNavigator();
const MoreStack = createNativeStackNavigator();
const hiddenTabOptions = {
  tabBarButton: () => null,
  tabBarItemStyle: { display: 'none' as const }
};

function MoreStackNavigator() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreMenu" component={MoreScreen} />
      <MoreStack.Screen name="ProblemReports" component={ProblemReportsScreen} />
      <MoreStack.Screen name="ProblemDetails" component={ProblemDetailsScreen} />
      <MoreStack.Screen name="ReportProblem" component={ReportProblemScreen} />
    </MoreStack.Navigator>
  );
}

function PortalTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 78,
          paddingTop: 6,
          paddingBottom: 12,
          borderTopColor: colors.border
        },
        tabBarActiveBackgroundColor: 'transparent',
        tabBarItemStyle: {
          height: 58,
          paddingVertical: 2,
          borderRadius: 12,
          marginHorizontal: 2
        },
        tabBarLabelStyle: {
          fontSize: 12,
          lineHeight: 16,
          marginTop: 1,
          paddingBottom: 2
        },
        tabBarIconStyle: {
          marginTop: 2
        }
      }}
    >
      <Tabs.Screen name="Inicio" component={HomeScreen} options={{ tabBarLabel: 'Início', tabBarIcon: tabIcon(Home) }} />
      <Tabs.Screen name="Caixa" component={CashBoxScreen} options={{ tabBarIcon: tabIcon(WalletCards) }} />
      <Tabs.Screen name="Servicos" component={ServicesScreen} options={{ tabBarLabel: 'Serviços', tabBarIcon: tabIcon(Wrench) }} />
      <Tabs.Screen name="Docs" component={DocumentsScreen} options={{ tabBarIcon: tabIcon(FileText) }} />
      <Tabs.Screen name="Mais" component={MoreStackNavigator} options={{ tabBarIcon: tabIcon(MoreHorizontal) }} />
      <Tabs.Screen name="Contributions" component={ContributionsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="PixPayment" component={PixPaymentScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="Expenses" component={ExpensesScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="Budgets" component={BudgetsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="BudgetForm" component={BudgetFormScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="BudgetDetails" component={BudgetDetailsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="ServiceForm" component={ServiceFormScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="ServiceDetails" component={ServiceDetailsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="FinishService" component={FinishServiceScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="Residents" component={ResidentsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="ReleaseHouse" component={ReleaseHouseScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="Reports" component={ReportsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="AdminPixCharges" component={AdminPixChargesScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="WebhookEvents" component={WebhookEventsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="AuditLog" component={AuditLogScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="ChangePassword" component={ChangePasswordScreen} options={hiddenTabOptions} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer
      documentTitle={{ formatter: (_options, route) => (route && screenTitles[route.name] ? `${screenTitles[route.name]} · Portal da Vila` : 'Portal da Vila') }}
    >
      <PortalTabs />
    </NavigationContainer>
  );
}
