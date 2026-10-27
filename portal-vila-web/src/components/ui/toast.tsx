import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Toast = { id: number; tone: 'ok' | 'danger'; message: string };
type Notify = (tone: Toast['tone'], message: string) => void;

const ToastContext = createContext<Notify>(() => {});

let next = 1;

/** Short notices in the corner ("Condomínio criado"), read out by screen readers, gone after a few seconds. */
export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const notify = useCallback<Notify>(
    (tone, message) => {
      const id = next++;
      setToasts((current) => [...current.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-lg"
          >
            {toast.tone === 'ok' ? (
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-ok" />
            ) : (
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            )}
            <p className="flex-1 text-ink">{toast.message}</p>
            <button type="button" aria-label="Fechar aviso" onClick={() => dismiss(toast.id)} className={cn('text-muted hover:text-ink')}>
              <X aria-hidden className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
