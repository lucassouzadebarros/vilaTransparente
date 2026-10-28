import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import type { GenerateResult } from '@/lib/api';
import { monthName, plural } from '@/lib/utils';

/** Today in this computer's calendar, as "2026-10-28". */
export function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** What a batch did: how many charges went out, and each unit that failed or was left out, with the reason. */
export function ResultDialog({ open, result, onClose }: { open: boolean; result: GenerateResult; onClose: () => void }) {
  const problems = result.failed.length + result.skipped.length;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      tone={result.failed.length > 0 ? 'danger' : 'ok'}
      icon={result.failed.length > 0 ? <TriangleAlert aria-hidden className="size-5" /> : <CheckCircle2 aria-hidden className="size-5" />}
      title={result.created > 0 ? `${plural(result.created, 'cobrança criada', 'cobranças criadas')}` : 'Nenhuma cobrança nova'}
      description={
        <>
          Mês de {monthName(result.month)}.
          {result.alreadyCharged > 0 &&
            ` ${plural(result.alreadyCharged, 'unidade já tinha cobrança e ficou como estava', 'unidades já tinham cobrança e ficaram como estavam')}.`}
          {result.created > 0 && ' Os moradores já veem a cobrança no aplicativo.'}
        </>
      }
      footer={<Button onClick={onClose}>Concluir</Button>}
    >
      {problems > 0 && (
        <div className="space-y-4">
          {result.failed.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-danger">Não foi possível cobrar</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {result.failed.map((problem) => (
                  <li key={problem.houseLabel} className="px-4 py-3 text-sm">
                    <p className="font-medium">{problem.houseLabel}</p>
                    <p className="text-muted">{problem.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.skipped.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Ficaram de fora</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {result.skipped.map((problem) => (
                  <li key={problem.houseLabel} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <span className="font-medium">{problem.houseLabel}</span>
                    <span className="text-muted">{problem.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
