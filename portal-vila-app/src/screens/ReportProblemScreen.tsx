import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  BrickWall,
  Brush,
  Camera,
  ChevronDown,
  CircleAlert,
  CircleArrowDown,
  CircleArrowUp,
  CircleMinus,
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
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { ProblemReport } from '../types';

const locations = ['Portão', 'Interfone', 'Corredor', 'Garagem', 'Área comum', 'Outro'];

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

export function ReportProblemScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const compact = Math.min(width, 430) < 560;
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('Iluminação');
  const [priority, setPriority] = useState('Urgente');
  const [description, setDescription] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = Boolean(title.trim() && location.trim() && description.trim() && !saving);

  function selectLocation() {
    const currentIndex = locations.indexOf(location);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % locations.length : 0;
    setLocation(locations[nextIndex]);
  }

  function pickPhoto(capture?: boolean) {
    if (typeof document === 'undefined') {
      Alert.alert('Relatar problema', 'Seleção de foto disponível na versão web publicada.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) {
      input.setAttribute('capture', 'environment');
    }
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      setPhotoName(file.name);
      setPhotoPreview(URL.createObjectURL(file));
    };
    input.click();
  }

  async function submitReport() {
    if (saving) {
      return;
    }
    if (!canSubmit) {
      Alert.alert('Relatar problema', 'Informe o título, selecione o local e descreva o problema.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.createProblemReport({
        title: title.trim(),
        location: location.trim(),
        category,
        priority: toProblemPriority(priority),
        status: 'ABERTO',
        description: description.trim(),
        attachmentName: photoName || null
      });
      Alert.alert('Relatar problema', 'Relato cadastrado para acompanhamento no aplicativo.');
      navigation.navigate('ProblemReports', { refreshKey: Date.now() });
    } catch (err) {
      setError(apiErrorMessage(err, 'Não consegui cadastrar o relato.'));
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
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, compact ? styles.contentCompact : null]}>
      <SoftBackdrop />
      <PortalBrandHeader compact={compact} />

      <View style={[styles.formCard, compact ? styles.formCardCompact : null]}>
        <View style={[styles.formHeader, compact ? styles.formHeaderCompact : null]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={returnToMenu} style={[styles.backButton, compact ? styles.backButtonCompact : null]}>
            <ArrowLeft color={colors.muted} size={compact ? 22 : 28} />
          </Pressable>
          <View style={styles.formHeaderCopy}>
            <Text style={[styles.title, compact ? styles.titleCompact : null]}>Relatar problema</Text>
            <Text style={[styles.subtitle, compact ? styles.subtitleCompact : null]}>Descreva o problema encontrado para a administração analisar.</Text>
          </View>
        </View>

        <FormField label="Título do problema" compact={compact}>
          <View style={[styles.inputFrame, compact ? styles.inputFrameCompact : null]}>
            <FileText color={colors.muted} size={compact ? 18 : 26} />
            <TextInput
              value={title}
              onChangeText={setTitle}
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

        <FormField label="Local" compact={compact}>
          <Pressable accessibilityRole="button" onPress={selectLocation} style={[styles.inputFrame, compact ? styles.inputFrameCompact : null]}>
            <MapPin color={colors.muted} size={compact ? 19 : 27} />
            <Text style={[styles.selectText, compact ? styles.selectTextCompact : null, !location ? styles.placeholderText : null]}>{location || 'Selecione o local'}</Text>
            <ChevronDown color={colors.muted} size={compact ? 18 : 25} />
          </Pressable>
        </FormField>

        <FormField label="Categoria" compact={compact}>
          <View style={[styles.chipGrid, compact ? styles.chipGridCompact : null]}>
            {categories.map((item) => (
              <SelectableChip
                key={item.label}
                label={item.label}
                icon={item.icon}
                selected={category === item.label}
                color={colors.blue}
                compact={compact}
                onPress={() => setCategory(item.label)}
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
                onPress={() => setPriority(item.label)}
              />
            ))}
          </View>
        </FormField>

        <FormField label="Descrição" compact={compact}>
          <View style={[styles.inputFrame, styles.textareaFrame, compact ? styles.textareaFrameCompact : null]}>
            <MessageCircle color={colors.muted} size={compact ? 18 : 26} style={styles.textareaIcon} />
            <TextInput
              value={description}
              onChangeText={(value) => setDescription(value.slice(0, 500))}
              placeholder="Descreva o problema com o máximo de detalhes possível..."
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.textarea, compact ? styles.inputCompact : null]}
            />
            <Text style={styles.counter}>{description.length}/500</Text>
          </View>
        </FormField>

        <View style={styles.attachmentsSection}>
          <View>
            <Text style={[styles.fieldLabel, compact ? styles.fieldLabelCompact : null]}>Anexos</Text>
            <Text style={[styles.helpText, compact ? styles.helpTextCompact : null]}>Envie fotos que ajudem a entender melhor o problema.</Text>
          </View>
          <View style={[styles.attachmentsRow, compact ? styles.attachmentsRowCompact : null]}>
            <View style={[styles.attachmentDrop, compact ? styles.attachmentDropCompact : null]}>
              <ImagePlus color={colors.muted} size={compact ? 20 : 28} />
              <Text style={[styles.attachmentText, compact ? styles.attachmentTextCompact : null]}>{photoName ? '1 foto anexada' : 'Nenhuma foto anexada'}</Text>
            </View>

            <View style={[styles.thumbnail, compact ? styles.thumbnailCompact : null]}>
              {photoPreview ? <Image source={{ uri: photoPreview }} style={styles.thumbnailImage} /> : <View style={styles.thumbnailPlaceholder} />}
              {photoName ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Remover foto" onPress={() => { setPhotoName(''); setPhotoPreview(''); }} style={styles.removePhoto}>
                  <X color={colors.muted} size={18} />
                </Pressable>
              ) : null}
            </View>

            <View style={[styles.photoActions, compact ? styles.photoActionsCompact : null]}>
              <Pressable accessibilityRole="button" onPress={() => pickPhoto()} style={[styles.photoButton, compact ? styles.photoButtonCompact : null]}>
                <ImagePlus color={colors.blue} size={compact ? 18 : 22} />
                <Text style={[styles.photoButtonText, compact ? styles.photoButtonTextCompact : null]}>Selecionar foto</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => pickPhoto(true)} style={[styles.photoButton, compact ? styles.photoButtonCompact : null]}>
                <Camera color={colors.blue} size={compact ? 18 : 22} />
                <Text style={[styles.photoButtonText, compact ? styles.photoButtonTextCompact : null]}>Tirar foto</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.successBanner}>
          <ShieldCheck color={colors.teal} size={28} />
          <Text style={[styles.successText, compact ? styles.successTextCompact : null]}>Seu relato será salvo no aplicativo para análise e acompanhamento.</Text>
        </View>

        <View style={[styles.footerActions, compact ? styles.footerActionsCompact : null]}>
          <Pressable accessibilityRole="button" onPress={returnToMenu} style={[styles.cancelButton, compact ? styles.footerButtonCompact : null]}>
            <Text style={[styles.cancelButtonText, compact ? styles.footerButtonTextCompact : null]}>Cancelar</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={submitReport} style={[styles.submitButton, compact ? styles.footerButtonCompact : null, !canSubmit ? styles.submitButtonDisabled : null]}>
            <Send color={colors.surface} size={compact ? 19 : 25} />
            <Text style={[styles.submitButtonText, compact ? styles.footerButtonTextCompact : null]}>{saving ? 'Salvando...' : 'Enviar relato'}</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
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

function FormField({ label, children, compact }: { label: string; children: React.ReactNode; compact: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, compact ? styles.fieldLabelCompact : null]}>{label}</Text>
      {children}
    </View>
  );
}

function SelectableChip({
  label,
  icon: Icon,
  selected,
  color,
  compact,
  onPress
}: {
  label: string;
  icon: LucideIcon;
  selected: boolean;
  color: string;
  compact: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        compact ? styles.chipCompact : null,
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
  chipGridCompact: {
    gap: 8,
    justifyContent: 'space-between'
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
    minHeight: 40,
    minWidth: 0,
    flexGrow: 0,
    paddingHorizontal: 4,
    gap: 5
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
    fontSize: 11,
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
