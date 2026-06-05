import { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, CheckCircle2, CircleUserRound, Eye, EyeOff, Home, KeyRound, LockKeyhole, LogIn, Mail, Shield, ShieldCheck, Trash2, UserPlus } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Button, Card, Field, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { RegistrationHouseOption } from '../types';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'resetDone';

export function LoginScreen() {
  const { login, logout } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [resetDebugCode, setResetDebugCode] = useState<string | null>(null);
  const [resetInfoMessage, setResetInfoMessage] = useState('');
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
    confirmPassword ? confirmPasswordError : 'confirmação da senha'
  ].filter(Boolean);
  const canSubmitRegistration = registrationIssues.length === 0 && !loading && !housesLoading;
  const loginEmailError = emailFieldError(email);
  const loginPasswordError = password ? '' : '';
  const canSubmitLogin = Boolean(email.trim() && password && !loginEmailError && !loading);
  const resetEmailError = emailFieldError(resetEmail);
  const resetCodeError = resetCode ? (onlyDigits(resetCode).length === 6 ? '' : 'Informe o código de 6 dígitos.') : '';
  const resetPasswordError = passwordFieldError(resetPassword);
  const resetConfirmPasswordError = confirmPasswordFieldError(resetPassword, resetConfirmPassword);
  const canSubmitForgot = Boolean(resetEmail.trim() && !resetEmailError && !loading);
  const canSubmitReset = Boolean(
    resetEmail.trim()
      && onlyDigits(resetCode).length === 6
      && resetPassword.length >= 6
      && resetPassword === resetConfirmPassword
      && !loading
  );

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
      setErrorMessage(apiErrorMessage(error, 'Não consegui carregar as casas disponíveis.'));
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
      return 'Informe seu e-mail para entrar.';
    }
    if (!isValidEmail(normalizeEmail(email))) {
      return 'Informe um e-mail válido. Exemplo: nome@email.com';
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
      setErrorMessage(apiErrorMessage(error, 'Não consegui concluir o cadastro. Confira os dados e tente novamente.'));
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
      return 'Preencha nome, e-mail e telefone.';
    }
    if (!isValidEmail(emailToValidate)) {
      return 'Informe um e-mail válido. Exemplo: nome@email.com';
    }
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      return 'Informe um telefone com DDD. Exemplo: (21) 99999-9999.';
    }
    if (!(documentDigits.length === 11 || documentDigits.length === 14)) {
      return 'Informe CPF com 11 dígitos ou CNPJ com 14 dígitos.';
    }
    if (registerPassword.length < 6) {
      return 'A senha precisa ter pelo menos 6 caracteres.';
    }
    if (registerPassword !== confirmPassword) {
      return 'As senhas não conferem.';
    }
    return '';
  }

  async function clearSession() {
    await logout();
    setErrorMessage('Sessão local limpa. Tente entrar novamente.');
  }

  function openRegister() {
    setMode('register');
    setErrorMessage('');
  }

  function openForgot() {
    setMode('forgot');
    setResetEmail(email);
    setResetCode('');
    setResetPassword('');
    setResetConfirmPassword('');
    setResetDebugCode(null);
    setResetInfoMessage('');
    setErrorMessage('');
  }

  function openLogin() {
    setMode('login');
    setErrorMessage('');
  }

  async function submitPasswordResetRequest() {
    const normalized = normalizeEmail(resetEmail);
    if (!normalized) {
      setErrorMessage('Informe o e-mail cadastrado para recuperar a senha.');
      return;
    }
    if (!isValidEmail(normalized)) {
      setErrorMessage('Informe um e-mail válido. Exemplo: nome@email.com');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await api.requestPasswordReset(normalized);
      setResetEmail(normalized);
      setResetDebugCode(response.debugCode ?? null);
      setResetInfoMessage(response.message);
      setMode('reset');
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Não consegui iniciar a recuperação de senha.'));
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordResetConfirm() {
    const code = onlyDigits(resetCode);
    if (code.length !== 6) {
      setErrorMessage('Informe o código de 6 dígitos enviado para seu e-mail.');
      return;
    }
    if (resetPassword.length < 6) {
      setErrorMessage('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setErrorMessage('As senhas não conferem.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const response = await api.confirmPasswordReset(normalizeEmail(resetEmail), code, resetPassword);
      setEmail(normalizeEmail(resetEmail));
      setPassword('');
      setResetCode('');
      setResetPassword('');
      setResetConfirmPassword('');
      setResetDebugCode(null);
      setResetInfoMessage(response.message);
      setMode('resetDone');
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Não consegui alterar a senha. Confira o código e tente novamente.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.keyboard}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Shield color={colors.teal} fill={colors.teal} size={96} strokeWidth={1.8} />
            <Home color={colors.surface} fill={colors.surface} size={34} style={styles.logoHome} />
          </View>
          <Text style={styles.title}>Portal da Vila</Text>
          <Text style={styles.subtitle}>Mensalidades, Pix, serviços e orçamentos</Text>
        </View>

        {mode === 'login' ? (
          <View style={styles.loginStack}>
            <Card style={[styles.raisedCard, styles.loginCard]}>
              <View style={styles.loginCardHeader}>
                <View style={styles.userIconBubble}>
                  <CircleUserRound color={colors.surface} size={38} strokeWidth={2.4} />
                </View>
                <View style={styles.loginHeading}>
                <Text style={styles.loginCardTitle}>Entrar</Text>
                <Text style={styles.loginCardSubtitle}>Acesse com o e-mail e senha da sua casa ou da administração.</Text>
                </View>
              </View>
              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>Não consegui entrar</Text>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}
              <LoginField
                label="E-mail"
                value={email}
                onChangeText={(value) => {
                  setEmail(normalizeEmail(value));
                  setErrorMessage('');
                }}
                icon={Mail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="seu@email.com"
                errorText={loginEmailError}
                helpText="Use o e-mail cadastrado para sua casa."
              />
              <LoginField
                label="Senha"
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setErrorMessage('');
                }}
                icon={LockKeyhole}
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
              <View style={styles.forgotRow}>
                <Pressable accessibilityRole="button" onPress={openForgot}>
                  <Text style={styles.inlineAction}>Esqueci minha senha</Text>
                </Pressable>
              </View>
              <LoginPrimaryButton title={loading ? 'Entrando...' : 'Entrar'} icon={LogIn} onPress={submit} disabled={!canSubmitLogin} />
              <View style={styles.loginFooterModern}>
                <Text style={styles.loginHint}>Sem acesso ainda?</Text>
                <Pressable accessibilityRole="button" onPress={openRegister}>
                  <Text style={styles.inlineAction}>Cadastrar minha casa</Text>
                </Pressable>
              </View>
            </Card>

            <Card style={[styles.raisedCard, styles.signupCard]}>
              <View style={styles.signupHeaderModern}>
                <View style={styles.signupIconPanel}>
                  <Home color={colors.blue} size={36} strokeWidth={2.1} />
                </View>
                <View style={styles.signupCopy}>
                  <Text style={styles.signupTitle}>Cadastrar minha casa</Text>
                  <Text style={styles.signupText}>Moradores das casas 02 a 11 podem criar o acesso da própria casa.</Text>
                </View>
              </View>
              <LoginGhostButton title="Começar cadastro" icon={UserPlus} onPress={openRegister} />
            </Card>

            <Card style={[styles.raisedCard, styles.supportCardModern]}>
              <View style={styles.supportHeaderModern}>
                <ShieldCheck color={colors.teal} size={26} />
                <Text style={styles.supportTitle}>Suporte e acesso administrativo</Text>
              </View>
              <View style={styles.supportActionsModern}>
                <LoginGhostButton title="Preencher admin" icon={ShieldCheck} onPress={() => { setEmail('admin@vila.com'); setPassword('123456'); setErrorMessage(''); }} compact />
                <LoginGhostButton title="Limpar sessão" icon={Trash2} onPress={clearSession} compact />
              </View>
            </Card>
          </View>
        ) : mode === 'register' ? (
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
                  <Text style={styles.errorBannerTitle}>Não consegui concluir o cadastro</Text>
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
                    {house.available ? (selected ? 'Selecionada' : 'Disponível') : 'Já cadastrada'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

            <Field label="Nome do responsável" value={name} onChangeText={setName} errorText={name.trim() ? '' : undefined} />
              <Field
                label="E-mail"
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
                helpText="Mínimo de 6 caracteres."
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
                    label={showConfirmPassword ? 'Ocultar confirmação de senha' : 'Mostrar confirmação de senha'}
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
        ) : mode === 'forgot' ? (
          <View style={styles.stack}>
            <Card>
              <View style={styles.registerHeader}>
                <Pressable accessibilityRole="button" onPress={openLogin} style={styles.backButton}>
                  <ArrowLeft color={colors.ink} size={20} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text style={styles.cardTitle}>Recuperar senha</Text>
                  <Text style={styles.muted}>Informe o e-mail da conta para receber um código de verificação.</Text>
                </View>
              </View>

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>Não consegui enviar o código</Text>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              <View style={styles.recoveryHero}>
                <View style={styles.recoveryIcon}>
                  <Mail color={colors.blue} size={24} />
                </View>
                <View style={styles.headerCopy}>
                  <Value>Validação por e-mail</Value>
                  <Text style={styles.muted}>O código expira em alguns minutos por segurança.</Text>
                </View>
              </View>

              <Field
                label="E-mail cadastrado"
                value={resetEmail}
                onChangeText={(value) => {
                  setResetEmail(normalizeEmail(value));
                  setErrorMessage('');
                }}
                keyboardType="email-address"
                autoCapitalize="none"
                errorText={resetEmailError}
                helpText="Use o mesmo e-mail cadastrado no portal."
              />
              <Button title={loading ? 'Enviando...' : 'Enviar código'} icon={Mail} onPress={submitPasswordResetRequest} disabled={!canSubmitForgot} />
              <View style={styles.securityNote}>
                <ShieldCheck color={colors.muted} size={18} />
                <Text style={styles.securityNoteText}>Para sua segurança, a tela não informa se o e-mail existe ou não.</Text>
              </View>
            </Card>
          </View>
        ) : mode === 'reset' ? (
          <View style={styles.stack}>
            <Card>
              <View style={styles.registerHeader}>
                <Pressable accessibilityRole="button" onPress={openForgot} style={styles.backButton}>
                  <ArrowLeft color={colors.ink} size={20} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text style={styles.cardTitle}>Verificar código</Text>
                  <Text style={styles.muted}>Digite o código enviado e escolha uma nova senha.</Text>
                </View>
              </View>

              {resetInfoMessage ? (
                <View style={styles.infoBanner}>
                  <Mail color={colors.blue} size={18} />
                  <Text style={styles.infoBannerText}>{resetInfoMessage}</Text>
                </View>
              ) : null}
              {resetDebugCode ? (
                <View style={styles.debugCodeBox}>
                  <Text style={styles.debugLabel}>Código de teste</Text>
                  <Text style={styles.debugCode}>{resetDebugCode}</Text>
                </View>
              ) : null}
              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>Não consegui alterar a senha</Text>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Field
                label="Código de verificação"
                value={resetCode}
                onChangeText={(value) => {
                  setResetCode(onlyDigits(value).slice(0, 6));
                  setErrorMessage('');
                }}
                keyboardType="numeric"
                placeholder="000000"
                errorText={resetCodeError}
                helpText="Informe os 6 dígitos recebidos."
              />
              <Field
                label="Nova senha"
                value={resetPassword}
                onChangeText={(value) => {
                  setResetPassword(value);
                  setErrorMessage('');
                }}
                secureTextEntry={!showResetPassword}
                errorText={resetPasswordError}
                helpText="Mínimo de 6 caracteres."
                right={
                  <PasswordToggle
                    visible={showResetPassword}
                    onPress={() => setShowResetPassword((current) => !current)}
                    label={showResetPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                  />
                }
              />
              <Field
                label="Confirmar nova senha"
                value={resetConfirmPassword}
                onChangeText={(value) => {
                  setResetConfirmPassword(value);
                  setErrorMessage('');
                }}
                secureTextEntry={!showResetConfirmPassword}
                errorText={resetConfirmPasswordError}
                right={
                  <PasswordToggle
                    visible={showResetConfirmPassword}
                    onPress={() => setShowResetConfirmPassword((current) => !current)}
                    label={showResetConfirmPassword ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                  />
                }
              />
              <Button title={loading ? 'Alterando...' : 'Alterar senha'} icon={KeyRound} onPress={submitPasswordResetConfirm} disabled={!canSubmitReset} />
              <Button title="Reenviar código" icon={Mail} variant="ghost" onPress={submitPasswordResetRequest} disabled={loading} />
            </Card>
          </View>
        ) : (
          <View style={styles.stack}>
            <Card style={styles.centerCard}>
              <View style={styles.successIcon}>
                <CheckCircle2 color={colors.surface} size={32} />
              </View>
              <Text style={styles.cardTitle}>Senha alterada</Text>
              <Text style={styles.centerText}>{resetInfoMessage || 'Sua senha foi alterada com sucesso.'}</Text>
              <Button title="Entrar agora" icon={LogIn} onPress={openLogin} />
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

function LoginField({
  label,
  value,
  onChangeText,
  icon: Icon,
  placeholder,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  errorText,
  helpText,
  right
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  icon: LucideIcon;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  errorText?: string;
  helpText?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.loginField}>
      <Text style={styles.loginFieldLabel}>{label}</Text>
      <View style={[styles.loginInputFrame, errorText ? styles.loginInputFrameError : null]}>
        <View style={styles.loginInputIcon}>
          <Icon color={colors.muted} size={24} />
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          style={styles.loginInput}
          placeholderTextColor={colors.muted}
        />
        {right ? <View style={styles.loginInputAction}>{right}</View> : null}
      </View>
      {errorText ? <Text style={styles.fieldError}>{errorText}</Text> : helpText ? <Text style={styles.loginFieldHelp}>{helpText}</Text> : null}
    </View>
  );
}

function LoginPrimaryButton({ title, icon: Icon, onPress, disabled }: { title: string; icon: LucideIcon; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.loginPrimaryButton,
        { opacity: disabled ? 0.76 : pressed ? 0.86 : 1 }
      ]}
    >
      <Icon color={colors.surface} size={30} />
      <Text style={styles.loginPrimaryButtonText}>{title}</Text>
    </Pressable>
  );
}

function LoginGhostButton({
  title,
  icon: Icon,
  onPress,
  compact
}: {
  title: string;
  icon: LucideIcon;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.loginGhostButton,
        compact ? styles.loginGhostButtonCompact : null,
        { opacity: pressed ? 0.82 : 1 }
      ]}
    >
      <Icon color={colors.blue} size={compact ? 24 : 30} />
      <Text style={[styles.loginGhostButtonText, compact ? styles.loginGhostButtonTextCompact : null]}>{title}</Text>
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
  return isValidEmail(normalizeEmail(value)) ? '' : 'Informe um e-mail válido. Exemplo: nome@email.com';
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
  return digits.length === 11 || digits.length === 14 ? '' : 'Informe CPF com 11 dígitos ou CNPJ com 14 dígitos.';
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
    return 'E-mail ou senha inválidos.';
  }
  return 'A API não respondeu. Confira se o backend está rodando em http://localhost:8080 e tente de novo.';
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
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: spacing.xl,
    gap: 22
  },
  brand: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginBottom: spacing.sm
  },
  logoMark: {
    width: 112,
    height: 116,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoHome: {
    position: 'absolute',
    top: 37
  },
  title: {
    color: colors.ink,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 46
  },
  subtitle: {
    color: colors.muted,
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 24
  },
  stack: {
    gap: spacing.md
  },
  loginStack: {
    gap: 18
  },
  raisedCard: {
    borderRadius: 16,
    borderColor: '#E4EAF2',
    padding: 18,
    shadowColor: '#163052',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0
  },
  loginCard: {
    gap: 16,
    paddingTop: 20,
    paddingBottom: 20
  },
  loginCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14
  },
  userIconBubble: {
    width: 50,
    height: 50,
    borderRadius: 999,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginHeading: {
    flex: 1,
    gap: 6
  },
  loginCardTitle: {
    color: colors.ink,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 0
  },
  loginCardSubtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600'
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
  loginField: {
    gap: 8
  },
  loginFieldLabel: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900'
  },
  loginInputFrame: {
    minHeight: 64,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  loginInputFrameError: {
    borderColor: colors.red,
    backgroundColor: '#FFF8F8'
  },
  loginInputIcon: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginInput: {
    flex: 1,
    minHeight: 60,
    color: colors.ink,
    fontSize: 17,
    fontWeight: '600',
    paddingRight: spacing.md
  },
  loginInputAction: {
    minWidth: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.sm
  },
  loginFieldHelp: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600'
  },
  fieldError: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
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
  passwordHelpRow: {
    alignItems: 'flex-end',
    marginTop: -spacing.sm
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: -8,
    marginBottom: 4
  },
  loginHint: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700'
  },
  inlineAction: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: '900'
  },
  loginPrimaryButton: {
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    shadowColor: colors.blue,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4
  },
  loginPrimaryButtonText: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0
  },
  loginFooterModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: spacing.xs
  },
  loginGhostButton: {
    minHeight: 58,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  loginGhostButtonCompact: {
    flex: 1,
    minHeight: 58,
    minWidth: 0
  },
  loginGhostButtonText: {
    color: colors.blue,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0
  },
  loginGhostButtonTextCompact: {
    fontSize: 15
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
    color: colors.ink,
    fontSize: 17,
    fontWeight: '900'
  },
  signupCard: {
    gap: spacing.lg
  },
  signupHeaderModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg
  },
  signupIconPanel: {
    width: 78,
    height: 78,
    borderRadius: 16,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  signupCopy: {
    flex: 1,
    gap: spacing.xs
  },
  signupTitle: {
    color: colors.ink,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900'
  },
  signupText: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600'
  },
  supportCardModern: {
    gap: spacing.lg
  },
  supportHeaderModern: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  supportActionsModern: {
    flexDirection: 'row',
    gap: spacing.sm
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
  recoveryHero: {
    minHeight: 74,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  recoveryIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.bg,
    padding: spacing.md
  },
  securityNoteText: {
    flex: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  infoBanner: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm
  },
  infoBannerText: {
    flex: 1,
    color: colors.blue,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800'
  },
  debugCodeBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.amber,
    backgroundColor: colors.amberSoft,
    padding: spacing.md,
    gap: spacing.xs
  },
  debugLabel: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '900'
  },
  debugCode: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 0
  },
  centerCard: {
    alignItems: 'center',
    gap: spacing.md
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center'
  },
  centerText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '700'
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
