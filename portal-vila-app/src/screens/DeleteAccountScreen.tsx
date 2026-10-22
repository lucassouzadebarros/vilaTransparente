import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eye, EyeOff, ShieldCheck, UserX } from 'lucide-react-native';
import { Button, Card, Field, Label, Screen, Stack, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Alert } from '../utils/alert';
import { openExternal, PRIVACY_URL } from '../utils/links';

/** Deleting the account from inside the app (Google Play requires it). The password confirms; a dialog asks once more. */
export function DeleteAccountScreen() {
  const { isAdmin, logout } = useAuth();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function confirm() {
    if (!password) {
      setError('Digite sua senha para confirmar.');
      return;
    }
    Alert.alert(
      'Excluir minha conta',
      'Seus dados pessoais serão apagados e você não poderá mais entrar. Isso não tem volta. Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir minha conta', style: 'destructive', onPress: () => erase() }
      ]
    );
  }

  async function erase() {
    setBusy(true);
    setError('');
    try {
      await api.deleteAccount(password);
      Alert.alert('Conta excluída', 'Seus dados pessoais foram apagados. Obrigado por ter usado o Portal da Vila.');
      await logout();
    } catch (failure) {
      setError(apiErrorMessage(failure, 'Não consegui excluir a conta. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  }

  if (isAdmin) {
    return (
      <Screen title="Excluir minha conta" subtitle="Conta de administrador">
        <Card>
          <Value>A conta de administrador não é excluída pelo app</Value>
          <Label>
            Ela guarda o acesso à administração do condomínio. Para encerrá-la, fale com o suporte pelo e-mail da política de privacidade.
          </Label>
          <Button title="Ver política de privacidade" icon={ShieldCheck} variant="ghost" onPress={() => openExternal(PRIVACY_URL)} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Excluir minha conta" subtitle="Apague seus dados pessoais">
      <Card>
        <Stack>
          <Value>O que acontece</Value>
          <Label>Apagamos: seu nome, e-mail, telefone, CPF/CNPJ, sua senha e os avisos do seu celular. Você deixa de poder entrar.</Label>
          <Label>
            Ficam, sem o seu nome: as mensalidades, pagamentos, despesas, votos e relatos do condomínio, porque a prestação de contas exige guardá-los. Eles continuam ligados à casa, não a você.
          </Label>
          <Label>A casa fica livre para um novo convite da administração.</Label>
        </Stack>
      </Card>

      <Card>
        <Stack>
          {error ? (
            <View style={styles.errorBanner} accessibilityLiveRegion="polite">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Field
            label="Sua senha"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setError('');
            }}
            secureTextEntry={!show}
            helpText="Digite a senha para confirmar que é você."
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={show ? 'Ocultar senha' : 'Mostrar senha'}
                onPress={() => setShow((current) => !current)}
                style={styles.toggle}
              >
                {show ? <EyeOff color={colors.muted} size={18} /> : <Eye color={colors.muted} size={18} />}
              </Pressable>
            }
          />
          <Button title={busy ? 'Excluindo...' : 'Excluir minha conta'} icon={UserX} variant="danger" onPress={confirm} disabled={busy || !password} />
          <Button title="Ver política de privacidade" icon={ShieldCheck} variant="ghost" onPress={() => openExternal(PRIVACY_URL)} />
        </Stack>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggle: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  errorBanner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    padding: spacing.md
  },
  errorText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  }
});
