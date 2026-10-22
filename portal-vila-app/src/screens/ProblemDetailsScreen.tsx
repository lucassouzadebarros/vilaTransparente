import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { ArrowLeft, Camera, ChevronRight, ImagePlus, Pencil, Plus, RefreshCw, Send, Wrench, X, XCircle } from 'lucide-react-native';
import { Badge, Button, Card, Label, Row, Screen, Value, SectionTitle, BackLink } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Budget, PortalDocument, ProblemReport, ProblemReportEvent, ServiceOrder } from '../types';
import { Alert } from '../utils/alert';
import { pickImage, pickerErrorMessage } from '../utils/filePicker';
import { formatDateBR, formatDateTimeBR, formatMoneyBR } from '../utils/format';

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

const budgetStatusLabels: Record<Budget['status'], string> = {
  EM_ANALISE: 'em votação',
  APROVADO: 'aprovado',
  REJEITADO: 'recusado',
  CANCELADO: 'cancelado'
};

type Photo = { document: PortalDocument; url: string };

/** One report in full: description, photos, the budgets generated for it and the services that came out of them. */
export function ProblemDetailsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { session, isAdmin, canManageBudgets } = useAuth();
  const id = Number(route.params?.id);
  const [report, setReport] = useState<ProblemReport | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [services, setServices] = useState<ServiceOrder[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [events, setEvents] = useState<ProblemReportEvent[]>([]);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [reports, allBudgets, allServices, documents, history] = await Promise.all([
        api.problemReports(),
        api.budgets().catch(() => [] as Budget[]),
        api.services().catch(() => [] as ServiceOrder[]),
        api.documents('PROBLEM_REPORT', id).catch(() => [] as PortalDocument[]),
        api.problemReportEvents(id).catch(() => [] as ProblemReportEvent[])
      ]);
      setEvents(history);
      const found = reports.find((item) => item.id === id) ?? null;
      setReport(found);
      const problemServices = allServices.filter((item) => item.problemReportId === id && item.status !== 'CANCELADO');
      // Quotes registered straight on one of the problem's services (the older way) belong to it too.
      const serviceIds = new Set(problemServices.map((item) => item.id));
      setBudgets(
        allBudgets.filter(
          (item) => item.status !== 'CANCELADO' && (item.problemReportId === id || (!item.problemReportId && item.serviceId != null && serviceIds.has(item.serviceId)))
        )
      );
      setServices(problemServices);
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
  const canComment = (isOwner || canManageBudgets) && report?.status !== 'CANCELADO';

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

  async function sendComment() {
    const message = comment.trim();
    if (!message || posting) {
      return;
    }
    setPosting(true);
    try {
      await api.addProblemComment(id, message);
      setComment('');
      await load();
    } catch (err) {
      Alert.alert('Comentário', apiErrorMessage(err, 'Não consegui enviar o comentário.'));
    } finally {
      setPosting(false);
    }
  }

  function confirmCancel() {
    Alert.alert('Cancelar relato', 'O relato sai da lista de abertos. Deseja cancelar?', [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Cancelar relato',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelProblemReport(id);
            await load();
          } catch (err) {
            Alert.alert('Cancelar relato', apiErrorMessage(err, 'Não consegui cancelar o relato.'));
          }
        }
      }
    ]);
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
      <BackLink label="Voltar para os problemas" onPress={() => navigation.navigate('ProblemReports', { refreshKey: Date.now() })} />
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
              <SectionTitle>Fotos</SectionTitle>
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

          {budgets.length ? (
            <Card>
              <SectionTitle>Orçamentos deste problema</SectionTitle>
              {budgets.length > 1 ? <Label>Os que concorrem entre si disputam o mesmo trabalho: cada casa aprova só um.</Label> : null}
              {budgets.map((budget) => (
                <Pressable
                  key={budget.id}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('BudgetDetails', { id: budget.id, refreshKey: Date.now() })}
                  style={styles.serviceLink}
                >
                  <View style={styles.serviceCopy}>
                    <Text style={styles.serviceTitle}>{budget.title}</Text>
                    <Text style={styles.serviceStatus}>
                      {budget.supplier} · {formatMoneyBR(budget.amount)} · {budgetStatusLabels[budget.status] ?? budget.status}
                      {budgets.length > 1 ? (budget.competes === false ? ' · outro trabalho' : ' · concorre') : ''}
                    </Text>
                  </View>
                  <ChevronRight color={colors.blue} size={18} />
                </Pressable>
              ))}
            </Card>
          ) : null}

          {services.length ? (
            <Card>
              <SectionTitle>Serviços deste problema</SectionTitle>
              {services.map((service) => (
                <Pressable
                  key={service.id}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('ServiceDetails', { id: service.id, refreshKey: Date.now() })}
                  style={styles.serviceLink}
                >
                  <Wrench color={colors.blue} size={20} />
                  <View style={styles.serviceCopy}>
                    <Text style={styles.serviceTitle}>{service.title}</Text>
                    <Text style={styles.serviceStatus}>Serviço {serviceStatusLabels[service.status] ?? service.status}</Text>
                  </View>
                  <ChevronRight color={colors.blue} size={18} />
                </Pressable>
              ))}
            </Card>
          ) : null}

          <Card>
            <SectionTitle>Histórico e comentários</SectionTitle>
            {events.length === 0 ? <Label>Ainda sem registros.</Label> : null}
            <View style={styles.history}>
              {events.map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <View style={[styles.eventDot, event.kind === 'COMMENT' ? styles.eventDotComment : null]} />
                  <View style={styles.eventCopy}>
                    <Text style={styles.eventMeta}>
                      {event.author ?? 'Sistema'} · {formatDateTimeBR(event.createdAt)}
                    </Text>
                    <Text style={[styles.eventText, event.kind === 'COMMENT' ? styles.eventComment : null]}>{event.message}</Text>
                  </View>
                </View>
              ))}
            </View>
            {canComment ? (
              <View style={styles.commentBox}>
                <TextInput
                  value={comment}
                  onChangeText={(value) => setComment(value.slice(0, 500))}
                  placeholder={isOwner ? 'Escreva uma informação nova para a administração...' : 'Escreva um comentário para quem relatou...'}
                  placeholderTextColor={colors.muted}
                  multiline
                  style={styles.commentInput}
                  accessibilityLabel="Comentário"
                />
                <Button title={posting ? 'Enviando...' : 'Enviar comentário'} icon={Send} disabled={posting || !comment.trim()} onPress={sendComment} />
              </View>
            ) : null}
            {isOwner && report.status === 'ABERTO' ? (
              <Button title="Cancelar meu relato" icon={XCircle} variant="danger" onPress={confirmCancel} />
            ) : null}
          </Card>

          {canManageBudgets || isAdmin ? (
            <Card>
              <SectionTitle>Ações administrativas</SectionTitle>
              <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
                {canManageBudgets && open ? (
                  <Button
                    title={budgets.length ? 'Gerar outro orçamento' : 'Gerar orçamento'}
                    icon={Plus}
                    onPress={() => navigation.navigate('BudgetForm', { formMode: 'create', budgetId: null, serviceId: null, problemReportId: report.id, formKey: Date.now() })}
                  />
                ) : null}
                {canManageBudgets && open && !budgets.length && !services.length ? (
                  <Button
                    title="Resolver direto (serviço pequeno)"
                    icon={Wrench}
                    variant="ghost"
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
    fontWeight: '700'
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
    backgroundColor: colors.pressed
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
  history: {
    gap: 0
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingBottom: spacing.md
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 5,
    backgroundColor: colors.border
  },
  eventDotComment: {
    backgroundColor: colors.blue
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2
  },
  eventMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '600'
  },
  eventText: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  eventComment: {
    fontWeight: '700'
  },
  commentBox: {
    gap: spacing.sm
  },
  commentInput: {
    minHeight: 76,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    textAlignVertical: 'top'
  },
  serviceLink: {
    minHeight: 60,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
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
    fontWeight: '700'
  },
  serviceStatus: {
    color: colors.blue,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  }
});
