import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react-native';
import { Button, Card, Field, Label, Screen, Stack, Value } from '../components/ui';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';

export function ChangePasswordScreen() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const newPasswordError = passwordFieldError(newPassword);
  const confirmPasswordError = confirmPasswordFieldError(newPassword, confirmPassword);
  const canSubmit = Boolean(currentPassword && newPassword.length >= 6 && newPassword === confirmPassword && !saving);

  async function submit() {
    if (!currentPassword) {
      setMessage({ type: 'error', text: 'Informe sua senha atual.' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'A nova senha precisa ter pelo menos 6 caracteres.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas não conferem.' });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await api.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: response.message });
      Alert.alert('Alterar senha', response.message);
    } catch (error) {
      const text = apiErrorMessage(error, 'Não consegui alterar a senha. Confira os dados e tente novamente.');
      setMessage({ type: 'error', text });
      Alert.alert('Alterar senha', text);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="Alterar senha" subtitle="Segurança da conta">
      <Card style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <KeyRound color={colors.blue} size={24} />
        </View>
        <View style={styles.heroCopy}>
          <Value>Senha de acesso</Value>
          <Label>Atualize sua senha para manter sua conta protegida.</Label>
        </View>
      </Card>

      <Card>
        <Stack>
          {message ? (
            <View style={[styles.banner, message.type === 'success' ? styles.successBanner : styles.errorBanner]}>
              {message.type === 'success' ? <CheckCircle2 color={colors.green} size={18} /> : <ShieldCheck color={colors.red} size={18} />}
              <Text style={[styles.bannerText, message.type === 'success' ? styles.successText : styles.errorText]}>{message.text}</Text>
            </View>
          ) : null}

          <Field
            label="Senha atual"
            value={currentPassword}
            onChangeText={(value) => {
              setCurrentPassword(value);
              setMessage(null);
            }}
            secureTextEntry={!showCurrent}
            right={
              <PasswordToggle
                visible={showCurrent}
                onPress={() => setShowCurrent((current) => !current)}
                label={showCurrent ? 'Ocultar senha atual' : 'Mostrar senha atual'}
              />
            }
          />
          <Field
            label="Nova senha"
            value={newPassword}
            onChangeText={(value) => {
              setNewPassword(value);
              setMessage(null);
            }}
            secureTextEntry={!showNew}
            errorText={newPasswordError}
            helpText="Mínimo de 6 caracteres."
            right={
              <PasswordToggle
                visible={showNew}
                onPress={() => setShowNew((current) => !current)}
                label={showNew ? 'Ocultar nova senha' : 'Mostrar nova senha'}
              />
            }
          />
          <Field
            label="Confirmar nova senha"
            value={confirmPassword}
            onChangeText={(value) => {
              setConfirmPassword(value);
              setMessage(null);
            }}
            secureTextEntry={!showConfirm}
            errorText={confirmPasswordError}
            right={
              <PasswordToggle
                visible={showConfirm}
                onPress={() => setShowConfirm((current) => !current)}
                label={showConfirm ? 'Ocultar confirmação' : 'Mostrar confirmação'}
              />
            }
          />
          <Button title={saving ? 'Salvando...' : 'Salvar nova senha'} icon={KeyRound} onPress={submit} disabled={!canSubmit} />
        </Stack>
      </Card>

      <Card style={styles.tipCard}>
        <ShieldCheck color={colors.muted} size={20} />
        <Text style={styles.tipText}>Use uma senha diferente das senhas de e-mail, banco ou outros aplicativos.</Text>
      </Card>
    </Screen>
  );
}

function PasswordToggle({ visible, onPress, label }: { visible: boolean; onPress: () => void; label: string }) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.passwordToggle}>
      <Icon color={colors.muted} size={20} />
    </Pressable>
  );
}

function passwordFieldError(value: string) {
  if (!value) {
    return '';
  }
  return value.length >= 6 ? '' : 'A senha precisa ter pelo menos 6 caracteres.';
}

function confirmPasswordFieldError(password: string, confirmation: string) {
  if (!confirmation) {
    return '';
  }
  return password === confirmation ? '' : 'As senhas não conferem.';
}

const styles = StyleSheet.create({
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs
  },
  banner: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  successBanner: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft
  },
  errorBanner: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800'
  },
  successText: {
    color: colors.green
  },
  errorText: {
    color: colors.red
  },
  passwordToggle: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.bg
  },
  tipText: {
    flex: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  }
});
