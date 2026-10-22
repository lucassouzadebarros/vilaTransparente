import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, KeyRound, RefreshCw, X } from 'lucide-react-native';
import { Button, Card, Label, Row, Value } from './ui';
import { api, apiErrorMessage } from '../services/api';
import { colors, spacing } from '../theme';
import { Invite, InviteIssued, RegistrationHouseOption } from '../types';
import { Alert } from '../utils/alert';
import { formatDateBR } from '../utils/format';

/**
 * Joining the app is by invitation: the administration makes a code for a house that has nobody yet, and hands it to the
 * person. The code is shown once, here, right after it is made; afterwards only the house and the expiry are listed.
 */
export function InvitesCard({ onChanged }: { onChanged?: () => void }) {
  const [houses, setHouses] = useState<RegistrationHouseOption[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [issued, setIssued] = useState<InviteIssued | null>(null);
  const [busyHouseId, setBusyHouseId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [nextHouses, nextInvites] = await Promise.all([api.registrationHouses(), api.invites()]);
      setHouses(nextHouses);
      setInvites(nextInvites);
    } catch (error) {
      setLoadError(apiErrorMessage(error, 'Não consegui carregar os convites.'));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const freeHouses = houses.filter((house) => house.available);
  const inviteOf = (houseId: number) => invites.find((invite) => invite.houseId === houseId);

  async function issue(house: RegistrationHouseOption) {
    setBusyHouseId(house.houseId);
    setMessage('');
    try {
      const next = await api.createInvite(house.houseId);
      setIssued(next);
      await load();
      onChanged?.();
    } catch (error) {
      setIssued(null);
      setMessage(apiErrorMessage(error, 'Não consegui gerar o convite.'));
    } finally {
      setBusyHouseId(null);
    }
  }

  function confirmIssue(house: RegistrationHouseOption) {
    if (!inviteOf(house.houseId)) {
      issue(house);
      return;
    }
    Alert.alert(
      'Gerar novo código',
      `${house.label} já tem um convite aberto. Um novo código cancela o anterior. Gerar mesmo assim?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Gerar novo código', onPress: () => issue(house) }
      ]
    );
  }

  async function revoke(invite: Invite) {
    setBusyHouseId(invite.houseId);
    setMessage('');
    try {
      await api.revokeInvite(invite.id);
      if (issued?.id === invite.id) {
        setIssued(null);
      }
      await load();
      setMessage(`Convite da ${invite.houseLabel} cancelado.`);
      onChanged?.();
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Não consegui cancelar o convite.'));
    } finally {
      setBusyHouseId(null);
    }
  }

  async function copy(text: string, done: string) {
    try {
      await Clipboard.setStringAsync(text);
      setMessage(done);
    } catch {
      setMessage('Não consegui copiar. Selecione o código e copie manualmente.');
    }
  }

  return (
    <Card>
      <Row>
        <Value>Convites de acesso</Value>
        <KeyRound color={colors.blue} size={22} />
      </Row>
      <Label>
        Ninguém cria acesso sem um código da casa. Gere o código, envie para a pessoa (por exemplo, no WhatsApp) e ela
        cria o próprio acesso. Cada código vale uma única vez e por alguns dias.
      </Label>

      {issued ? (
        <View style={styles.issued} accessibilityLiveRegion="polite">
          <Text style={styles.issuedTitle}>{`Código da ${issued.houseLabel}`}</Text>
          <Text
            selectable
            accessibilityLabel={`Código ${issued.code.replace('-', ', ').split('').join(' ')}`}
            style={styles.issuedCode}
          >
            {issued.code}
          </Text>
          <Label>{`Vale até ${formatDateBR(issued.expiresAt)}, uma única vez. Ele aparece só agora: copie e envie à pessoa.`}</Label>
          <Row style={{ flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            <Button title="Copiar mensagem pronta" icon={Copy} onPress={() => copy(inviteMessage(issued), 'Mensagem copiada. Cole na conversa com a pessoa.')} />
            <Button title="Copiar só o código" icon={Copy} variant="ghost" onPress={() => copy(issued.code, 'Código copiado.')} />
          </Row>
        </View>
      ) : null}

      {message ? <Label>{message}</Label> : null}
      {loadError ? (
        <>
          <Label>{loadError}</Label>
          <Button title="Tentar novamente" icon={RefreshCw} variant="ghost" onPress={load} />
        </>
      ) : null}

      {!loadError && houses.length > 0 && freeHouses.length === 0 ? (
        <Label>Todas as casas já têm morador cadastrado.</Label>
      ) : null}

      {freeHouses.map((house) => {
        const invite = inviteOf(house.houseId);
        const busy = busyHouseId === house.houseId;
        return (
          <View key={house.houseId} style={styles.houseRow}>
            <View style={styles.houseCopy}>
              <Text style={styles.houseTitle}>{house.label}</Text>
              <Text style={styles.houseNote}>
                {invite ? `Convite aberto até ${formatDateBR(invite.expiresAt)}` : 'Sem morador e sem convite'}
              </Text>
            </View>
            <View style={styles.houseActions}>
              <Button
                title={busy ? 'Aguarde...' : invite ? 'Gerar novo código' : 'Gerar convite'}
                icon={KeyRound}
                variant="ghost"
                onPress={() => confirmIssue(house)}
                disabled={busy}
              />
              {invite ? <Button title="Cancelar convite" icon={X} variant="ghost" onPress={() => revoke(invite)} disabled={busy} /> : null}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** What the administration pastes to the person. The link only exists on the web build; the store build has none yet. */
function inviteMessage(invite: InviteIssued) {
  const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location?.origin : '';
  const where = origin ? ` Abra ${origin} e toque em "Tenho um código".` : ' Abra o app e toque em "Tenho um código".';
  return `Olá! Seu código para criar o acesso da ${invite.houseLabel} no Portal da Vila é ${invite.code}. Ele vale até ${formatDateBR(invite.expiresAt)} e só pode ser usado uma vez.${where}`;
}

const styles = StyleSheet.create({
  issued: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.greenBorder,
    backgroundColor: colors.greenSoft,
    padding: spacing.md,
    gap: spacing.sm
  },
  issuedTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '700'
  },
  issuedCode: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: 3
  },
  houseRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm
  },
  houseCopy: {
    flexGrow: 1,
    minWidth: 160,
    gap: 2
  },
  houseTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700'
  },
  houseNote: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  houseActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    maxWidth: '100%',
    gap: spacing.sm
  }
});
