import { ReactNode, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, CalendarDays, CreditCard, Eye, FileText, LucideIcon, Trash2, Upload } from 'lucide-react-native';
import { SoftBackdrop } from '../components/SoftBackdrop';
import { api } from '../services/api';
import { colors, spacing } from '../theme';

export function FinishServiceScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const id = Number(route.params?.id ?? 1);
  const [finalValue, setFinalValue] = useState('');
  const [completedDate, setCompletedDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');
  const [generateExpense, setGenerateExpense] = useState(true);
  const [documentName, setDocumentName] = useState('Nota Fiscal');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  async function finish() {
    const paidValue = parseCurrencyInput(finalValue);
    if (paidValue <= 0) {
      Alert.alert('Serviço', 'Informe o valor final pago.');
      return;
    }

    let documentId: number | undefined;
    if (documentFile) {
      const document = await api.uploadDocument(documentFile, {
        name: documentName.trim() || documentFile.name,
        type: 'NOTA_FISCAL',
        relatedType: 'SERVICE',
        relatedId: id,
        description: 'Documento fiscal anexado na finalização do serviço.'
      });
      documentId = document.id;
    } else if (documentUrl.trim()) {
      const document = await api.createDocument({
        name: documentName.trim() || 'Nota Fiscal',
        type: 'NOTA_FISCAL',
        url: documentUrl.trim(),
        relatedType: 'SERVICE',
        relatedId: id,
        description: 'Documento fiscal anexado na finalização do serviço.'
      });
      documentId = document.id;
    }

    await api.finishService(id, {
      finalValue: paidValue,
      completedDate,
      supplier,
      supplierDocument,
      documentId,
      generateExpense,
      notes: ''
    });
    Alert.alert('Serviço', 'Serviço finalizado e prestação de contas atualizada.');
    navigation.goBack();
  }

  function previewDocument() {
    const previewUrl = documentFile ? URL.createObjectURL(documentFile) : documentUrl.trim();
    if (!previewUrl) {
      Alert.alert('Documento', 'Informe o link do PDF da nota fiscal ou recibo.');
      return;
    }
    Linking.openURL(api.documentUrl(previewUrl)).catch(() => Alert.alert('Documento', 'Não foi possível abrir o link informado.'));
  }

  function selectPdf() {
    if (typeof document === 'undefined') {
      Alert.alert('Documento', 'Seleção de arquivo disponível no app web.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      setDocumentFile(file);
      setDocumentUrl('');
      if (!documentName.trim() || documentName === 'Nota Fiscal') {
        setDocumentName(file.name.replace(/\.pdf$/i, ''));
      }
    };
    input.click();
  }

  function clearDocument() {
    setDocumentFile(null);
    setDocumentUrl('');
    setDocumentName('Nota Fiscal');
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SoftBackdrop compact />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color={colors.blue} size={22} strokeWidth={2.6} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Finalizar serviço</Text>
          <Text style={styles.subtitle}>Pagamento, nota fiscal e despesa</Text>
        </View>
      </View>
      <View style={styles.divider} />

      <FormSection icon={CreditCard} title="Dados do pagamento">
        <FormField
          label="Valor final pago"
          value={finalValue}
          onChangeText={(value) => setFinalValue(formatCurrencyInput(value))}
          keyboardType="numeric"
          placeholder="R$ 0,00"
        />
        <FormField
          label="Data de conclusão"
          value={completedDate}
          onChangeText={setCompletedDate}
          placeholder="2026-06-06"
          right={<CalendarDays color={colors.blue} size={19} strokeWidth={2.4} />}
        />
        <FormField label="Fornecedor executado" value={supplier} onChangeText={setSupplier} placeholder="Digite o nome do fornecedor" />
        <FormField label="CNPJ do fornecedor" value={supplierDocument} onChangeText={setSupplierDocument} placeholder="12.345.678/0001-90" />

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Gerar despesa automaticamente</Text>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: generateExpense }}
            onPress={() => setGenerateExpense((current) => !current)}
            style={styles.switchCard}
          >
            <View style={[styles.switchTrack, generateExpense ? styles.switchTrackActive : null]}>
              <View style={[styles.switchThumb, generateExpense ? styles.switchThumbActive : null]} />
            </View>
            <View style={styles.switchCopy}>
              <Text style={styles.switchTitle}>{generateExpense ? 'Ativado' : 'Desativado'}</Text>
              <Text style={styles.switchText}>
                {generateExpense ? 'Uma despesa será criada automaticamente.' : 'A despesa não será criada automaticamente.'}
              </Text>
            </View>
          </Pressable>
        </View>
      </FormSection>

      <FormSection icon={FileText} title="Documento fiscal">
        <Text style={styles.sectionHelp}>Anexe um PDF por link. Esse documento aparece no detalhe do serviço para prestação de contas.</Text>
        <FormField label="Nome do documento" value={documentName} onChangeText={setDocumentName} placeholder="Nota Fiscal" />
        <FormField label="Link do PDF da nota fiscal/recibo" value={documentUrl} onChangeText={setDocumentUrl} placeholder="https://.../nota-fiscal.pdf" />
        {documentFile ? <Text style={styles.sectionHelp}>Arquivo selecionado: {documentFile.name}</Text> : null}
        <View style={styles.documentActions}>
          <DocumentActionButton title="Selecionar PDF" icon={Upload} onPress={selectPdf} />
          <DocumentActionButton title="Visualizar PDF" icon={Eye} onPress={previewDocument} />
          <DocumentActionButton title="Limpar documento" icon={Trash2} danger onPress={clearDocument} />
        </View>
      </FormSection>

      <View style={styles.footerActions}>
        <FooterActionButton title="Cancelar" onPress={() => navigation.goBack()} />
        <FooterActionButton title="Finalizar serviço" onPress={finish} primary />
      </View>
    </ScrollView>
  );
}

function FormSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Icon color={colors.blue} size={24} strokeWidth={2.4} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  right,
  style
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputFrame}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          style={styles.input}
          placeholderTextColor={colors.muted}
        />
        {right ? <View style={styles.inputAction}>{right}</View> : null}
      </View>
    </View>
  );
}

function DocumentActionButton({ title, icon: Icon, onPress, danger }: { title: string; icon: LucideIcon; onPress: () => void; danger?: boolean }) {
  const color = danger ? colors.red : colors.blue;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.documentActionButton,
        danger ? styles.documentActionButtonDanger : null,
        { opacity: pressed ? 0.82 : 1 }
      ]}
    >
      <Icon color={color} size={16} strokeWidth={2.4} />
      <Text style={[styles.documentActionText, danger ? styles.documentActionTextDanger : null]}>{title}</Text>
    </Pressable>
  );
}

function FooterActionButton({ title, onPress, primary }: { title: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.footerButton, primary ? styles.footerButtonPrimary : null, { opacity: pressed ? 0.84 : 1 }]}
    >
      <Text style={[styles.footerButtonText, primary ? styles.footerButtonTextPrimary : null]}>{title}</Text>
    </Pressable>
  );
}

function formatCurrencyInput(value: string) {
  const onlyNumbers = value.replace(/\D/g, '');
  if (!onlyNumbers) {
    return '';
  }
  const cents = Number(onlyNumbers) / 100;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents);
}

function parseCurrencyInput(value: string) {
  const onlyNumbers = value.replace(/\D/g, '');
  if (!onlyNumbers) {
    return 0;
  }
  return Number(onlyNumbers) / 100;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 104,
    gap: 12,
    position: 'relative'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    zIndex: 1
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFD1F2',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#163052',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  headerCopy: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 2
  },
  divider: {
    height: 1,
    marginHorizontal: -24,
    backgroundColor: colors.border,
    opacity: 0.72,
    zIndex: 1
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 12,
    shadowColor: '#163052',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2,
    zIndex: 1
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    letterSpacing: 0
  },
  sectionHelp: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600'
  },
  field: {
    gap: 6
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800'
  },
  inputFrame: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#C9D6E8',
    borderRadius: 8,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center'
  },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500'
  },
  inputAction: {
    width: 42,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 6
  },
  switchCard: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: '#C9D6E8',
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  switchTrack: {
    width: 50,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.border,
    padding: 3
  },
  switchTrackActive: {
    backgroundColor: colors.blue
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: colors.surface
  },
  switchThumbActive: {
    marginLeft: 22
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  switchTitle: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900'
  },
  switchText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  documentActions: {
    gap: 8
  },
  documentActionButton: {
    minHeight: 40,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  documentActionButtonDanger: {
    borderColor: colors.red
  },
  documentActionText: {
    color: colors.blue,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    textAlign: 'center'
  },
  documentActionTextDanger: {
    color: colors.red
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    zIndex: 1
  },
  footerButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  footerButtonPrimary: {
    backgroundColor: colors.blue
  },
  footerButtonText: {
    color: colors.blue,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900'
  },
  footerButtonTextPrimary: {
    color: colors.surface
  }
});
