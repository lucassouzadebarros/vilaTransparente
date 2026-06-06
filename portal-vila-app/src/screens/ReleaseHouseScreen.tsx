import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, LockOpen, RefreshCw, UserMinus } from 'lucide-react-native';
import { Badge, Button, Card, Label, Row, Screen, Stack, Value } from '../components/ui';
import { api, apiErrorMessage } from '../services/api';
import { Resident } from '../types';
import { colors, spacing } from '../theme';

type HouseState = {
  houseId: number;
  active?: Resident;
  inactiveCount: number;
};

export function ReleaseHouseScreen() {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasingHouseId, setReleasingHouseId] = useState<number | null>(null);
  const [pendingRelease, setPendingRelease] = useState<HouseState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const houses = useMemo<HouseState[]>(() => {
    return Array.from({ length: 10 }, (_, index) => index + 2).map((houseId) => {
      const houseResidents = residents.filter((resident) => resident.houseId === houseId);
      return {
        houseId,
        active: houseResidents.find((resident) => resident.status === 'ACTIVE'),
        inactiveCount: houseResidents.filter((resident) => resident.status !== 'ACTIVE').length
      };
    });
  }, [residents]);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      setResidents(await api.residents());
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Não consegui carregar as casas.'));
    } finally {
      setLoading(false);
    }
  }

  function confirmRelease(house: HouseState) {
    if (!house.active) {
      return;
    }
    setPendingRelease(house);
    setMessage(null);
  }

  async function releaseHouse(houseId: number) {
    setReleasingHouseId(houseId);
    setMessage(null);
    try {
      await api.releaseHouse(houseId);
      setPendingRelease(null);
      await load();
      setMessage(`Casa ${String(houseId).padStart(2, '0')} liberada para novo cadastro.`);
    } catch (error) {
      setMessage(apiErrorMessage(error, 'Não consegui liberar a casa.'));
    } finally {
      setReleasingHouseId(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <Screen title="Liberar casa" subtitle="Disponibilidade para cadastro" right={<Button title="" icon={RefreshCw} variant="ghost" onPress={load} />}>
      <Card>
        <Row>
          <Value>Regra da liberação</Value>
          <LockOpen color={colors.blue} size={22} />
        </Row>
        <Label>Use quando uma casa mudou de responsável. O morador atual fica inativo, o login dele é bloqueado e a casa volta para a tela de cadastro.</Label>
      </Card>

      {message ? (
        <Card style={message.includes('Não consegui') ? styles.errorCard : styles.successCard}>
          <Text style={message.includes('Não consegui') ? styles.errorText : styles.successText}>{message}</Text>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <Value>Carregando casas...</Value>
          <Label>Buscando moradores ativos e histórico salvo.</Label>
        </Card>
      ) : null}

      {!loading ? (
        <Stack>
          {houses.map((house) => {
            const released = !house.active;
            return (
              <Card key={house.houseId}>
                <Row>
                  <View style={styles.houseTitle}>
                    <Value>Casa {String(house.houseId).padStart(2, '0')}</Value>
                    {house.inactiveCount > 0 ? <Label>{house.inactiveCount} morador(es) antigo(s) no histórico</Label> : null}
                  </View>
                  <Badge status={released ? 'LIBERADA' : 'ACTIVE'} />
                </Row>

                {house.active ? (
                  <Stack gap={spacing.sm}>
                    <Label>Morador ativo</Label>
                    <Value>{house.active.name}</Value>
                    <Label>{house.active.email}</Label>
                    <Button
                      title={releasingHouseId === house.houseId ? 'Liberando...' : 'Liberar casa'}
                      icon={UserMinus}
                      variant="danger"
                      disabled={releasingHouseId === house.houseId}
                      onPress={() => confirmRelease(house)}
                    />
                    {pendingRelease?.houseId === house.houseId ? (
                      <View style={styles.confirmBox}>
                        <Text style={styles.confirmTitle}>Confirmar liberação da Casa {String(house.houseId).padStart(2, '0')}</Text>
                        <Text style={styles.confirmText}>
                          {house.active.name} ficará inativo, não conseguirá mais entrar no portal e a casa ficará disponível para novo cadastro. O histórico financeiro será mantido.
                        </Text>
                        <Row>
                          <Button
                            title="Cancelar"
                            variant="ghost"
                            onPress={() => setPendingRelease(null)}
                            disabled={releasingHouseId === house.houseId}
                          />
                          <Button
                            title={releasingHouseId === house.houseId ? 'Liberando...' : 'Confirmar'}
                            icon={UserMinus}
                            variant="danger"
                            onPress={() => releaseHouse(house.houseId)}
                            disabled={releasingHouseId === house.houseId}
                          />
                        </Row>
                      </View>
                    ) : null}
                  </Stack>
                ) : (
                  <View style={styles.releasedBox}>
                    <CheckCircle2 color={colors.green} size={22} />
                    <View style={styles.releasedCopy}>
                      <Text style={styles.releasedTitle}>Disponível para cadastro</Text>
                      <Text style={styles.releasedText}>A próxima pessoa pode se cadastrar escolhendo esta casa.</Text>
                    </View>
                  </View>
                )}
              </Card>
            );
          })}
        </Stack>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  houseTitle: {
    flex: 1,
    gap: spacing.xs
  },
  releasedBox: {
    minHeight: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  releasedCopy: {
    flex: 1,
    gap: spacing.xs
  },
  releasedTitle: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900'
  },
  releasedText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700'
  },
  confirmBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.red,
    backgroundColor: colors.redSoft,
    padding: spacing.sm,
    gap: spacing.sm
  },
  confirmTitle: {
    color: colors.red,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900'
  },
  confirmText: {
    color: colors.ink,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700'
  },
  successCard: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft
  },
  successText: {
    color: colors.green,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900'
  },
  errorCard: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900'
  }
});
