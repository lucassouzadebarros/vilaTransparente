import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FileText, Home, MoreHorizontal, WalletCards, Wrench } from 'lucide-react-native';
import { colors } from '../theme';
import { AdminPixChargesScreen } from '../screens/AdminPixChargesScreen';
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
import { ReleaseHouseScreen } from '../screens/ReleaseHouseScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ResidentsScreen } from '../screens/ResidentsScreen';
import { ServiceDetailsScreen } from '../screens/ServiceDetailsScreen';
import { ServiceFormScreen } from '../screens/ServiceFormScreen';
import { ServicesScreen } from '../screens/ServicesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { WebhookEventsScreen } from '../screens/WebhookEventsScreen';

const Tabs = createBottomTabNavigator();
const hiddenTabOptions = {
  tabBarButton: () => null,
  tabBarItemStyle: { display: 'none' as const }
};

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
        tabBarItemStyle: {
          height: 58,
          paddingVertical: 2
        },
        tabBarLabelStyle: {
          fontSize: 11,
          lineHeight: 14,
          marginTop: 1,
          paddingBottom: 2
        },
        tabBarIconStyle: {
          marginTop: 2
        }
      }}
    >
      <Tabs.Screen name="Inicio" component={HomeScreen} options={{ tabBarLabel: 'Início', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="Caixa" component={CashBoxScreen} options={{ tabBarIcon: ({ color, size }) => <WalletCards color={color} size={size} /> }} />
      <Tabs.Screen name="Servicos" component={ServicesScreen} options={{ tabBarLabel: 'Serviços', tabBarIcon: ({ color, size }) => <Wrench color={color} size={size} /> }} />
      <Tabs.Screen name="Docs" component={DocumentsScreen} options={{ tabBarIcon: ({ color, size }) => <FileText color={color} size={size} /> }} />
      <Tabs.Screen name="Mais" component={MoreScreen} options={{ tabBarIcon: ({ color, size }) => <MoreHorizontal color={color} size={size} /> }} />
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
      <Tabs.Screen name="Settings" component={SettingsScreen} options={hiddenTabOptions} />
      <Tabs.Screen name="ChangePassword" component={ChangePasswordScreen} options={hiddenTabOptions} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <PortalTabs />
    </NavigationContainer>
  );
}
