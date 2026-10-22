import { ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Home, IdCard, KeyRound, LockKeyhole, LogIn, Mail, Phone, Shield, ShieldCheck, Trash2, UserPlus, UserRound } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Button, Card, Field, Value } from '../components/ui';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { InviteCheck } from '../types';
import { openExternal, PRIVACY_URL } from '../utils/links';
import { MIN_PASSWORD_LENGTH } from '../utils/password';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'resetDone';

export function LoginScreen() {
  const { login, logout, enterDemo } = useAuth();
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

  // First access: the code the administration made for the house comes first; it tells which house this is.
  const [inviteCode, setInviteCode] = useState('');
  const [inviteHouse, setInviteHouse] = useState<InviteCheck | null>(null);
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
  const inviteCodeReady = inviteCodeDigits(inviteCode).length === INVITE_CODE_LENGTH;
  const registrationIssues = [
    inviteHouse ? '' : 'código da casa',
    name.trim() ? '' : 'nome',
    registerEmail.trim() ? registerEmailError : 'email',
    phone.trim() ? phoneError : 'telefone',
    documentNumber.trim() ? documentError : 'CPF/CNPJ',
    registerPassword ? passwordError : 'senha',
    confirmPassword ? confirmPasswordError : 'confirmação da senha'
  ].filter(Boolean);
  const canSubmitRegistration = registrationIssues.length === 0 && !loading;
  const loginEmailError = emailFieldError(email);
  const loginPasswordError = password ? '' : '';
  const canSubmitLogin = Boolean(email.trim() && password && !loginEmailError && !loading);
  const resetEmailError = emailFieldError(resetEmail);
  const resetCodeError = resetCode ? (onlyDigits(resetCode).length === 6 ? '' : 'O código tem 6 números.') : '';
  const resetPasswordError = passwordFieldError(resetPassword);
  const resetConfirmPasswordError = confirmPasswordFieldError(resetPassword, resetConfirmPassword);
  const canSubmitForgot = Boolean(resetEmail.trim() && !resetEmailError && !loading);
  const canSubmitReset = Boolean(
    resetEmail.trim()
      && onlyDigits(resetCode).length === 6
      && resetPassword.length >= MIN_PASSWORD_LENGTH
      && resetPassword === resetConfirmPassword
      && !loading
  );

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
      await api.registerWithInvite({
        code: inviteCode,
        name: name.trim(),
        email: normalizeEmail(registerEmail),
        phone: onlyDigits(phone),
        documentNumber: onlyDigits(documentNumber),
        password: registerPassword
      });
      await login(normalizeEmail(registerEmail), registerPassword);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Não consegui concluir o cadastro. Confira os dados e tente novamente.'));
      // A code that stopped working (used, cancelled, expired) sends the person back to type another one.
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        setInviteHouse(null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function submitInviteCode() {
    if (!inviteCodeReady) {
      setErrorMessage('Digite os 8 caracteres do código que a administração te passou.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      setInviteHouse(await api.checkInvite(inviteCode));
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Não consegui conferir o código. Tente de novo.'));
    } finally {
      setLoading(false);
    }
  }

  function validateRegistration() {
    const documentDigits = onlyDigits(documentNumber);
    const phoneDigits = onlyDigits(phone);
    const emailToValidate = normalizeEmail(registerEmail);
    if (!inviteHouse) {
      return 'Digite o código da sua casa para continuar.';
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
    if (registerPassword.length < MIN_PASSWORD_LENGTH) {
      return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
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
    setInviteHouse(null);
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
      setEmail(normalized);
      setPassword('');
      setResetDebugCode(response.debugCode ?? null);
      setResetInfoMessage(response.message);
      setResetCode('');
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
      setErrorMessage('Digite o código de 6 números que chegou no seu e-mail.');
      return;
    }
    if (resetPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (resetPassword !== resetConfirmPassword) {
      setErrorMessage('As senhas não conferem.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      await api.confirmPasswordReset(normalizeEmail(resetEmail), code, resetPassword);
      await login(normalizeEmail(resetEmail), resetPassword);
      setEmail(normalizeEmail(resetEmail));
      setPassword('');
      setResetCode('');
      setResetPassword('');
      setResetConfirmPassword('');
      setResetDebugCode(null);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Não consegui alterar a senha. Confira o código e tente novamente.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.keyboard}>
      <ScrollView role="main" style={styles.container} contentContainerStyle={styles.content}>
        {mode === 'login' ? <LoginBackdrop /> : mode === 'register' ? <SoftBackdrop /> : null}
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Shield color={colors.teal} fill={colors.teal} size={86} strokeWidth={1.8} />
            <Shield color={colors.surface} size={63} strokeWidth={2.3} style={styles.logoShieldInner} />
            <Home color={colors.surface} fill={colors.surface} size={28} style={styles.logoHome} />
          </View>
          <Text role="heading" style={styles.title}>Portal da Vila</Text>
          <Text style={styles.subtitle}>Mensalidades, Pix, serviços e orçamentos</Text>
        </View>

        {mode === 'login' ? (
          <View style={styles.loginStack}>
            <Card style={[styles.raisedCard, styles.loginCard]}>
              <View style={styles.loginCardHeader}>
                <View style={styles.userIconBubble}>
                  <UserRound color={colors.surface} size={19} strokeWidth={2.6} />
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
                <Pressable accessibilityRole="button" onPress={openForgot} style={styles.inlineActionTarget}>
                  <Text style={styles.inlineAction}>Esqueci minha senha</Text>
                </Pressable>
              </View>
              <LoginPrimaryButton title={loading ? 'Entrando...' : 'Entrar'} icon={LogIn} onPress={submit} disabled={!canSubmitLogin} />
              <View style={styles.loginFooterModern}>
                <Text style={styles.loginHint}>Primeiro acesso?</Text>
                <Pressable accessibilityRole="button" onPress={openRegister} style={styles.inlineActionTarget}>
                  <Text style={styles.inlineAction}>Tenho um código da minha casa</Text>
                </Pressable>
              </View>
            </Card>

            <Card style={[styles.raisedCard, styles.signupCard]}>
              <View style={styles.signupHeaderModern}>
                <View style={styles.signupIconPanel}>
                  <Home color={colors.blue} size={29} strokeWidth={2.1} />
                </View>
                <View style={styles.signupCopy}>
                  <Text style={styles.signupTitle}>Primeiro acesso</Text>
                  <Text style={styles.signupText}>O acesso é só para moradores. A administração do condomínio te passa um código da sua casa: com ele você cria seu acesso.</Text>
                </View>
              </View>
              <LoginGhostButton title="Tenho um código" icon={KeyRound} onPress={openRegister} />
            </Card>

            <Card style={[styles.raisedCard, styles.signupCard]}>
              <View style={styles.signupHeaderModern}>
                <View style={styles.signupIconPanel}>
                  <Eye color={colors.blue} size={29} strokeWidth={2.1} />
                </View>
                <View style={styles.signupCopy}>
                  <Text style={styles.signupTitle}>Ver demonstração</Text>
                  <Text style={styles.signupText}>Quer só conhecer o app? Veja as telas com dados de exemplo, sem criar conta. Nada é salvo.</Text>
                </View>
              </View>
              <LoginGhostButton title="Ver demonstração" icon={Eye} onPress={() => enterDemo('ADMIN')} />
            </Card>

            <Card style={[styles.raisedCard, styles.supportCardModern]}>
              <View style={styles.supportHeaderModern}>
                <ShieldCheck color={colors.teal} size={22} />
                <Text style={styles.supportTitle}>Problemas para entrar?</Text>
              </View>
              <View style={styles.supportActionsModern}>
                <LoginGhostButton title="Limpar sessão" icon={Trash2} onPress={clearSession} compact />
              </View>
            </Card>

            <View style={styles.legalRow}>
              <Pressable accessibilityRole="link" onPress={() => openExternal(PRIVACY_URL)} style={styles.inlineActionTarget}>
                <Text style={styles.inlineAction}>Política de privacidade</Text>
              </Pressable>
            </View>
          </View>
        ) : mode === 'register' ? (
          <View style={styles.registerStackModern}>
            <View style={styles.registerPanel}>
              <View style={styles.registerHeaderModern}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={inviteHouse ? 'Voltar e digitar outro código' : 'Voltar para entrar'}
                  onPress={inviteHouse ? () => { setInviteHouse(null); setErrorMessage(''); } : openLogin}
                  style={styles.registerBackButton}
                >
                  <ArrowLeft color={colors.blue} size={21} />
                </Pressable>
                <View style={styles.headerCopy}>
                  <Text role="heading" style={styles.registerTitle}>{inviteHouse ? `Cadastro da ${inviteHouse.houseLabel}` : 'Primeiro acesso'}</Text>
                  <Text style={styles.registerSubtitle}>
                    {inviteHouse ? 'Preencha os dados do responsável pela casa.' : 'Digite o código da sua casa, que a administração te passou.'}
                  </Text>
                </View>
              </View>

              {errorMessage ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerTitle}>{inviteHouse ? 'Não consegui concluir o cadastro' : 'Não consegui conferir o código'}</Text>
                  <Text style={styles.errorBannerText}>{errorMessage}</Text>
                </View>
              ) : null}

              {!inviteHouse ? (
                <>
                  <RegisterField
                    icon={KeyRound}
                    label="Código da casa"
                    value={inviteCode}
                    onChangeText={(value) => {
                      setInviteCode(formatInviteCode(value));
                      setErrorMessage('');
                    }}
                    autoCapitalize="characters"
                    placeholder="XXXX-XXXX"
                    onSubmitEditing={submitInviteCode}
                  />
                  <View style={styles.signupNoticeModern}>
                    <ShieldCheck color={colors.teal} size={19} />
                    <Text style={styles.noticeTextModern}>
                      O código é de uso único e vale por alguns dias. Não tem um? Peça à administração do condomínio: ela gera o código da sua casa.
                    </Text>
                  </View>
                  <LoginPrimaryButton title={loading ? 'Conferindo...' : 'Continuar'} icon={LogIn} onPress={submitInviteCode} disabled={!inviteCodeReady || loading} />
                </>
              ) : (
              <>
              <View style={styles.houseConfirmed}>
                <View style={styles.houseConfirmedIcon}>
                  <Home color={colors.blue} size={22} />
                </View>
                <View style={styles.headerCopy}>
                  <Text style={styles.houseLabel}>{inviteHouse.houseLabel}</Text>
                  <Text style={styles.houseStatus}>Código conferido</Text>
                </View>
                <CheckCircle2 color={colors.green} size={22} />
              </View>

              <RegisterField icon={UserRound} label="Nome do responsável" value={name} onChangeText={setName} placeholder="Digite o nome completo" />
              <RegisterField
                icon={Mail}
                label="E-mail"
                value={registerEmail}
                onChangeText={(value) => setRegisterEmail(normalizeEmail(value))}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="Exemplo: morador@email.com"
                errorText={registerEmailError}
              />
              <RegisterField
                icon={Phone}
                label="Telefone"
                value={phone}
                onChangeText={(value) => setPhone(formatPhone(value))}
                keyboardType="numeric"
                placeholder="(21) 99999-9999"
                errorText={phoneError}
              />
              <RegisterField
                icon={IdCard}
                label="CPF/CNPJ"
                value={documentNumber}
                onChangeText={(value) => setDocumentNumber(formatCpfCnpj(value))}
                keyboardType="numeric"
                placeholder="000.000.000-00"
                errorText={documentError}
              />
              <RegisterField
                icon={LockKeyhole}
                label="Senha"
                value={registerPassword}
                onChangeText={setRegisterPassword}
                secureTextEntry={!showRegisterPassword}
                placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`}
                errorText={passwordError}
                right={
                  <PasswordToggle
                    visible={showRegisterPassword}
                    onPress={() => setShowRegisterPassword((current) => !current)}
                    label={showRegisterPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  />
                }
              />
              <RegisterField
                icon={LockKeyhole}
                label="Confirmar senha"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                placeholder="Digite novamente sua senha"
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
                <View style={styles.pendingBoxModern}>
                  <Text style={styles.pendingTextModern}>Faltam: {registrationIssues.join(', ')}.</Text>
                </View>
              ) : (
                <View style={styles.readyBoxModern}>
                  <CheckCircle2 color={colors.green} size={18} />
                  <Text style={styles.readyTextModern}>Dados prontos para cadastro.</Text>
                </View>
              )}

              <View style={styles.signupNoticeModern}>
                <CheckCircle2 color={colors.teal} size={19} />
                <Text style={styles.noticeTextModern}>Ao salvar, o acesso da casa é criado e o código deixa de funcionar.</Text>
              </View>

              <LoginPrimaryButton title={loading ? 'Cadastrando...' : 'Cadastrar e entrar'} icon={UserPlus} onPress={submitRegistration} disabled={!canSubmitRegistration} />
              </>
              )}
            </View>
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
                  <Text style={styles.muted}>Informe o e-mail da conta para receber um código de 6 números.</Text>
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
                  <Value>Código por e-mail</Value>
                  <Text style={styles.muted}>Você digita o código e escolhe uma nova senha. A senha atual continua valendo até lá.</Text>
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
                  <Text style={styles.cardTitle}>Trocar senha</Text>
                  <Text style={styles.muted}>Digite o código enviado por e-mail e escolha uma nova senha.</Text>
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
                label="Código"
                value={resetCode}
                onChangeText={(value) => {
                  setResetCode(onlyDigits(value).slice(0, 6));
                  setErrorMessage('');
                }}
                keyboardType="numeric"
                autoCapitalize="none"
                placeholder="6 números"
                errorText={resetCodeError}
                helpText="O código vale por 15 minutos."
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
                helpText={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`}
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
              <Text style={styles.cardTitle}>Verifique seu e-mail</Text>
              <Text style={styles.centerText}>{resetInfoMessage || 'Enviamos um código para seu e-mail.'}</Text>
              {resetDebugCode ? (
                <View style={styles.debugCodeBox}>
                  <Text style={styles.debugLabel}>Código de teste</Text>
                  <Text style={styles.debugCode}>{resetDebugCode}</Text>
                </View>
              ) : null}
              <Button title="Entrar agora" icon={LogIn} onPress={openLogin} />
            </Card>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The login used to draw clouds, leaves and houses behind the logo; it is plain now. */
function LoginBackdrop() {
  return null;
}

function RegisterField({
  label,
  value,
  onChangeText,
  icon: Icon,
  placeholder,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  errorText,
  right,
  onSubmitEditing
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
  right?: ReactNode;
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.registerField}>
      <Text style={styles.registerFieldLabel}>{label}</Text>
      <View style={[styles.registerInputFrame, errorText ? styles.registerInputFrameError : null]}>
        <View style={styles.registerInputIcon}>
          <Icon color={colors.muted} size={18} />
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          style={styles.registerInput}
          placeholderTextColor={colors.muted}
        />
        {right ? <View style={styles.registerInputAction}>{right}</View> : null}
      </View>
      {errorText ? <Text style={styles.fieldError}>{errorText}</Text> : null}
    </View>
  );
}

function PasswordToggle({ visible, onPress, label }: { visible: boolean; onPress: () => void; label: string }) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.passwordToggle}>
      <Icon color={colors.muted} size={17} />
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
          <Icon color={colors.muted} size={19} />
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
        { opacity: disabled ? 0.95 : pressed ? 0.86 : 1 }
      ]}
    >
      <Icon color={colors.surface} size={22} />
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
      <Icon color={colors.blue} size={compact ? 18 : 23} />
      <Text style={[styles.loginGhostButtonText, compact ? styles.loginGhostButtonTextCompact : null]}>{title}</Text>
    </Pressable>
  );
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

const INVITE_CODE_LENGTH = 8;

/** The letters and numbers of a typed code, upper case, without dash or spaces. */
function inviteCodeDigits(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INVITE_CODE_LENGTH);
}

/** XXXX-XXXX while typing, however the code was typed or pasted. */
function formatInviteCode(value: string) {
  const chars = inviteCodeDigits(value);
  return chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
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
  return value.length >= MIN_PASSWORD_LENGTH ? '' : `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: spacing.xl,
    gap: 13,
    position: 'relative'
  },
  loginBackdrop: {
    position: 'absolute',
    top: 0,
    left: -28,
    right: -28,
    height: 250,
    alignItems: 'center',
    overflow: 'hidden'
  },
  backdropGlow: {
    position: 'absolute',
    top: 4,
    width: 430,
    height: 220,
    borderRadius: 220,
    backgroundColor: colors.pressed,
    opacity: 0.78
  },
  backdropCloud: {
    position: 'absolute',
    width: 54,
    height: 15,
    borderRadius: 999,
    backgroundColor: colors.pressed,
    opacity: 0.45
  },
  backdropCloudLeft: {
    top: 84,
    left: 44
  },
  backdropCloudRight: {
    top: 82,
    right: 42
  },
  backdropLeafGroupLeft: {
    position: 'absolute',
    top: 88,
    left: '50%',
    width: 82,
    height: 42,
    marginLeft: -150,
    opacity: 0.48,
    transform: [{ rotate: '-6deg' }]
  },
  backdropLeafGroupRight: {
    position: 'absolute',
    top: 88,
    left: '50%',
    width: 82,
    height: 42,
    marginLeft: 68,
    opacity: 0.42,
    transform: [{ scaleX: -1 }, { rotate: '-6deg' }]
  },
  backdropLeaf: {
    position: 'absolute',
    width: 32,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.blueBorder
  },
  backdropLeafOne: {
    top: 2,
    left: 4,
    transform: [{ rotate: '28deg' }]
  },
  backdropLeafTwo: {
    top: 17,
    left: 26,
    transform: [{ rotate: '-18deg' }]
  },
  backdropLeafThree: {
    top: 28,
    left: 8,
    transform: [{ rotate: '18deg' }]
  },
  backdropVillage: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 1,
    height: 105,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    opacity: 0.2
  },
  backdropHouse: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: colors.track
  },
  backdropHouseSoft: {
    backgroundColor: colors.pressed
  },
  backdropHouseMuted: {
    backgroundColor: colors.border
  },
  brand: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 0,
    marginBottom: 10,
    zIndex: 1
  },
  logoMark: {
    width: 88,
    height: 92,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoShieldInner: {
    position: 'absolute',
    top: 14
  },
  logoHome: {
    position: 'absolute',
    top: 33
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 36
  },
  subtitle: {
    color: colors.muted,
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20
  },
  stack: {
    gap: spacing.md
  },
  loginStack: {
    gap: 14,
    zIndex: 1
  },
  raisedCard: {
    borderRadius: 14,
    borderColor: colors.track,
    padding: 14,
    shadowColor: colors.ink,
    shadowOpacity: 0,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0
  },
  loginCard: {
    gap: 9,
    paddingTop: 14,
    paddingBottom: 14
  },
  loginCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9
  },
  userIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginHeading: {
    flex: 1,
    gap: 2
  },
  loginCardTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 0
  },
  loginCardSubtitle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
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
    fontWeight: '600'
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
    fontWeight: '700'
  },
  errorBannerText: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
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
    fontWeight: '700'
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
    fontWeight: '700'
  },
  passwordToggle: {
    width: 34,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginField: {
    gap: 5
  },
  loginFieldLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700'
  },
  loginInputFrame: {
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center'
  },
  loginInputFrameError: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  loginInputIcon: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginInput: {
    flex: 1,
    minHeight: 40,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
    paddingRight: spacing.md
  },
  loginInputAction: {
    minWidth: 42,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.sm
  },
  loginFieldHelp: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600'
  },
  fieldError: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
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
  inlineActionTarget: {
    minHeight: 44,
    paddingHorizontal: 4,
    justifyContent: 'center'
  },
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: -4,
    marginBottom: 1
  },
  loginHint: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600'
  },
  inlineAction: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: '700'
  },
  loginPrimaryButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    shadowColor: colors.blue,
    shadowOpacity: 0,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 0
  },
  loginPrimaryButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0
  },
  loginFooterModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingTop: 2
  },
  loginGhostButton: {
    minHeight: 44,
    borderRadius: 9,
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
    minHeight: 44,
    minWidth: 0
  },
  loginGhostButtonText: {
    color: colors.blue,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0
  },
  loginGhostButtonTextCompact: {
    fontSize: 12
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
    fontSize: 15,
    fontWeight: '700'
  },
  signupCard: {
    gap: 12
  },
  signupHeaderModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  signupIconPanel: {
    width: 54,
    height: 54,
    borderRadius: 12,
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
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700'
  },
  signupText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  supportCardModern: {
    gap: 12
  },
  legalRow: {
    alignItems: 'center'
  },
  supportHeaderModern: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  supportActionsModern: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  registerStackModern: {
    gap: 14,
    zIndex: 1
  },
  registerPanel: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.track,
    padding: 14,
    gap: 10,
    shadowColor: colors.ink,
    shadowOpacity: 0,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 0
  },
  registerHeaderModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: 4
  },
  registerBackButton: {
    width: 46,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  registerTitle: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: 0
  },
  registerSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  houseConfirmed: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md
  },
  houseConfirmedIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center'
  },
  registerField: {
    gap: 4
  },
  registerFieldLabel: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  registerInputFrame: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center'
  },
  registerInputFrameError: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  registerInputIcon: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  registerInput: {
    flex: 1,
    minHeight: 40,
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
    paddingRight: spacing.sm
  },
  registerInputAction: {
    minWidth: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.xs
  },
  pendingBoxModern: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.amber,
    backgroundColor: colors.amberSoft,
    paddingHorizontal: spacing.md,
    justifyContent: 'center'
  },
  pendingTextModern: {
    color: colors.amber,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  readyBoxModern: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  readyTextModern: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  signupNoticeModern: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    backgroundColor: colors.greenSoft,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  noticeTextModern: {
    flex: 1,
    color: colors.teal,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
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
    height: 44,
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
    fontWeight: '700'
  },
  houseLabel: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 14
  },
  houseStatus: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700'
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
    fontWeight: '600'
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
    fontWeight: '700'
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
    fontWeight: '700'
  },
  debugCode: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: '700',
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
    fontWeight: '600'
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
    fontWeight: '600'
  }
});
