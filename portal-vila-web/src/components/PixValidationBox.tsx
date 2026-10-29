import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { CopyButton } from '@/components/ManagerCodeDialog';
import { FormAlert } from '@/components/PublicLayout';
import { Button, Skeleton, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

/**
 * The extra lock in Asaas: before any withdrawal leaves the account, Asaas asks this server, which only approves the Pix
 * it requested itself. The administration types the address and the token below in Asaas.
 */
export function PixValidationBox() {
  const queryClient = useQueryClient();
  const validation = useQuery({ queryKey: ['condo', 'pix-validation'], queryFn: api.pixValidation });
  const [showToken, setShowToken] = useState(false);
  const create = useMutation({
    mutationFn: api.createPixValidation,
    onSuccess: (fresh) => {
      queryClient.setQueryData(['condo', 'pix-validation'], fresh);
      setShowToken(true);
    }
  });
  const data = validation.data;

  return (
    <div className="space-y-3 rounded-lg border border-line p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok">
          <ShieldCheck aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">Trava extra no Asaas: validação de saque</p>
          <p className="mt-0.5 text-xs text-muted">
            Antes de qualquer saque sair da conta, o Asaas pergunta ao Portal; só os Pix pedidos aqui são liberados. Assim, nem quem tivesse a chave de API conseguiria
            tirar dinheiro.
          </p>
        </div>
      </div>
      {create.isError && <FormAlert>{create.error.message}</FormAlert>}
      {validation.isPending ? (
        <Skeleton className="h-16 rounded-lg" />
      ) : !data?.configured ? (
        <Button size="sm" variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending && <Spinner />}
          Gerar endereço e token
        </Button>
      ) : (
        <>
          <dl className="space-y-2 text-sm">
            <div className="min-w-0">
              <dt className="text-xs text-muted">Endereço (URL)</dt>
              <dd className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface-alt px-2 py-1 text-xs">{data.url}</code>
                <CopyButton text={data.url!} label="Copiar endereço" />
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted">Token de autenticação</dt>
              <dd className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-surface-alt px-2 py-1 text-xs">{showToken ? data.token : '•'.repeat(24)}</code>
                <Button size="sm" variant="ghost" onClick={() => setShowToken((shown) => !shown)} aria-label={showToken ? 'Esconder token' : 'Mostrar token'}>
                  {showToken ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                </Button>
                <CopyButton text={data.token!} label="Copiar token" />
              </dd>
            </div>
          </dl>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
            <li>No Asaas: menu do usuário › Integrações › Mecanismos de segurança.</li>
            <li>Em validação de saque via webhook, cole o endereço e o token, e informe um e-mail para avisos de erro.</li>
            <li>Deixe desligada a validação das operações feitas pelo site do Asaas, para continuar sacando por lá quando precisar.</li>
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">{data.lastCheckAt ? `Última consulta do Asaas: ${formatDateTime(data.lastCheckAt)}` : 'O Asaas ainda não consultou este endereço.'}</p>
            <Button size="sm" variant="ghost" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending && <Spinner />}
              Gerar outro token
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
