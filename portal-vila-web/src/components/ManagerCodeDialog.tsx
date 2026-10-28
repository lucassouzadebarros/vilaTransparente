import { Check, Copy, KeyRound } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import type { ManagerInvitation } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

function activationLink(code: string) {
  return `${window.location.origin}/ativar#${code}`;
}

function message(invitation: ManagerInvitation, condominiumName: string) {
  return [
    `Olá, ${invitation.name.split(' ')[0]}!`,
    `O ${condominiumName} foi cadastrado no Portal da Vila.`,
    `Para ativar a sua conta e criar a sua senha, abra ${activationLink(invitation.code)}`,
    `Se pedir, o código é ${invitation.code} (vale até ${formatDate(invitation.expiresAt)}, uma vez só).`,
    `Depois, entre no aplicativo com o e-mail ${invitation.email}.`
  ].join('\n');
}

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          // No clipboard (an old browser): the text is on screen to select by hand.
        }
      }}
    >
      {copied ? <Check aria-hidden className="size-4 text-ok" /> : <Copy aria-hidden className="size-4" />}
      {copied ? 'Copiado' : label}
    </Button>
  );
}

/**
 * The activation code, shown this once (only its hash is kept), with a ready message to send by WhatsApp or e-mail.
 */
export function ManagerCodeDialog({
  invitation,
  condominiumName,
  onClose,
  actions
}: {
  invitation: ManagerInvitation | null;
  condominiumName: string;
  onClose: () => void;
  actions?: ReactNode;
}) {
  const text = invitation ? message(invitation, condominiumName) : '';
  return (
    <Dialog
      open={invitation !== null}
      onClose={onClose}
      title="Código de ativação do síndico"
      description="Ele aparece só agora: copie e envie. Se perder, gere um novo na página do condomínio."
      icon={<KeyRound aria-hidden className="size-5" />}
      tone="ok"
      footer={
        <>
          {actions}
          <Button onClick={onClose}>Concluir</Button>
        </>
      }
    >
      {invitation && (
        <div className="space-y-5">
          <div className="rounded-xl border border-line bg-surface-alt/60 p-4">
            <p className="text-xs text-muted">
              Para <strong className="font-medium text-ink">{invitation.name}</strong> · {invitation.email}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-3xl font-semibold tracking-[0.2em] text-ink" aria-label={`Código ${invitation.code.split('').join(' ')}`}>
                {invitation.code}
              </p>
              <CopyButton text={invitation.code} label="Copiar código" />
            </div>
            <p className="mt-2 text-xs text-muted">Vale até {formatDate(invitation.expiresAt)}, uma vez só.</p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Mensagem pronta</p>
              <CopyButton text={text} label="Copiar mensagem" />
            </div>
            <pre className={cn('whitespace-pre-wrap break-words rounded-xl border border-line bg-surface p-4 font-sans text-sm text-muted')}>{text}</pre>
          </div>
        </div>
      )}
    </Dialog>
  );
}
