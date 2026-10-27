import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import logo from '@/logo.png';
import { useDocumentTitle } from '@/lib/utils';

type Highlight = { icon: LucideIcon; text: string };

/**
 * The pages anyone can open (sign in, ask for a condominium, activate an account): the brand on the left, the form on
 * the right. On a phone, only the form, with the brand on top.
 */
export function PublicLayout({
  documentTitle,
  eyebrow,
  title,
  lead,
  highlights,
  footnote,
  children
}: {
  documentTitle: string;
  eyebrow: string;
  title: string;
  lead: string;
  highlights: Highlight[];
  footnote?: ReactNode;
  children: ReactNode;
}) {
  useDocumentTitle(documentTitle);
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-ink lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between">
        {/* Depth without noise: a soft light from the corner and a faint grid that fades out. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_40rem_at_110%_-10%,rgba(92,184,201,0.22),transparent_60%),radial-gradient(40rem_30rem_at_-20%_120%,rgba(91,196,139,0.12),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />
        <Link to="/entrar" className="relative flex w-fit items-center gap-3">
          <img src={logo} alt="" className="size-10 rounded-xl" />
          <span className="text-lg font-semibold">Portal da Vila</span>
        </Link>
        <div className="relative max-w-md">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-sidebar-muted">
            <span aria-hidden className="size-1.5 rounded-full bg-[#5bc48b]" />
            {eyebrow}
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-balance">{title}</h1>
          <p className="mt-3 text-sidebar-muted">{lead}</p>
          <ul className="mt-10 space-y-5">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-active">
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="pt-1.5 text-sm text-sidebar-ink/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-sidebar-muted">{footnote}</div>
      </section>

      <section className="flex items-start justify-center px-4 py-10 sm:px-8 lg:items-center lg:py-12">
        <div className="w-full max-w-md">
          <Link to="/entrar" className="mb-8 flex w-fit items-center gap-3 lg:hidden">
            <img src={logo} alt="" className="size-10 rounded-xl" />
            <div>
              <p className="font-semibold">Portal da Vila</p>
              <p className="text-sm text-muted">{eyebrow}</p>
            </div>
          </Link>
          {children}
        </div>
      </section>
    </div>
  );
}

/** A message in a form: what went wrong, said plainly, in the colors of an error. */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
      {children}
    </div>
  );
}
