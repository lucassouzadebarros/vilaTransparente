import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, CheckCircle2, Home, LogIn, ShieldCheck, Trash2, UserPlus } from 'lucide-react-native';
import { Button, Card, Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { RegistrationHouseOption } from '../types';

type Mode = 'login' | 'register';

export function LoginScreen() {
  const { login, logout } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [houses, setHouses] = useState<RegistrationHouseOption[]>([]);
  const [housesLoading, setHousesLoading] = useState(false);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (mode !== 'register') {
      return;
    }
    loadRegistrationHouses();
  }, [mode]);

  async function loadRegistrationHouses() {
    setHousesLoading(true);
    setErrorMessage('');
    try {
      const options = await api.registrationHouses();
      setHouses(options);
      if (!selectedHouseId) {
        setSelectedHouseId(options.find((house) => house.available)?.houseId ?? null);
      }
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Nao consegui carregar as casas disponiveis.'));
    } finally {
      setHousesLoading(false);
    }
  }

  async function submit() {
    setLoading(true);
    setErrorMessage('');
    try {
      await login(email, password);
    } catch (error) {
      setErrorMessage(loginErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitRegistration() {
    const validation = validateRegistration();
    if (validation) {
      setErrorMessage(validation);
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      await api.registerResident({
        houseId: selectedHouseId as number,
        name: name.trim(),
        email: registerEmail.trim(),
        phone: phone.trim(),
        documentNumber: documentNumber.trim(),
        password: registerPassword
      });
      await login(registerEmail.trim(), registerPassword);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Nao consegui concluir o cadastro. Confira os dados e tente novamente.'));
      await loadRegistrationHouses();
    } finally {
      setLoading(false);
    }
  }

  function validateRegistration() {
    const digits = documentNumber.replace(/\D/g, '');
    if (!selectedHouseId) {
      return 'Selecione a casa referente ao cadastro.';
    }
    if (!name.trim() || !registerEmail.trim() || !phone.trim()) {
      return 'Preencha nome, email e telefone.';
    }
    if (!(digits.length === 11 || digits.length === 14)) {
      return 'Informe CPF com 11 digitos ou CNPJ com 14 digitos.';
    }
    if (registerPassword.length < 6) {
      return 'A senha precisa ter pelo menos 6 caracteres.';
    }
    if (registerPassword !== confirmPassword) {
      return 'As senhas nao conferem.';
    }
    return '';
  }

  async function clearSession() {
    await logout();
    setErrorMessage('Sessao local limpa. Tente entrar novamente.');
  }

  function openRegister() {
    setMode('register');
    setErrorMessage('');
  }

  function openLogin() {
    setMode('login');
    setErrorMessage('');
  }

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.keyboard}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <ShieldCheck color={colors.surface} size={30} />
          </View>
          <Text style={styles.title}>Portal da Vila</Text>
          <Text style={styles.subtitle}>Mensalidade, Pix, servicos e documentos por casa.</Text>
        </View>

        {mode === 'login' ? (
          <View style={styles.stack}>
            <Card>
              <Text style={styles.cardTitle}>Entrar</Text>
              <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
              <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry />
              <Button title={loading ? 'Entrando...' : 'Entrar'} icon={LogIn} onPress={submit} disabled={loading} />
              {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            </Card>

            <Card>
              <View style={styles.calloutHeader}>
                <View style={styles.calloutIcon}>
                  <Home color={colors.blue} size={20} />
                </View>
                <View style={styles.calloutText}>
                  <Text style={styles.cardTitle}>Cadastrar minha casa</Text>
                  <Text style={styles.muted}>Moradores das casas 02 a 10 podem criar acesso e cliente Asaas.</Text>
                </View>
              </View>
              <Button title="Comecar cadastro" icon={UserPlus} onPress={openRegister} />
            </Card>

            <View style={styles.shortcut}>
              <Button title="Conta admin" icon={ShieldCheck} variant="ghost" onPress={() => { setEmail('admin@vila.com'); setPassword('123456'); }} />
              <Button title="Limpar sessao" icon={Trash2} variant="ghost" onPress={clearSession} />
            </View>
          </View>
        ) : (
          <View style={styles.stack}>
            <Card>
              <View style={styles.registerHeader}>
                <Pressable accessibilityRole="button" onPress={openLogin} style={styles.backButton}>
                  <ArrowLeft color={colors.ink} size={20} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text style={styles.cardTitle}>Cadastro da casa</Text>
                  <Text style={styles.muted}>Escolha sua casa e preencha os dados do responsavel.</Text>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Casa</Text>
                {housesLoading ? <Text style={styles.muted}>Carregando casas...</Text> : null}
                <View style={styles.houseGrid}>
                  {houses.map((house) => {
                    const selected = selectedHouseId === house.houseId;
                    return (
                      <Pressable
                        key={house.houseId}
                        accessibilityRole="button"
                        disabled={!house.available}
                        onPress={() => setSelectedHouseId(house.houseId)}
                        style={[
                          styles.houseOption,
                          selected ? styles.houseSelected : null,
                          !house.available ? styles.houseDisabled : null
                        ]}
                      >
                        <Text style={[styles.houseLabel, selected ? styles.houseLabelSelected : null]}>
                          Casa {String(house.number).padStart(2, '0')}
                        </Text>
                        <Text style={[styles.houseStatus, selected ? styles.houseStatusSelected : null]}>
                          {house.available ? (selected ? 'Selecionada' : 'Disponivel') : 'Ja cadastrada'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Field label="Nome do responsavel" value={name} onChangeText={setName} />
              <Field label="Email" value={registerEmail} onChangeText={setRegisterEmail} keyboardType="email-address" />
              <Field label="Telefone" value={phone} onChangeText={setPhone} keyboardType="numeric" />
              <Field label="CPF/CNPJ para o Asaas" value={documentNumber} onChangeText={setDocumentNumber} keyboardType="numeric" />
              <Field label="Senha" value={registerPassword} onChangeText={setRegisterPassword} secureTextEntry />
              <Field label="Confirmar senha" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

              <View style={styles.asaasNotice}>
                <CheckCircle2 color={colors.green} size={18} />
                <Text style={styles.noticeText}>Ao salvar, o cliente sera criado no Asaas Sandbox e a casa ficara bloqueada para novo cadastro.</Text>
              </View>

              <Button title={loading ? 'Cadastrando...' : 'Cadastrar e entrar'} icon={UserPlus} onPress={submitRegistration} disabled={loading} />
              {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
            </Card>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function loginErrorMessage(error: unknown) {
  const maybe = error as { response?: { status?: number } };
  if (maybe.response?.status === 401 || maybe.response?.status === 403) {
    return 'Email ou senha invalidos.';
  }
  return 'A API nao respondeu. Confira se o backend esta rodando em http://localhost:8080 e tente de novo.';
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
    backgroundColor: colors.bg
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontWeight: '700',
    textAlign: 'center'
  },
  stack: {
    gap: spacing.md
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  error: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '700'
  },
  shortcut: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  calloutIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  calloutText: {
    flex: 1,
    gap: spacing.xs
  },
  registerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerCopy: {
    flex: 1,
    gap: spacing.xs
  },
  section: {
    gap: spacing.sm
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800'
  },
  houseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  houseOption: {
    width: '31%',
    minWidth: 96,
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    justifyContent: 'center',
    gap: spacing.xs
  },
  houseSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft
  },
  houseDisabled: {
    opacity: 0.5,
    backgroundColor: colors.bg
  },
  houseLabel: {
    color: colors.ink,
    fontWeight: '900',
    fontSize: 14
  },
  houseLabelSelected: {
    color: colors.blue
  },
  houseStatus: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800'
  },
  houseStatusSelected: {
    color: colors.blue
  },
  asaasNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.greenSoft,
    borderRadius: 8,
    padding: spacing.md
  },
  noticeText: {
    flex: 1,
    color: colors.green,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  }
});
