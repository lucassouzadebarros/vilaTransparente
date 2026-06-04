import { useNavigation } from '@react-navigation/native';
import { BarChart3, ClipboardList, FileClock, ListChecks, LockOpen, LogOut, ReceiptText, Settings, Users, WalletCards } from 'lucide-react-native';
import { Button, Card, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { logout, isAdmin, session } = useAuth();

  return (
    <Screen title="Mais" subtitle={session?.name}>
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
      <Row>
        <Button title="Sair" icon={LogOut} variant="danger" onPress={logout} />
      </Row>
    </Screen>
  );
}
