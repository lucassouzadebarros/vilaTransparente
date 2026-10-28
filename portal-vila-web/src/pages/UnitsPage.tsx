import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Home, KeyRound, Mail, Search, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CopyButton } from '@/components/ManagerCodeDialog';
import { Badge, Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader, Segmented } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, RESIDENTS_APP_URL, type IssuedInvite } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { cn, formatDate, formatNumber, useDocumentTitle } from '@/lib/utils';

type Filter = 'all' | 'occupied' | 'free' | 'invited';

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'occupied', label: 'Com morador' },
  { value: 'invited', label: 'Com convite' },
  { value: 'free', label: 'Livres' }
];

function inviteMessage(invite: IssuedInvite, condominiumName: string) {
  return [
    'Olá!',
    `Este é o seu acesso ao Portal da Vila do ${condominiumName} (${invite.houseLabel}).`,
    `Abra ${RESIDENTS_APP_URL}, toque em “Tenho um código” e digite ${invite.code}.`,
    `O código vale até ${formatDate(invite.expiresAt)}, uma vez só. Depois é só criar a sua senha.`
  ].join('\n');
}

function InviteDialog({ invite, condominiumName, onClose }: { invite: IssuedInvite | null; condominiumName: string; onClose: () => void }) {
  const text = invite ? inviteMessage(invite, condominiumName) : '';
  return (
    <Dialog
      open={invite !== null}
      onClose={onClose}
      tone="ok"
      icon={<KeyRound aria-hidden className="size-5" />}
      title={invite ? `Convite · ${invite.houseLabel}` : 'Convite'}
      description="Ele aparece só agora: copie e envie ao morador. Se perder, gere um novo (o anterior deixa de valer)."
      footer={<Button onClick={onClose}>Concluir</Button>}
    >
      {invite && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-alt/60 p-4">
            <div>
              <p className="font-mono text-3xl font-semibold tracking-[0.2em]">{invite.code}</p>
              <p className="mt-1 text-xs text-muted">Vale até {formatDate(invite.expiresAt)}, uma vez só.</p>
            </div>
            <CopyButton text={invite.code} label="Copiar código" />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Mensagem pronta</p>
              <CopyButton text={text} label="Copiar mensagem" />
            </div>
            <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-surface p-4 font-sans text-sm text-muted">{text}</pre>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Every unit of the condominium: who lives there, which ones wait for an invitation, and the invitations themselves. */
export function UnitsPage() {
  const me = useSession();
  const condominium = me.condominium!;
  useDocumentTitle('Unidades e moradores');
  const queryClient = useQueryClient();
  const notify = useToast();
  const houses = useQuery({ queryKey: ['condo', 'houses'], queryFn: api.houses });
  const residents = useQuery({ queryKey: ['condo', 'residents'], queryFn: api.residents });
  const invites = useQuery({ queryKey: ['condo', 'invites'], queryFn: api.openInvites });
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [issued, setIssued] = useState<IssuedInvite | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['condo'] });
  const create = useMutation({
    mutationFn: api.createInvite,
    onSuccess: (invite) => {
      refresh();
      setIssued(invite);
    },
    onError: (error) => notify('danger', error.message)
  });
  const revoke = useMutation({
    mutationFn: api.revokeInvite,
    onSuccess: () => {
      refresh();
      notify('ok', 'Convite cancelado.');
    },
    onError: (error) => notify('danger', error.message)
  });

  const rows = useMemo(() => {
    const living = new Map((residents.data ?? []).filter((resident) => resident.status === 'ACTIVE').map((resident) => [resident.houseId, resident]));
    const open = new Map((invites.data ?? []).map((invite) => [invite.houseId, invite]));
    return (houses.data ?? []).map((house) => ({ house, resident: living.get(house.houseId), invite: open.get(house.houseId) }));
  }, [houses.data, residents.data, invites.data]);

  const counts = {
    total: rows.length,
    occupied: rows.filter((row) => row.resident).length,
    invited: rows.filter((row) => !row.resident && row.invite).length,
    free: rows.filter((row) => !row.resident && !row.invite).length
  };

  const visible = rows
    .filter((row) =>
      filter === 'all' ? true : filter === 'occupied' ? !!row.resident : filter === 'invited' ? !row.resident && !!row.invite : !row.resident && !row.invite
    )
    .filter((row) => {
      const term = search.trim().toLocaleLowerCase('pt-BR');
      return !term || row.house.label.toLocaleLowerCase('pt-BR').includes(term) || (row.resident?.name ?? '').toLocaleLowerCase('pt-BR').includes(term);
    });

  const loading = houses.isPending || residents.isPending || invites.isPending;
  const failed = houses.error ?? residents.error ?? invites.error;

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: condominium.name, to: '/condominio' }, { label: 'Unidades e moradores' }]}
        title="Unidades e moradores"
        description="Cada morador entra com um convite da unidade dele: um código de uso único que você gera aqui e envia."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {[
          { icon: Home, label: 'Unidades', value: counts.total },
          { icon: UserCheck, label: 'Com morador', value: counts.occupied },
          { icon: Mail, label: 'Convite enviado', value: counts.invited },
          { icon: Users, label: 'Livres', value: counts.free }
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label} className="flex items-center gap-3 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <Icon aria-hidden className="size-4" />
            </span>
            <div>
              <p className="text-xs text-muted">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{loading ? '…' : formatNumber(value)}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="busca-unidade" className="sr-only">
              Buscar unidade ou morador
            </label>
            <Input id="busca-unidade" type="search" placeholder="Buscar unidade ou morador" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented label="Mostrar" value={filter} options={filters} onChange={setFilter} />
        </div>

        {failed ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle aria-hidden className="size-5" />
            </span>
            <p className="font-medium">Não consegui carregar as unidades</p>
            <p className="max-w-md text-sm text-muted">{failed.message}</p>
            <Button variant="secondary" onClick={refresh}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <caption className="sr-only">Unidades do condomínio</caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Unidade</th>
                  <th scope="col" className="px-4 py-3 font-medium">Morador</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading &&
                  [0, 1, 2, 3].map((index) => (
                    <tr key={index}>
                      {[0, 1, 2, 3].map((cell) => (
                        <td key={cell} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-36" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  visible.map(({ house, resident, invite }) => (
                    <tr key={house.houseId} className="transition-colors hover:bg-surface-alt/50">
                      <td className="px-4 py-3.5 font-medium">{house.label}</td>
                      <td className="px-4 py-3.5">
                        {resident ? (
                          <div className="min-w-0">
                            <p className="truncate">{resident.name}</p>
                            {resident.email && <p className="truncate text-xs text-muted">{resident.email}</p>}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {resident ? (
                          <Badge tone="ok">Com morador</Badge>
                        ) : invite ? (
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge tone="warn">Convite enviado</Badge>
                            <span className="text-xs text-muted">até {formatDate(invite.expiresAt)}</span>
                          </span>
                        ) : (
                          <Badge>Livre</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {!resident && (
                          <div className="flex justify-end gap-2">
                            {invite && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={revoke.isPending}
                                onClick={() => revoke.mutate(invite.id)}
                                aria-label={`Cancelar o convite (${house.label})`}
                              >
                                <X aria-hidden className="size-4" /> Cancelar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={invite ? 'secondary' : 'primary'}
                              disabled={create.isPending}
                              onClick={() => create.mutate(house.houseId)}
                            >
                              {create.isPending && create.variables === house.houseId ? <Spinner /> : <UserPlus aria-hidden className="size-4" />}
                              {invite ? 'Novo código' : 'Gerar convite'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className={cn('px-4 py-14 text-center text-sm text-muted')}>
                      {rows.length === 0 ? 'Nenhuma unidade cadastrada ainda.' : 'Nenhuma unidade com esse filtro.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InviteDialog invite={issued} condominiumName={condominium.name} onClose={() => setIssued(null)} />
    </div>
  );
}
