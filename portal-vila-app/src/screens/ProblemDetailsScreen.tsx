import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, Camera, ChevronRight, ImagePlus, Pencil, RefreshCw, Wrench, X } from 'lucide-react-native';
import { Badge, Button, Card, Label, Row, Screen, Value } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { PortalDocument, ProblemReport, ServiceOrder } from '../types';
import { Alert } from '../utils/alert';
import { pickImage, pickerErrorMessage } from '../utils/filePicker';
import { formatDateBR } from '../utils/format';

const MAX_PHOTOS = 3;

const priorityLabels: Record<ProblemReport['priority'], string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente'
};

const serviceStatusLabels: Record<ServiceOrder['status'], string> = {
  PLANEJADO: 'planejado',
  APROVADO: 'orçamento aprovado',
  EM_ANDAMENTO: 'em andamento',
  FINALIZADO: 'finalizado',
  CANCELADO: 'cancelado'
};

type Photo = { document: PortalDocument; url: string };

/** One report in full: description, photos, and the service that came out of it. */
export function ProblemDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { session, isAdmin, canManageBudgets } = useAuth();
  const id = Number(route.params?.id);
  const [report, setReport] = useState<ProblemReport | null>(null);
  const [service, setService] = useState<ServiceOrder | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [reports, services, documents] = await Promise.all([
        api.problemReports(),
        api.services().catch(() => [] as ServiceOrder[]),
        api.documents('PROBLEM_REPORT', id).catch(() => [] as PortalDocument[])
      ]);
      const found = reports.find((item) => item.id === id) ?? null;
      setReport(found);
      setService(found?.serviceId ? services.find((item) => item.id === found.serviceId) ?? null : null);
      // Photos are private: each one is shown from a short-lived link.
      const withLinks = await Promise.all(
        documents.map(async (document) => ({ document, url: await api.documentAccessUrl(document.id as number).catch(() => '') }))
      );
      setPhotos(withLinks.filter((photo) => photo.url));
    } catch (err) {
      setError(apiErrorMessage(err, 'Não consegui carregar este relato.'));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, route.params?.refreshKey])
  );

  const isOwner = Boolean(session?.residentId && report?.residentId === session.residentId);
  const canChangePhotos = isOwner || isAdmin;
  const open = report?.status === 'ABERTO' || report?.status === 'EM_ANALISE';

  async function addPhoto(source: 'camera' | 'library') {
    if (!report?.id) {
      return;
    }
    setSending(true);
    try {
      const picked = await pickImage(source);
      if (picked) {
        await api.uploadProblemPhoto(report.id, picked);
        await load();
      }
    } catch (err) {
      Alert.alert('Foto', err instanceof Error && err.message.startsWith('Sem permissão') ? pickerErrorMessage(err) : apiErrorMessage(err, 'Não consegui enviar a foto.'));
    } finally {
      setSending(false);
    }
  }

  function removePhoto(photo: Photo) {
    Alert.alert('Remover foto', 'A foto sai do relato. Deseja remover?', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteProblemPhoto(id, photo.document.id as number);
            await load();
          } catch (err) {
            Alert.alert('Foto', apiErrorMessage(err, 'Não consegui remover a foto.'));
          }
        }
      }
    ]);
  }

  return (
    <Screen
      title="Problema relatado"
      subtitle="Detalhes e acompanhamento"
      right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}
    >
      <Button title="Voltar para os problemas" icon={ArrowLeft} variant="ghost" onPress={() => navigation.navigate('ProblemReports', { refreshKey: Date.now() })} />
      {error ? (
        <Card>
          <Value>Erro</Value>
          <Label>{error}</Label>
        </Card>
      ) : null}
      {!report && !error ? <Label>Carregando...</Label> : null}
      {report ? (
        <>
          <Card>
            <Row>
              <Value>{report.title}</Value>
              <Badge status={report.status} />
            </Row>
            <Label>{report.description}</Label>
            <View style={styles.metaList}>
              <MetaLine label="Local" value={report.location} />
              <MetaLine label="Tipo" value={report.category || 'Outro'} />
              <MetaLine label="Prioridade" value={priorityLabels[report.priority] ?? report.priority} />
              <MetaLine label="Registrado em" value={report.createdAt ? formatDateBR(report.createdAt) : 'Sem data'} />
            </View>
          </Card>

          {photos.length > 0 || canChangePhotos ? (
            <Card>
              <Value>Fotos</Value>
              {photos.length === 0 ? <Label>Nenhuma foto neste relato.</Label> : null}
              {photos.length > 0 ? (
                <View style={styles.photoGrid}>
                  {photos.map((photo) => (
                    <View key={photo.document.id} style={styles.photoSlot}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Abrir foto"
                        onPress={() => api.openDocument(photo.document.url).catch(() => Alert.alert('Foto', 'Não consegui abrir a foto.'))}
                        style={styles.photoPress}
                      >
                        <Image source={{ uri: photo.url }} style={styles.photoImage} resizeMode="cover" />
                      </Pressable>
                      {canChangePhotos ? (
                        <Pressable accessibilityRole="button" accessibilityLabel="Remover foto" onPress={() => removePhoto(photo)} style={styles.removeButton}>
                          <X color={colors.muted} size={16} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
              {canChangePhotos && photos.length < MAX_PHOTOS ? (
                <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                  <Button title={sending ? 'Enviando...' : 'Tirar foto'} icon={Camera} variant="ghost" disabled={sending} onPress={() => addPhoto('camera')} />
                  <Button title="Da galeria" icon={ImagePlus} variant="ghost" disabled={sending} onPress={() => addPhoto('library')} />
                </Row>
              ) : null}
            </Card>
          ) : null}

          {report.serviceId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('ServiceDetails', { id: report.serviceId, refreshKey: Date.now() })}
              style={styles.serviceLink}
            >
              <Wrench color={colors.blue} size={20} />
              <View style={styles.serviceCopy}>
                <Text style={styles.serviceTitle}>{service ? service.title : `Serviço #${report.serviceId}`}</Text>
                <Text style={styles.serviceStatus}>{service ? `Serviço ${serviceStatusLabels[service.status] ?? service.status}` : 'Ver o serviço'}</Text>
              </View>
              <ChevronRight color={colors.blue} size={18} />
            </Pressable>
          ) : null}

          {canManageBudgets || isAdmin ? (
            <Card>
              <Value>Ações administrativas</Value>
              <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                {canManageBudgets && open && !report.serviceId ? (
                  <Button
                    title="Criar serviço a partir deste relato"
                    icon={Wrench}
                    onPress={() => navigation.navigate('ServiceForm', { formMode: 'create', serviceId: null, budgetId: null, problemReportId: report.id, formKey: Date.now() })}
                  />
                ) : null}
                {isAdmin ? (
                  <Button title="Editar relato" icon={Pencil} variant="ghost" onPress={() => navigation.navigate('ReportProblem', { report, formKey: Date.now() })} />
                ) : null}
              </Row>
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaLine}>
      <Label>{label}</Label>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metaList: {
    gap: spacing.xs
  },
  metaLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm
  },
  metaValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800'
  },
  photoGrid: {
    flexDirection: 'row',
    gap: spacing.sm
  },
  photoSlot: {
    flex: 1,
    minWidth: 0,
    maxWidth: '33%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: '#EEF4FA'
  },
  photoPress: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden'
  },
  photoImage: {
    width: '100%',
    height: '100%'
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center'
  },
  serviceLink: {
    minHeight: 60,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C9DAF2',
    backgroundColor: colors.blueSoft,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    zIndex: 1
  },
  serviceCopy: {
    flex: 1,
    minWidth: 0
  },
  serviceTitle: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900'
  },
  serviceStatus: {
    color: colors.blue,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  }
});
