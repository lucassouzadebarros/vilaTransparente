import { useState } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, ParamListBase, StackActions, createNavigationContainerRef, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { BottomTabBar, BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ClipboardList, FileText, Home, MoreHorizontal, WalletCards } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Sidebar } from '../components/Sidebar';
import { colors, isDark } from '../theme';
import { useWideLayout } from '../utils/layout';
import { AdminPixChargesScreen } from '../screens/AdminPixChargesScreen';
import { AuditLogScreen } from '../screens/AuditLogScreen';
import { BudgetDetailsScreen } from '../screens/BudgetDetailsScreen';
import { BudgetFormScreen } from '../screens/BudgetFormScreen';
import { BudgetsScreen } from '../screens/BudgetsScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { DeleteAccountScreen } from '../screens/DeleteAccountScreen';
import { CashBoxScreen } from '../screens/CashBoxScreen';
import { ContributionsScreen } from '../screens/ContributionsScreen';
import { DocumentsScreen } from '../screens/DocumentsScreen';
import { ExpensesScreen } from '../screens/ExpensesScreen';
import { FinishServiceScreen } from '../screens/FinishServiceScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { PayablesScreen } from '../screens/PayablesScreen';
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
  ChangePassword: 'Alterar senha',
  DeleteAccount: 'Excluir conta'
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

/** Screens that are not a tab of their own still belong to one, so the bar always shows where you are. */
const tabOf: Record<string, string> = {
  Budgets: 'Servicos',
  BudgetForm: 'Servicos',
  BudgetDetails: 'Servicos',
  ServiceForm: 'Servicos',
  ServiceDetails: 'Servicos',
  FinishService: 'Servicos',
  ProblemReports: 'Servicos',
  ProblemDetails: 'Servicos',
  ReportProblem: 'Servicos',
  Contributions: 'Caixa',
  PixPayment: 'Caixa',
  Expenses: 'Caixa',
  Reports: 'Caixa',
  AdminPixCharges: 'Caixa',
  Residents: 'Mais',
  ReleaseHouse: 'Mais',
  WebhookEvents: 'Mais',
  AuditLog: 'Mais',
  Settings: 'Mais',
  ChangePassword: 'Mais',
  DeleteAccount: 'Mais'
};

/** The bottom bar, with the tab of the current screen marked even when the screen is not one of the five. */
function PortalTabBar(props: BottomTabBarProps) {
  const current = props.state.routes[props.state.index];
  // The "Mais" tab holds its own stack: Problemas lives there but belongs to the Demandas tab.
  const name = current.name === 'Mais' ? getFocusedRouteNameFromRoute(current) ?? 'MoreMenu' : current.name;
  const tab = tabOf[name];
  const index = tab ? props.state.routes.findIndex((route) => route.name === tab) : props.state.index;
  const shown = index >= 0 ? index : props.state.index;
  // The bar shows the tab a hidden screen belongs to as the open one, so a tap on it used to do nothing: the person was
  // stuck on the Pix screen, or on Problemas inside "Mais", with no way back by the bar. A tap now goes to that tab's first screen.
  const navigation = {
    ...props.navigation,
    emit: (event: { type: string; target?: string }) => {
      const result = (props.navigation.emit as (event: unknown) => { defaultPrevented: boolean })(event);
      if (event.type === 'tabPress' && !result.defaultPrevented) {
        const pressed = props.state.routes.find((route) => route.key === event.target);
        const shownRoute = props.state.routes[shown];
        if (pressed) {
          // "Mais" always opens its menu: the stack inside it remembers the last screen (Problemas, for one) and used to bring it back.
          // Opened straight on Problemas the stack has that screen alone, with no menu under it: then the menu takes its place.
          const stack = navigationRef.getRootState()?.routes.find((route) => route.name === 'Mais')?.state as
            | { key?: string; index?: number; routes?: { name: string }[] }
            | undefined;
          const top = stack?.routes?.[stack.index ?? 0];
          if (pressed.name === 'Mais' && stack?.key && top && top.name !== 'MoreMenu') {
            const hasMenu = stack.routes?.some((route) => route.name === 'MoreMenu');
            navigationRef.dispatch({ ...(hasMenu ? StackActions.popToTop() : StackActions.replace('MoreMenu')), target: stack.key });
          }
          if (pressed.key === shownRoute.key && pressed.key !== current.key) {
            (props.navigation.navigate as (name: string) => void)(pressed.name);
          }
        }
      }
      return result;
    }
  };
  return <BottomTabBar {...props} navigation={navigation as unknown as BottomTabBarProps['navigation']} state={{ ...props.state, index: shown }} />;
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

const navigationRef = createNavigationContainerRef<ParamListBase>();

/** The navigator's own colors (screen background, bottom bar) follow the app palette, light or dark. */
const baseTheme = isDark ? DarkTheme : DefaultTheme;
const navigationTheme = {
  ...baseTheme,
  colors: { ...baseTheme.colors, primary: colors.blue, background: colors.bg, card: colors.surface, text: colors.ink, border: colors.border, notification: colors.red }
};

function PortalTabs({ wide }: { wide: boolean }) {
  return (
    <Tabs.Navigator
      // On a wide window the side menu replaces the bottom bar.
      tabBar={(props) => (wide ? null : <PortalTabBar {...props} />)}
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
        // No side padding or margin: on a 360px phone each of the five tabs has 72px, and "Demandas" was cut to "Deman...".
        tabBarItemStyle: {
          height: 58,
          paddingVertical: 2,
          paddingHorizontal: 0,
          borderRadius: 12,
          marginHorizontal: 0
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
      <Tabs.Screen name="Servicos" component={ServicesScreen} options={{ tabBarLabel: 'Demandas', tabBarIcon: tabIcon(ClipboardList) }} />
      <Tabs.Screen name="Docs" component={DocumentsScreen} options={{ tabBarIcon: tabIcon(FileText) }} />
      <Tabs.Screen name="Mais" component={MoreStackNavigator} options={{ tabBarIcon: tabIcon(MoreHorizontal) }} />
      <Tabs.Screen name="Contributions" component={ContributionsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="PixPayment" component={PixPaymentScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="Expenses" component={ExpensesScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="Payables" component={PayablesScreen} options={hiddenTabOptions} />
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
      <Tabs.Screen name="DeleteAccount" component={DeleteAccountScreen} options={hiddenTabOptions} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const wide = useWideLayout();
  const [current, setCurrent] = useState('Inicio');
  const syncCurrent = () => setCurrent(navigationRef.getCurrentRoute()?.name ?? 'Inicio');

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {wide ? <Sidebar navigationRef={navigationRef} current={current} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <NavigationContainer
          ref={navigationRef}
          theme={navigationTheme}
          onReady={syncCurrent}
          onStateChange={syncCurrent}
          documentTitle={{ formatter: (_options, route) => (route && screenTitles[route.name] ? `${screenTitles[route.name]} · Portal da Vila` : 'Portal da Vila') }}
        >
          <PortalTabs wide={wide} />
        </NavigationContainer>
      </View>
    </View>
  );
}
