import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Edit3, KeyRound, Plus, RefreshCw, Save, X } from 'lucide-react-native';
import { Badge, Button, Card, Field, Label, Row, Screen, Stack, Value } from '../components/ui';
import { api, apiErrorMessage } from '../services/api';
import { Resident } from '../types';
import { colors, spacing } from '../theme';

export function ResidentsScreen() {
  const [items, setItems] = useState<Resident[]>([]);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Resident | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [resettingPasswordId, setResettingPasswordId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ residentId: number; text: string; type: 'success' | 'error' } | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      setItems(await api.residents());
    } catch (error) {
      setLoadError(apiErrorMessage(error, 'Não consegui carregar os moradores.'));
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: Resident) {
    setCreating(false);
    setEditingId(item.id ?? null);
    setDraft({ ...item, documentNumber: '' });
    setMessage(null);
  }

  function startCreate() {
    const usedHouses = new Set(items.filter((item) => item.status === 'ACTIVE').map((item) => item.houseId));
    const nextHouse = Array.from({ length: 11 }, (_, index) => index + 1).find((house) => !usedHouses.has(house)) ?? 0;
    setCreating(true);
    setEditingId(null);
    setDraft({ houseId: nextHouse, name: '', email: '', phone: '', documentNumber: '', status: 'ACTIVE' });
    setMessage(null);
  }

  function changeDraft(field: keyof Resident, value: string | number) {
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  async function save() {
    if (!draft?.id) {
      if (!draft || !draft.houseId || !draft.name.trim() || !draft.email.trim()) {
        setMessage({ residentId: 0, type: 'error', text: 'Informe casa, nome e e-mail para cadastrar o morador.' });
        return;
      }
      if (items.some((item) => item.houseId === draft.houseId && item.status === 'ACTIVE')) {
        setMessage({ residentId: 0, type: 'error', text: `Casa ${String(draft.houseId).padStart(2, '0')} ja possui morador cadastrado.` });
        return;
      }
    }
    const documentDigits = (draft.documentNumber ?? '').replace(/\D/g, '');
    if (documentDigits && documentDigits.length !== 11 && documentDigits.length !== 14) {
      setMessage({ residentId: draft.id ?? 0, type: 'error', text: 'Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.' });
      return;
    }
    if (!draft.id && !documentDigits) {
      setMessage({ residentId: 0, type: 'error', text: 'Informe CPF/CNPJ completo para criar o cliente no Asaas.' });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...draft, documentNumber: documentDigits };
      const saved = draft.id
        ? await api.updateResident(draft.id, payload)
        : await api.createResident(payload);
      setItems((current) => {
        const next = draft.id ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved];
        return next.sort((a, b) => a.houseId - b.houseId);
      });
      setCreating(false);
      setEditingId(null);
      setDraft(null);
      setMessage({ residentId: saved.id ?? draft.id ?? 0, type: 'success', text: 'Dados salvos e cliente sincronizado.' });
      Alert.alert('Moradores', 'Dados salvos e cliente sincronizado.');
    } catch (error) {
      const text = apiErrorMessage(error, 'Não consegui salvar o morador.');
      setMessage({ residentId: draft.id ?? 0, type: 'error', text });
      Alert.alert('Moradores', text);
    } finally {
      setSaving(false);
    }
  }

  async function syncAsaas(item: Resident) {
    if (!item.id) {
      return;
    }
    setSyncingId(item.id);
    setMessage(null);
    try {
      const saved = await api.syncResidentAsaas(item.id);
      setItems((current) => current.map((resident) => resident.id === saved.id ? saved : resident));
      setMessage({ residentId: saved.id ?? item.id, type: 'success', text: 'Cliente sincronizado.' });
      Alert.alert('Moradores', 'Cliente sincronizado.');
    } catch (error) {
      const text = apiErrorMessage(error, 'Não consegui sincronizar com o Asaas.');
      setMessage({ residentId: item.id, type: 'error', text });
      Alert.alert('Asaas', text);
    } finally {
      setSyncingId(null);
    }
  }

  function confirmPasswordReset(item: Resident) {
    Alert.alert(
      'Redefinir senha',
      `Enviar uma senha temporária para ${item.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: () => sendPasswordReset(item) }
      ]
    );
  }

  async function sendPasswordReset(item: Resident) {
    if (!item.id) {
      return;
    }
    setResettingPasswordId(item.id);
    setMessage(null);
    try {
      const response = await api.requestResidentPasswordReset(item.id);
      const text = response.debugCode
        ? `${response.message} Senha temporária de teste: ${response.debugCode}`
        : response.message;
      setMessage({ residentId: item.id, type: 'success', text });
      Alert.alert('Redefinição de senha', text);
    } catch (error) {
      const text = apiErrorMessage(error, 'Não consegui gerar a redefinição de senha.');
      setMessage({ residentId: item.id, type: 'error', text });
      Alert.alert('Redefinição de senha', text);
    } finally {
      setResettingPasswordId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Moradores" subtitle="11 casas da vila" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      <Button title="Novo morador" icon={Plus} onPress={startCreate} />
      {creating && draft ? (
        <Card>
          <Value>Cadastrar morador</Value>
          <Field
            label="Casa"
            value={draft.houseId ? String(draft.houseId) : ''}
            onChangeText={(value) => changeDraft('houseId', Number(value.replace(/\D/g, '')) || 0)}
            keyboardType="numeric"
          />
          <Field label="Nome" value={draft.name} onChangeText={(value) => changeDraft('name', value)} />
          <Field label="E-mail" value={draft.email} onChangeText={(value) => changeDraft('email', value)} keyboardType="email-address" />
          <Field label="Telefone" value={draft.phone ?? ''} onChangeText={(value) => changeDraft('phone', value)} />
          <Field
            label="CPF/CNPJ completo"
            value={draft.documentNumber ?? ''}
            onChangeText={(value) => changeDraft('documentNumber', value)}
            keyboardType="numeric"
          />
          <Row>
            <Button title="Cancelar" icon={X} variant="ghost" onPress={() => { setCreating(false); setDraft(null); }} disabled={saving} />
            <Button title={saving ? 'Salvando...' : 'Salvar'} icon={Save} onPress={save} disabled={saving} />
          </Row>
          {message && message.residentId === 0 ? <Label>{message.text}</Label> : null}
        </Card>
      ) : null}
      {loading ? (
        <Card>
          <Value>Carregando moradores...</Value>
          <Label>Buscando dados reais na API.</Label>
        </Card>
      ) : null}
      {!loading && loadError ? (
        <Card>
          <Value>Não consegui carregar moradores</Value>
          <Label>{loadError}</Label>
          <Button title="Tentar novamente" icon={RefreshCw} variant="ghost" onPress={load} />
        </Card>
      ) : null}
      {!loading && !loadError && items.length === 0 ? (
        <Card>
          <Value>Nenhum morador cadastrado</Value>
          <Label>Cadastre os moradores reais para gerar clientes e cobranças no Asaas.</Label>
        </Card>
      ) : null}
      {items.map((item) => (
        <Card key={item.id}>
          <Row>
            <Value>{item.name}</Value>
            <Badge status={item.status} />
          </Row>
          <Label>Casa {String(item.houseId).padStart(2, '0')}</Label>
          {editingId === item.id && draft ? (
            <Stack>
              <Field label="Nome" value={draft.name} onChangeText={(value) => changeDraft('name', value)} />
              <Field label="E-mail" value={draft.email} onChangeText={(value) => changeDraft('email', value)} keyboardType="email-address" />
              <Field label="Telefone" value={draft.phone ?? ''} onChangeText={(value) => changeDraft('phone', value)} />
              <Field
                label="CPF/CNPJ completo"
                value={draft.documentNumber ?? ''}
                onChangeText={(value) => changeDraft('documentNumber', value)}
                keyboardType="numeric"
              />
              <StatusToggle
                active={draft.status === 'ACTIVE'}
                onChange={(active) => changeDraft('status', active ? 'ACTIVE' : 'INACTIVE')}
              />
              <Row>
                <Button title="Cancelar" icon={X} variant="ghost" onPress={() => { setEditingId(null); setDraft(null); }} disabled={saving} />
                <Button title={saving ? 'Salvando...' : 'Salvar'} icon={Save} onPress={save} disabled={saving} />
              </Row>
              {message && message.residentId === item.id ? <Label>{message.text}</Label> : null}
            </Stack>
          ) : (
            <Stack>
              <Label>{item.email}</Label>
              <Label>{item.phone}</Label>
              <Label>
                {item.documentRegistered
                  ? `CPF/CNPJ cadastrado (${item.documentMasked ?? 'documento protegido'})`
                  : 'CPF/CNPJ pendente'}
              </Label>
              <Label>
                {item.gatewayCustomerId
                  ? `Cliente sincronizado (${item.gatewayCustomerId})`
                  : 'Cliente ainda não sincronizado'}
              </Label>
              {message && message.residentId === item.id ? <Label>{message.text}</Label> : null}
              <Button
                title="Editar dados"
                icon={Edit3}
                variant="ghost"
                onPress={() => startEdit(item)}
              />
              <Button
                title={resettingPasswordId === item.id ? 'Enviando...' : 'Enviar senha temporária'}
                icon={KeyRound}
                variant="ghost"
                onPress={() => confirmPasswordReset(item)}
                disabled={resettingPasswordId === item.id || item.status !== 'ACTIVE'}
              />
              <Button
                title={syncingId === item.id ? 'Sincronizando...' : 'Sincronizar cadastro'}
                icon={RefreshCw}
                variant="ghost"
                onPress={() => syncAsaas(item)}
                disabled={syncingId === item.id || saving || !item.documentRegistered}
              />
            </Stack>
          )}
        </Card>
      ))}
    </Screen>
  );
}

function StatusToggle({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return (
    <View style={styles.toggleCard}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>Status do morador</Text>
        <Text style={styles.toggleDescription}>
          {active
                  ? 'Ativo: pode acessar o portal e receber novas cobranças.'
                  : 'Inativo: não acessa o portal e não recebe novas cobranças.'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: active }}
        accessibilityLabel="Status do morador"
        onPress={() => onChange(!active)}
        style={[styles.switchTrack, active ? styles.switchTrackActive : styles.switchTrackInactive]}
      >
        <View style={[styles.switchThumb, active ? styles.switchThumbActive : styles.switchThumbInactive]} />
        <Text style={[styles.switchText, active ? styles.switchTextActive : styles.switchTextInactive]}>
          {active ? 'ON' : 'OFF'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleCard: {
    minHeight: 76,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  toggleCopy: {
    flex: 1,
    gap: spacing.xs
  },
  toggleTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900'
  },
  toggleDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  switchTrack: {
    width: 74,
    height: 36,
    borderRadius: 999,
    padding: 3,
    justifyContent: 'center'
  },
  switchTrackActive: {
    backgroundColor: colors.green
  },
  switchTrackInactive: {
    backgroundColor: colors.muted
  },
  switchThumb: {
    position: 'absolute',
    top: 4,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: colors.surface
  },
  switchThumbActive: {
    right: 4
  },
  switchThumbInactive: {
    left: 4
  },
  switchText: {
    fontSize: 11,
    fontWeight: '900'
  },
  switchTextActive: {
    color: colors.surface,
    marginLeft: spacing.sm
  },
  switchTextInactive: {
    color: colors.surface,
    alignSelf: 'flex-end',
    marginRight: spacing.sm
  }
});
