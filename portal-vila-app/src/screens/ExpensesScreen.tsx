import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Plus, RefreshCw } from 'lucide-react-native';
import { Button, Card, Field, Label, Money, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Expense } from '../types';

export function ExpensesScreen() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<Expense[]>([]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');

  async function load() {
    setItems(await api.expenses());
  }

  async function create() {
    await api.createExpense({
      description,
      amount: Number(amount.replace(',', '.')),
      expenseDate: new Date().toISOString().slice(0, 10),
      category: 'Manual',
      paymentMethod: 'PIX'
    });
    setDescription('');
    setAmount('');
    Alert.alert('Despesa', 'Despesa cadastrada.');
    load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Despesas" subtitle="Saidas da caixinha" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      {isAdmin ? (
        <Card>
          <Field label="Descricao" value={description} onChangeText={setDescription} />
          <Field label="Valor" value={amount} onChangeText={setAmount} keyboardType="numeric" />
          <Button title="Cadastrar despesa" icon={Plus} onPress={create} disabled={!description || !amount} />
        </Card>
      ) : null}
      {items.map((item) => (
        <Card key={item.id}>
          <Row>
            <Value>{item.description}</Value>
            <Money value={item.amount} />
          </Row>
          <Label>{item.category ?? 'Geral'} - {item.expenseDate}</Label>
          {item.supplier ? <Label>{item.supplier}</Label> : null}
        </Card>
      ))}
    </Screen>
  );
}
