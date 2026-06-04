import { useState } from 'react';
import { Alert, Linking } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CheckCircle2, ExternalLink, FileText, Upload } from 'lucide-react-native';
import { Button, Card, Field, Label, Screen, Value } from '../components/ui';
import { api } from '../services/api';

export function FinishServiceScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const id = Number(route.params?.id ?? 1);
  const [finalValue, setFinalValue] = useState('');
  const [completedDate, setCompletedDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');
  const [notes, setNotes] = useState('');
  const [generateExpense, setGenerateExpense] = useState('true');
  const [documentName, setDocumentName] = useState('Nota Fiscal');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  async function finish() {
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
      finalValue: Number(finalValue.replace(',', '.')),
      completedDate,
      supplier,
      supplierDocument,
      documentId,
      generateExpense: generateExpense.toLowerCase() !== 'false',
      notes
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

  return (
    <Screen title="Finalizar serviço" subtitle="Pagamento, nota fiscal e despesa">
      <Card>
        <Value>Dados do pagamento</Value>
        <Field label="Valor final pago" value={finalValue} onChangeText={setFinalValue} keyboardType="numeric" />
        <Field label="Data de conclusão" value={completedDate} onChangeText={setCompletedDate} />
        <Field label="Fornecedor executado" value={supplier} onChangeText={setSupplier} />
        <Field label="CNPJ do fornecedor" value={supplierDocument} onChangeText={setSupplierDocument} placeholder="12.345.678/0001-90" />
        <Field label="Gerar despesa automaticamente" value={generateExpense} onChangeText={setGenerateExpense} />
      </Card>

      <Card>
        <Value>Documento fiscal</Value>
        <Label>Anexe um PDF por link. Esse documento aparece no detalhe do serviço para prestação de contas.</Label>
        <Field label="Nome do documento" value={documentName} onChangeText={setDocumentName} />
        <Field label="Link do PDF da nota fiscal/recibo" value={documentUrl} onChangeText={setDocumentUrl} placeholder="https://.../nota-fiscal.pdf" />
        <Button title="Selecionar PDF" icon={Upload} variant="ghost" onPress={selectPdf} />
        {documentFile ? <Label>Arquivo selecionado: {documentFile.name}</Label> : null}
        <Button title="Visualizar PDF" icon={ExternalLink} variant="ghost" onPress={previewDocument} />
      </Card>

      <Card>
        <Value>Observações finais</Value>
        <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
        <Button title="Finalizar serviço" icon={CheckCircle2} onPress={finish} disabled={!finalValue || !supplier} />
        <Button title="Sem nota agora" icon={FileText} variant="ghost" onPress={() => { setDocumentUrl(''); setDocumentFile(null); }} />
      </Card>
    </Screen>
  );
}
