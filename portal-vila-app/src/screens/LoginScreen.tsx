import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Home, LogIn, ShieldCheck, Trash2, UserPlus } from 'lucide-react-native';
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
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSupportActions, setShowSupportActions] = useState(false);
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
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const registerEmailError = emailFieldError(registerEmail);
  const phoneError = phoneFieldError(phone);
  const documentError = documentFieldError(documentNumber);
  const passwordError = passwordFieldError(registerPassword);
  const confirmPasswordError = confirmPasswordFieldError(registerPassword, confirmPassword);
  const registrationIssues = [
    selectedHouseId ? '' : 'selecione a casa',
    name.trim() ? '' : 'nome',
    registerEmail.trim() ? registerEmailError : 'email',
    phone.trim() ? phoneError : 'telefone',
    documentNumber.trim() ? documentError : 'CPF/CNPJ',
    registerPassword ? passwordError : 'senha',
    confirmPassword ? confirmPasswordError : 'confirmacao da senha'
  ].filter(Boolean);
  const canSubmitRegistration = registrationIssues.length === 0 && !loading && !housesLoading;
  const loginEmailError = emailFieldError(email);
  const loginPasswordError = password ? '' : '';
  const canSubmitLogin = Boolean(email.trim() && password && !loginEmailError && !loading);

  useEffect(() => {
    if (mode !== 'register') {
      return;
    }
    loadRegistrationHouses();
  }, [mode]);

  async function loadRegistrationHouses() {
    return refreshRegistrationHouses(true);
  }

  async function refreshRegistrationHouses(clearMessage: boolean) {
    setHousesLoading(true);
    if (clearMessage) {
      setErrorMessage('');
    }
    try {
      const options = await api.registrationHouses();
      setHouses(options);
      const selectedStillAvailable = options.some((house) => house.houseId === selectedHouseId && house.available);
      if (!selectedHouseId || !selectedStillAvailable) {
        setSelectedHouseId(options.find((house) => house.available)?.houseId ?? null);
      }
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Nao consegui carregar as casas disponiveis.'));
    } finally {
      setHousesLoading(false);
    }
  }

  async function submit() {
    const validation = validateLogin();
    if (validation) {
      setErrorMessage(validation);
      return;
    }
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

  function validateLogin() {
    if (!email.trim()) {
      return 'Informe seu email para entrar.';
    }
    if (!isValidEmail(normalizeEmail(email))) {
      return 'Informe um email valido. Exemplo: nome@email.com';
    }
    if (!password) {
      return 'Informe sua senha para entrar.';
    }
    return '';
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
        email: normalizeEmail(registerEmail),
        phone: onlyDigits(phone),
        documentNumber: onlyDigits(documentNumber),
        password: registerPassword
      });
      await login(normalizeEmail(registerEmail), registerPassword);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Nao consegui concluir o cadastro. Confira os dados e tente novamente.'));
      await refreshRegistrationHouses(false);
    } finally {
      setLoading(false);
    }
  }

  function validateRegistration() {
    const documentDigits = onlyDigits(documentNumber);
    const phoneDigits = onlyDigits(phone);
    const emailToValidate = normalizeEmail(registerEmail);
    if (!selectedHouseId) {
      return 'Selecione a casa referente ao cadastro.';
    }
    if (!name.trim() || !registerEmail.trim() || !phone.trim()) {
      return 'Preencha nome, email e telefone.';
    }
    if (!isValidEmail(emailToValidate)) {
      return 'Informe um email valido. Exemplo: nome@email.com';
    }
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      return 'Informe um telefone com DDD. Exemplo: (21) 99999-9999.';
    }
    if (!(documentDigits.length === 11 || documentDigits.length === 14)) {
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
    setShowSupportActions(false);
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
          <Text style={styles.subtitle}>Mensalidades, Pix, serviços e orçamentos</Text>
        </View>

        {mode === 'login' ? (
          <View style={styles.stack}>
            <Card style={styles.loginCard}>
              <View style={styles.loginHeading}>
                <Text style={styles.cardTitle}>Entrar</Text>
                <Text style={styles.muted}>Acesse com o email e senha da sua casa ou da administracao.</Text>
              </View>
              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>Nao consegui entrar</Text>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}
              <Field
                label="Email"
                value={email}
                onChangeText={(value) => {
                  setEmail(normalizeEmail(value));
                  setErrorMessage('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                errorText={loginEmailError}
                helpText="Use o email cadastrado para sua casa."
              />
              <Field
                label="Senha"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setErrorMessage('');
                }}
                secureTextEntry={!showLoginPassword}
                errorText={loginPasswordError}
                right={
                  <PasswordToggle
                    visible={showLoginPassword}
                    onPress={() => setShowLoginPassword((current) => !current)}
                    label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  />
                }
              />
              <Button title={loading ? 'Entrando...' : 'Entrar'} icon={LogIn} onPress={submit} disabled={!canSubmitLogin} />
              <View style={styles.loginFooter}>
                <Text style={styles.loginHint}>Sem acesso ainda?</Text>
                <Pressable accessibilityRole="button" onPress={openRegister}>
                  <Text style={styles.inlineAction}>Cadastrar minha casa</Text>
                </Pressable>
              </View>
            </Card>

            <Card>
              <View style={styles.calloutHeader}>
                <View style={styles.calloutIcon}>
                  <Home color={colors.blue} size={20} />
                </View>
                <View style={styles.calloutText}>
                  <Text style={styles.cardTitle}>Cadastrar minha casa</Text>
                  <Text style={styles.muted}>Moradores das casas 02 a 11 podem criar o acesso da propria casa.</Text>
                </View>
              </View>
              <Button title="Comecar cadastro" icon={UserPlus} onPress={openRegister} />
            </Card>

            <Card style={styles.supportCard}>
              <Pressable accessibilityRole="button" onPress={() => setShowSupportActions((current) => !current)} style={styles.supportHeader}>
                <ShieldCheck color={colors.muted} size={18} />
                <Text style={styles.supportTitle}>Suporte e acesso administrativo</Text>
              </Pressable>
              {showSupportActions ? (
                <View style={styles.shortcut}>
                  <Button title="Preencher admin" icon={ShieldCheck} variant="ghost" onPress={() => { setEmail('admin@vila.com'); setPassword('123456'); setErrorMessage(''); }} />
                  <Button title="Limpar sessao" icon={Trash2} variant="ghost" onPress={clearSession} />
                </View>
              ) : null}
            </Card>
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

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>Nao consegui concluir o cadastro</Text>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

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

              <Field label="Nome do responsavel" value={name} onChangeText={setName} errorText={name.trim() ? '' : undefined} />
              <Field
                label="Email"
                value={registerEmail}
                onChangeText={(value) => setRegisterEmail(normalizeEmail(value))}
                keyboardType="email-address"
                autoCapitalize="none"
                errorText={registerEmailError}
                helpText="Exemplo: morador@email.com"
              />
              <Field
                label="Telefone"
                value={phone}
                onChangeText={(value) => setPhone(formatPhone(value))}
                keyboardType="numeric"
                placeholder="(21) 99999-9999"
                errorText={phoneError}
              />
              <Field
                label="CPF/CNPJ"
                value={documentNumber}
                onChangeText={(value) => setDocumentNumber(formatCpfCnpj(value))}
                keyboardType="numeric"
                placeholder="000.000.000-00"
                errorText={documentError}
              />
              <Field
                label="Senha"
                value={registerPassword}
                onChangeText={setRegisterPassword}
                secureTextEntry={!showRegisterPassword}
                errorText={passwordError}
                helpText="Minimo de 6 caracteres."
                right={
                  <PasswordToggle
                    visible={showRegisterPassword}
                    onPress={() => setShowRegisterPassword((current) => !current)}
                    label={showRegisterPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  />
                }
              />
              <Field
                label="Confirmar senha"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                errorText={confirmPasswordError}
                right={
                  <PasswordToggle
                    visible={showConfirmPassword}
                    onPress={() => setShowConfirmPassword((current) => !current)}
                    label={showConfirmPassword ? 'Ocultar confirmacao de senha' : 'Mostrar confirmacao de senha'}
                  />
                }
              />

              {registrationIssues.length ? (
                <View style={styles.pendingBox}>
                  <Text style={styles.pendingText}>Faltam: {registrationIssues.join(', ')}.</Text>
                </View>
              ) : (
                <View style={styles.readyBox}>
                  <CheckCircle2 color={colors.green} size={18} />
                  <Text style={styles.readyText}>Dados prontos para cadastro.</Text>
                </View>
              )}

              <View style={styles.signupNotice}>
                <CheckCircle2 color={colors.green} size={18} />
                <Text style={styles.noticeText}>Ao salvar, o cadastro da casa sera criado e ela ficara bloqueada para novo cadastro.</Text>
              </View>

              <Button title={loading ? 'Cadastrando...' : 'Cadastrar e entrar'} icon={UserPlus} onPress={submitRegistration} disabled={!canSubmitRegistration} />
            </Card>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase().replace(/\s/g, '');
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function emailFieldError(value: string) {
  if (!value.trim()) {
    return '';
  }
  return isValidEmail(normalizeEmail(value)) ? '' : 'Informe um email valido. Exemplo: nome@email.com';
}

function phoneFieldError(value: string) {
  const digits = onlyDigits(value);
  if (!digits) {
    return '';
  }
  return digits.length >= 10 && digits.length <= 11 ? '' : 'Informe telefone com DDD.';
}

function documentFieldError(value: string) {
  const digits = onlyDigits(value);
  if (!digits) {
    return '';
  }
  return digits.length === 11 || digits.length === 14 ? '' : 'Informe CPF com 11 digitos ou CNPJ com 14 digitos.';
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
  return password === confirmation ? '' : 'As senhas nao conferem.';
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCpfCnpj(value: string) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 3) {
    return digits;
  }
  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  if (digits.length <= 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
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
  loginCard: {
    gap: spacing.lg
  },
  loginHeading: {
    gap: spacing.xs
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
  errorBanner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    padding: spacing.md,
    gap: spacing.xs
  },
  errorBannerTitle: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '900'
  },
  errorBannerText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  pendingBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.amber,
    backgroundColor: colors.amberSoft,
    padding: spacing.md
  },
  pendingText: {
    color: colors.amber,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800'
  },
  readyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.greenSoft,
    padding: spacing.md
  },
  readyText: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800'
  },
  passwordToggle: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shortcut: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md
  },
  loginFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs
  },
  loginHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700'
  },
  inlineAction: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '900'
  },
  supportCard: {
    padding: spacing.md,
    gap: spacing.md
  },
  supportHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  supportTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800'
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
  signupNotice: {
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
