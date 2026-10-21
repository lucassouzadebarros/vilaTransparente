import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Alert } from '../utils/alert';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  ArrowLeft,
  BrickWall,
  Brush,
  Camera,
  CheckCircle2,
  CircleAlert,
  CircleArrowDown,
  CircleArrowUp,
  CircleMinus,
  CircleX,
  Clock3,
  Droplet,
  Fence,
  FileText,
  Home,
  ImagePlus,
  Lightbulb,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  PhoneCall,
  Send,
  Shield,
  ShieldCheck,
  X
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { PickedFile, pickImage, pickerErrorMessage } from '../utils/filePicker';
import { colors, spacing } from '../theme';
import { ProblemReport } from '../types';

const locations = ['Portão', 'Interfone', 'Corredor', 'Garagem', 'Área comum', 'Outro'];

const MAX_PHOTOS = 3;

type FieldErrors = Partial<Record<'title' | 'location' | 'category' | 'description', string>>;

const categories = [
  { label: 'Iluminação', icon: Lightbulb },
  { label: 'Portão', icon: Fence },
  { label: 'Interfone', icon: PhoneCall },
  { label: 'Limpeza', icon: Brush },
  { label: 'Estrutura', icon: BrickWall },
  { label: 'Vazamento', icon: Droplet },
  { label: 'Outro', icon: MoreHorizontal }
];

const priorities = [
  { label: 'Baixa', icon: CircleArrowDown, color: colors.green },
  { label: 'Média', icon: CircleMinus, color: '#D59A00' },
  { label: 'Alta', icon: CircleArrowUp, color: '#F27D24' },
  { label: 'Urgente', icon: CircleAlert, color: colors.red }
];

const statusOptions: Array<{ value: ProblemReport['status']; label: string; icon: LucideIcon; color: string }> = [
  { value: 'ABERTO', label: 'Aberto', icon: CircleAlert, color: colors.blue },
  { value: 'EM_ANALISE', label: 'Em análise', icon: Clock3, color: '#D59A00' },
  { value: 'RESOLVIDO', label: 'Resolvido', icon: CheckCircle2, color: colors.green },
  { value: 'CANCELADO', label: 'Cancelado', icon: CircleX, color: colors.red }
];

export function ReportProblemScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { isAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const compact = Math.min(width, 430) < 560;
  const editingReport = route.params?.report as ProblemReport | undefined;
  const isEditing = Boolean(editingReport?.id);
  const scrollRef = useRef<ScrollView>(null);
  const [title, setTitle] = useState('');
  const [locationChoice, setLocationChoice] = useState('');
  const [locationOther, setLocationOther] = useState('');
  // Nothing is pre-selected: a report that nobody classified used to arrive as "Iluminação" and "Urgente".
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('Média');
  const [status, setStatus] = useState<ProblemReport['status']>('ABERTO');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [legacyAttachment, setLegacyAttachment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const location = locationChoice === 'Outro' ? locationOther.trim() : locationChoice;

  function applyLocation(saved: string) {
    if (!saved) {
      setLocationChoice('');
      setLocationOther('');
    } else if (locations.includes(saved) && saved !== 'Outro') {
      setLocationChoice(saved);
      setLocationOther('');
    } else {
      setLocationChoice('Outro');
      setLocationOther(saved === 'Outro' ? '' : saved);
    }
  }

  useEffect(() => {
    setFieldErrors({});
    if (editingReport?.id) {
      setTitle(editingReport.title ?? '');
      applyLocation(editingReport.location ?? '');
      setCategory(editingReport.category || 'Outro');
      setPriority(fromProblemPriority(editingReport.priority));
      setStatus(editingReport.status ?? 'ABERTO');
      setDescription(editingReport.description ?? '');
      setPhotos([]);
      setLegacyAttachment(editingReport.attachmentName ?? '');
      setError('');
      return;
    }

    setTitle('');
    applyLocation('');
    setCategory('');
    setPriority('Média');
    setStatus('ABERTO');
    setDescription('');
    setPhotos([]);
    setLegacyAttachment('');
    setError('');
  }, [editingReport?.id, route.params?.formKey]);

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  function validate() {
    const next: FieldErrors = {};
    if (!title.trim()) {
      next.title = 'Dê um título curto ao problema.';
    }
    if (!locationChoice) {
      next.location = 'Escolha onde está o problema.';
    } else if (!location) {
      next.location = 'Escreva qual é o local.';
    }
    if (!category) {
      next.category = 'Escolha o tipo do problema.';
    }
    if (!description.trim()) {
      next.description = 'Descreva o que está acontecendo.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function addPhoto(source: 'camera' | 'library') {
    if (photos.length >= MAX_PHOTOS) {
      return;
    }
    try {
      const photo = await pickImage(source);
      if (photo) {
        setPhotos((current) => [...current, photo].slice(0, MAX_PHOTOS));
      }
    } catch (err) {
      Alert.alert('Relatar problema', pickerErrorMessage(err));
    }
  }

  async function submitReport() {
    if (saving) {
      return;
    }
    if (isEditing && !isAdmin) {
      setError('Apenas o administrador pode editar um relato já cadastrado.');
      return;
    }
    if (!validate()) {
      setError('Falta preencher os campos destacados em vermelho.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload: ProblemReport = {
        title: title.trim(),
        location: location.trim(),
        category,
        priority: toProblemPriority(priority),
        status: isEditing ? status : 'ABERTO',
        description: description.trim(),
        attachmentName: legacyAttachment || null
      };

      let failedPhotos = 0;
      if (isEditing && editingReport?.id) {
        await api.updateProblemReport(editingReport.id, payload);
      } else {
        const created = await api.createProblemReport(payload);
        for (const photo of photos) {
          try {
            if (!created.id) {
              throw new Error('sem id');
            }
            await api.uploadProblemPhoto(created.id, photo);
          } catch {
            failedPhotos += 1;
          }
        }
      }

      Alert.alert(
        isEditing ? 'Editar problema' : 'Relatar problema',
        isEditing
          ? 'Relato atualizado para acompanhamento no aplicativo.'
          : failedPhotos > 0
            ? `Relato cadastrado, mas ${failedPhotos} foto(s) não foram enviadas. Abra o relato para tentar de novo.`
            : 'Relato cadastrado para acompanhamento no aplicativo.'
      );
      navigation.navigate('ProblemReports', { refreshKey: Date.now() });
    } catch (err) {
      setError(apiErrorMessage(err, isEditing ? 'Não consegui atualizar o relato.' : 'Não consegui cadastrar o relato.'));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } finally {
      setSaving(false);
    }
  }

  function returnToMenu() {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('ProblemReports');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView role="main" ref={scrollRef} style={styles.screen} contentContainerStyle={[styles.content, compact ? styles.contentCompact : null]} keyboardShouldPersistTaps="handled">
      <SoftBackdrop />
      {compact ? null : <PortalBrandHeader compact={compact} />}

      <View style={[styles.formCard, compact ? styles.formCardCompact : null]}>
        <View style={[styles.formHeader, compact ? styles.formHeaderCompact : null]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={returnToMenu} style={[styles.backButton, compact ? styles.backButtonCompact : null]}>
            <ArrowLeft color={colors.muted} size={compact ? 22 : 28} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text role="heading" style={[styles.title, compact ? styles.titleCompact : null]}>{isEditing ? 'Editar problema' : 'Relatar problema'}</Text>
            <Text style={[styles.subtitle, compact ? styles.subtitleCompact : null]}>
              {isEditing ? 'Atualize status, prioridade e detalhes para acompanhamento.' : 'Descreva o problema encontrado para a administração analisar.'}
            </Text>
          </View>
        </View>

        <FormField label="Título do problema" required error={fieldErrors.title} compact={compact}>
          <View style={[styles.inputFrame, compact ? styles.inputFrameCompact : null, fieldErrors.title ? styles.inputFrameError : null]}>
            <FileText color={colors.muted} size={compact ? 18 : 26} />
            <TextInput
              value={title}
              onChangeText={(value) => {
                setTitle(value);
                clearFieldError('title');
              }}
              maxLength={150}
              placeholder="Ex.: Vazamento no corredor"
              placeholderTextColor={colors.muted}
              style={[styles.input, compact ? styles.inputCompact : null]}
            />
          </View>
        </FormField>

        {error ? (
          <View style={styles.errorBanner}>
            <CircleAlert color={colors.red} size={compact ? 20 : 26} />
            <Text style={[styles.errorText, compact ? styles.errorTextCompact : null]}>{error}</Text>
          </View>
        ) : null}

        {isEditing ? (
          <FormField label="Status do relato" compact={compact}>
            <View style={[styles.statusGrid, compact ? styles.chipGridCompact : null]}>
              {statusOptions.map((item) => (
                <SelectableChip
                  key={item.value}
                  label={item.label}
                  icon={item.icon}
                  selected={status === item.value}
                  color={item.color}
                  compact={compact}
                  columns={2}
                  onPress={() => setStatus(item.value)}
                />
              ))}
            </View>
          </FormField>
        ) : null}

        <FormField label="Local" required error={fieldErrors.location} compact={compact}>
          <View style={[styles.chipGrid, compact ? styles.chipGridCompact : null]}>
            {locations.map((item) => (
              <SelectableChip
                key={item}
                label={item}
                icon={MapPin}
                selected={locationChoice === item}
                color={colors.blue}
                compact={compact}
                columns={3}
                onPress={() => {
                  setLocationChoice(item);
                  clearFieldError('location');
                }}
              />
            ))}
          </View>
          {locationChoice === 'Outro' ? (
            <View style={[styles.inputFrame, compact ? styles.inputFrameCompact : null, fieldErrors.location ? styles.inputFrameError : null]}>
              <MapPin color={colors.muted} size={compact ? 18 : 26} />
              <TextInput
                value={locationOther}
                onChangeText={(value) => {
                  setLocationOther(value);
                  clearFieldError('location');
                }}
                maxLength={60}
                placeholder="Qual é o local?"
                placeholderTextColor={colors.muted}
                style={[styles.input, compact ? styles.inputCompact : null]}
              />
            </View>
          ) : null}
        </FormField>

        <FormField label="Tipo do problema" required error={fieldErrors.category} compact={compact}>
          <View style={[styles.chipGrid, compact ? styles.chipGridCompact : null]}>
            {categories.map((item) => (
              <SelectableChip
                key={item.label}
                label={item.label}
                icon={item.icon}
                selected={category === item.label}
                color={colors.blue}
                compact={compact}
                columns={4}
                onPress={() => {
                  setCategory(item.label);
                  clearFieldError('category');
                }}
              />
            ))}
          </View>
        </FormField>

        <FormField label="Prioridade" compact={compact}>
          <View style={[styles.priorityGrid, compact ? styles.chipGridCompact : null]}>
            {priorities.map((item) => (
              <SelectableChip
                key={item.label}
                label={item.label}
                icon={item.icon}
                selected={priority === item.label}
                color={item.color}
                compact={compact}
                columns={4}
                onPress={() => setPriority(item.label)}
              />
            ))}
          </View>
        </FormField>

        <FormField label="Descrição" required error={fieldErrors.description} compact={compact}>
          <View style={[styles.inputFrame, styles.textareaFrame, compact ? styles.textareaFrameCompact : null, fieldErrors.description ? styles.inputFrameError : null]}>
            <MessageCircle color={colors.muted} size={compact ? 18 : 26} style={styles.textareaIcon} />
            <TextInput
              value={description}
              onChangeText={(value) => {
                setDescription(value.slice(0, 500));
                clearFieldError('description');
              }}
              placeholder="Descreva o problema com o máximo de detalhes possível..."
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.textarea, compact ? styles.inputCompact : null]}
            />
            <Text style={styles.counter}>{description.length}/500</Text>
          </View>
        </FormField>

        {!isEditing ? (
          <View style={styles.attachmentsSection}>
            <View>
              <Text style={[styles.fieldLabel, compact ? styles.fieldLabelCompact : null]}>Fotos (opcional)</Text>
              <Text style={[styles.helpText, compact ? styles.helpTextCompact : null]}>
                Até {MAX_PHOTOS} fotos ajudam a administração a entender o problema.
              </Text>
            </View>
            {photos.length > 0 ? (
              <View style={styles.photoRow}>
                {photos.map((photo, index) => (
                  <View key={`${photo.uri}-${index}`} style={styles.photoSlot}>
                    <Image source={{ uri: photo.uri }} style={styles.thumbnailImage} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Remover foto"
                      onPress={() => setPhotos((current) => current.filter((_, position) => position !== index))}
                      style={styles.removePhoto}
                    >
                      <X color={colors.muted} size={18} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {photos.length < MAX_PHOTOS ? (
              <View style={[styles.photoActionsRow, compact ? styles.photoActionsRowCompact : null]}>
                <Pressable accessibilityRole="button" onPress={() => addPhoto('camera')} style={[styles.photoButton, styles.photoButtonFlex, compact ? styles.photoButtonCompact : null]}>
                  <Camera color={colors.blue} size={compact ? 18 : 22} />
                  <Text style={[styles.photoButtonText, compact ? styles.photoButtonTextCompact : null]}>Tirar foto</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => addPhoto('library')} style={[styles.photoButton, styles.photoButtonFlex, compact ? styles.photoButtonCompact : null]}>
                  <ImagePlus color={colors.blue} size={compact ? 18 : 22} />
                  <Text style={[styles.photoButtonText, compact ? styles.photoButtonTextCompact : null]}>Da galeria</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.successBanner}>
          <ShieldCheck color={colors.teal} size={28} />
          <Text style={[styles.successText, compact ? styles.successTextCompact : null]}>
            {isEditing ? 'As alterações ficarão disponíveis para acompanhamento no aplicativo.' : 'Seu relato será salvo no aplicativo para análise e acompanhamento.'}
          </Text>
        </View>

        <View style={[styles.footerActions, compact ? styles.footerActionsCompact : null]}>
          <Pressable accessibilityRole="button" onPress={returnToMenu} style={[styles.cancelButton, compact ? styles.footerButtonCompact : null]}>
            <Text style={[styles.cancelButtonText, compact ? styles.footerButtonTextCompact : null]}>Cancelar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={submitReport} style={[styles.submitButton, compact ? styles.footerButtonCompact : null, saving ? styles.submitButtonDisabled : null]}>
            <Send color={colors.surface} size={compact ? 19 : 25} />
            <Text style={[styles.submitButtonText, compact ? styles.footerButtonTextCompact : null]}>{saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Enviar relato'}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PortalBrandHeader({ compact }: { compact: boolean }) {
  return (
    <View style={[styles.brand, compact ? styles.brandCompact : null]}>
      <View style={[styles.logoMark, compact ? styles.logoMarkCompact : null]}>
        <Shield color={colors.teal} fill={colors.teal} size={compact ? 70 : 112} strokeWidth={1.8} />
        <Shield color={colors.surface} size={compact ? 51 : 82} strokeWidth={2.2} style={[styles.logoShieldInner, compact ? styles.logoShieldInnerCompact : null]} />
        <Home color={colors.surface} fill={colors.surface} size={compact ? 23 : 36} style={[styles.logoHome, compact ? styles.logoHomeCompact : null]} />
      </View>
      <Text style={[styles.brandTitle, compact ? styles.brandTitleCompact : null]}>Portal da Vila</Text>
      <Text style={[styles.brandSubtitle, compact ? styles.brandSubtitleCompact : null]}>Mensalidades, Pix, serviços e orçamentos</Text>
    </View>
  );
}

function FormField({
  label,
  children,
  compact,
  required,
  error
}: {
  label: string;
  children: React.ReactNode;
  compact: boolean;
  required?: boolean;
  error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, compact ? styles.fieldLabelCompact : null]}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      {children}
      {error ? <Text style={[styles.fieldError, compact ? styles.fieldErrorCompact : null]}>{error}</Text> : null}
    </View>
  );
}

function SelectableChip({
  label,
  icon: Icon,
  selected,
  color,
  compact,
  columns = 4,
  onPress
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  color: string;
  compact: boolean;
  /** How many chips share a row on a phone: the width is a fraction of the form so the rows line up. */
  columns?: 2 | 3 | 4;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        compact ? styles.chipCompact : null,
        compact ? (columns === 3 ? styles.chipThird : columns === 2 ? styles.chipHalf : null) : null,
        { borderColor: selected ? color : colors.border },
        selected ? styles.chipSelected : null,
        pressed ? styles.chipPressed : null
      ]}
    >
      <Icon color={color} size={compact ? 16 : 25} />
      <Text style={[styles.chipText, compact ? styles.chipTextCompact : null, selected ? { color } : null]}>{label}</Text>
    </Pressable>
  );
}

function toProblemPriority(value: string): ProblemReport['priority'] {
  if (value === 'Baixa') {
    return 'BAIXA';
  }
  if (value === 'Alta') {
    return 'ALTA';
  }
  if (value === 'Urgente') {
    return 'URGENTE';
  }
  return 'MEDIA';
}

function fromProblemPriority(value?: ProblemReport['priority']) {
  if (value === 'BAIXA') {
    return 'Baixa';
  }
  if (value === 'ALTA') {
    return 'Alta';
  }
  if (value === 'URGENTE') {
    return 'Urgente';
  }
  return 'Média';
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    width: '100%',
    maxWidth: 940,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingTop: 22,
    paddingBottom: 130,
    position: 'relative'
  },
  contentCompact: {
    paddingHorizontal: 10,
    paddingTop: 12
  },
  brand: {
    alignItems: 'center',
    marginBottom: 28,
    zIndex: 1
  },
  brandCompact: {
    marginBottom: 20
  },
  logoMark: {
    width: 118,
    height: 114,
    alignItems: 'center',
    justifyContent: 'center'
  },
  logoMarkCompact: {
    width: 76,
    height: 74
  },
  logoShieldInner: {
    position: 'absolute',
    top: 18
  },
  logoShieldInnerCompact: {
    top: 11
  },
  logoHome: {
    position: 'absolute',
    top: 43
  },
  logoHomeCompact: {
    top: 27
  },
  brandTitle: {
    color: colors.ink,
    fontSize: 44,
    lineHeight: 54,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center'
  },
  brandTitleCompact: {
    fontSize: 28,
    lineHeight: 34
  },
  brandSubtitle: {
    color: colors.muted,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    textAlign: 'center'
  },
  brandSubtitleCompact: {
    fontSize: 13,
    lineHeight: 18
  },
  formCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5ECF4',
    padding: 34,
    gap: 22,
    shadowColor: '#163052',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    zIndex: 1
  },
  formCardCompact: {
    padding: 14,
    gap: 13
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28
  },
  formHeaderCompact: {
    gap: 12,
    alignItems: 'flex-start'
  },
  backButton: {
    width: 70,
    height: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  backButtonCompact: {
    width: 46,
    height: 46
  },
  formHeaderCopy: {
    flex: 1,
    gap: 6
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: 0
  },
  titleCompact: {
    fontSize: 22,
    lineHeight: 27
  },
  subtitle: {
    color: colors.muted,
    fontSize: 19,
    lineHeight: 28,
    fontWeight: '600'
  },
  subtitleCompact: {
    fontSize: 12,
    lineHeight: 17
  },
  field: {
    gap: 9
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '900'
  },
  fieldLabelCompact: {
    fontSize: 13,
    lineHeight: 17
  },
  requiredMark: {
    color: colors.red
  },
  fieldError: {
    color: colors.red,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800'
  },
  fieldErrorCompact: {
    fontSize: 12,
    lineHeight: 16
  },
  inputFrameError: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  inputFrame: {
    minHeight: 66,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFCBE0',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 20
  },
  inputFrameCompact: {
    minHeight: 46,
    gap: 10,
    paddingHorizontal: 12
  },
  input: {
    flex: 1,
    minHeight: 62,
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    paddingVertical: 0
  },
  inputCompact: {
    minHeight: 44,
    fontSize: 13,
    lineHeight: 18
  },
  selectText: {
    flex: 1,
    color: colors.ink,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600'
  },
  selectTextCompact: {
    fontSize: 13,
    lineHeight: 18
  },
  placeholderText: {
    color: colors.muted
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16
  },
  chipGridCompact: {
    gap: 8,
    // Rows fill from the left: the last row used to spread its chips apart and look misaligned.
    justifyContent: 'flex-start'
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16
  },
  chip: {
    minHeight: 62,
    minWidth: 178,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13
  },
  chipCompact: {
    width: '23%',
    minHeight: 44,
    minWidth: 0,
    flexGrow: 0,
    paddingHorizontal: 4,
    gap: 5
  },
  chipThird: {
    width: '31.5%'
  },
  chipHalf: {
    width: '48%'
  },
  chipSelected: {
    backgroundColor: '#F7FAFF'
  },
  chipPressed: {
    opacity: 0.8
  },
  chipText: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700'
  },
  chipTextCompact: {
    fontSize: 12,
    lineHeight: 15
  },
  textareaFrame: {
    minHeight: 132,
    alignItems: 'flex-start',
    paddingTop: 18,
    paddingBottom: 28
  },
  textareaFrameCompact: {
    minHeight: 104,
    paddingTop: 12
  },
  textareaIcon: {
    marginTop: 2
  },
  textarea: {
    minHeight: 92,
    textAlignVertical: 'top',
    paddingTop: 0
  },
  counter: {
    position: 'absolute',
    right: 18,
    bottom: 10,
    color: colors.muted,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600'
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10
  },
  photoSlot: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#EEF4FA'
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 13
  },
  photoActionsRowCompact: {
    gap: 8
  },
  photoButtonFlex: {
    flex: 1
  },
  attachmentsSection: {
    gap: 16
  },
  helpText: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    marginTop: 3
  },
  helpTextCompact: {
    fontSize: 12,
    lineHeight: 17
  },
  attachmentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
    flexWrap: 'wrap'
  },
  attachmentsRowCompact: {
    gap: 10
  },
  attachmentDrop: {
    width: 240,
    height: 122,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFCBE0',
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14
  },
  attachmentDropCompact: {
    width: '100%',
    height: 76
  },
  attachmentText: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600'
  },
  attachmentTextCompact: {
    fontSize: 12,
    lineHeight: 17
  },
  thumbnail: {
    width: 172,
    height: 122,
    borderRadius: 8,
    backgroundColor: '#EEF4FA',
    overflow: 'visible'
  },
  thumbnailCompact: {
    width: 116,
    height: 80
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8
  },
  thumbnailPlaceholder: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#EEF4FA'
  },
  removePhoto: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#163052',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  photoActions: {
    flex: 1,
    minWidth: 252,
    gap: 13
  },
  photoActionsCompact: {
    minWidth: 0,
    width: '100%',
    gap: 8
  },
  photoButton: {
    minHeight: 55,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16
  },
  photoButtonCompact: {
    minHeight: 42
  },
  photoButtonText: {
    color: colors.blue,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '900'
  },
  photoButtonTextCompact: {
    fontSize: 13,
    lineHeight: 18
  },
  successBanner: {
    minHeight: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#B8E2D1',
    backgroundColor: '#EAF8F2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 17,
    paddingHorizontal: 22,
    paddingVertical: 14
  },
  successText: {
    flex: 1,
    color: colors.teal,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '700'
  },
  successTextCompact: {
    fontSize: 13,
    lineHeight: 18
  },
  errorBanner: {
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  errorText: {
    flex: 1,
    color: colors.red,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800'
  },
  errorTextCompact: {
    fontSize: 12,
    lineHeight: 16
  },
  footerActions: {
    flexDirection: 'row',
    gap: 28
  },
  footerActionsCompact: {
    gap: 12
  },
  cancelButton: {
    flex: 1,
    minHeight: 70,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  footerButtonCompact: {
    minHeight: 50
  },
  cancelButtonText: {
    color: colors.blue,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900'
  },
  footerButtonTextCompact: {
    fontSize: 14,
    lineHeight: 18
  },
  submitButton: {
    flex: 1.2,
    minHeight: 70,
    borderRadius: 8,
    backgroundColor: colors.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    shadowColor: colors.blue,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3
  },
  submitButtonDisabled: {
    opacity: 0.62
  },
  submitButtonText: {
    color: colors.surface,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900'
  }
});
