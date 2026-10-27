import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ClipboardCheck, KeyRound, MessageSquareText } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FormAlert, PublicLayout } from '@/components/PublicLayout';
import { Button, Input, Spinner } from '@/components/ui';
import { Field, Segmented } from '@/components/ui/page';
import { api, RESIDENTS_APP_URL, type RequestForm } from '@/lib/api';

const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const steps = [
  { icon: MessageSquareText, text: 'Você conta sobre o condomínio. Leva dois minutos.' },
  { icon: ClipboardCheck, text: 'Nós analisamos e respondemos no seu e-mail.' },
  { icon: KeyRound, text: 'Aprovado, você recebe um código para criar sua senha e começar.' }
];

const asaasOptions: { value: RequestForm['hasAsaas']; label: string }[] = [
  { value: 'SIM', label: 'Sim' },
  { value: 'NAO', label: 'Não' },
  { value: 'NAO_SEI', label: 'Não sei' }
];

const empty: RequestForm = {
  condominiumName: '',
  city: '',
  state: '',
  units: 0,
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  hasAsaas: 'NAO_SEI',
  message: '',
  website: ''
};

/** (21) 99999-0000 as it is typed. */
function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function RequestPage() {
  const [form, setForm] = useState(empty);
  const [units, setUnits] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const set = <K extends keyof RequestForm>(key: K, value: RequestForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const count = Number(units);
  const errors = {
    condominiumName: form.condominiumName.trim().length < 3 ? 'Escreva o nome do condomínio.' : null,
    city: form.city.trim().length < 2 ? 'Informe a cidade.' : null,
    state: !form.state ? 'Escolha o estado.' : null,
    units: !Number.isInteger(count) || count < 1 || count > 2000 ? 'De 1 a 2.000 unidades.' : null,
    contactName: form.contactName.trim().length < 2 ? 'Informe seu nome.' : null,
    contactEmail: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim()) ? 'Informe um e-mail válido.' : null,
    contactPhone: form.contactPhone && form.contactPhone.replace(/\D/g, '').length < 10 ? 'Confira o telefone com DDD.' : null
  };
  const valid = Object.values(errors).every((error) => !error);
  const show = (key: keyof typeof errors) => (submitted ? errors[key] : null);

  const send = useMutation({ mutationFn: () => api.submitRequest({ ...form, units: count }) });

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (valid) send.mutate();
  }

  return (
    <PublicLayout
      documentTitle="Cadastrar condomínio"
      eyebrow="Cadastro de condomínio"
      title="Leve o Portal da Vila para o seu condomínio"
      lead="Prestação de contas aberta, relatos, orçamentos com votação das unidades e cobrança por Pix."
      highlights={steps}
      footnote="Nada é criado agora: o seu pedido passa por análise antes."
    >
      {send.isSuccess ? (
        <div className="flex flex-col items-start">
          <span className="grid size-12 place-items-center rounded-2xl bg-ok-soft text-ok">
            <CheckCircle2 aria-hidden className="size-6" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold">Recebemos o seu pedido</h2>
          <p className="mt-2 text-sm text-muted">
            Vamos analisar o cadastro do <strong className="font-medium text-ink">{form.condominiumName.trim()}</strong> e responder em{' '}
            <strong className="font-medium text-ink">{form.contactEmail.trim()}</strong>. Se for aprovado, você recebe um código para criar a sua senha.
          </p>
          <Link to="/entrar" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
            <ArrowLeft aria-hidden className="size-4" /> Voltar ao início
          </Link>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-semibold">Quero cadastrar meu condomínio</h2>
          <p className="mt-1 text-sm text-muted">Preencha e nós entramos em contato.</p>

          {send.isError && (
            <div className="mt-6">
              <FormAlert>{send.error.message}</FormAlert>
            </div>
          )}

          <form onSubmit={submit} noValidate className="mt-6 space-y-6">
            <fieldset className="space-y-4">
              <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">O condomínio</legend>
              <Field label="Nome do condomínio" htmlFor="condominio" error={show('condominiumName')}>
                <Input id="condominio" placeholder="Ex.: Residencial Jardim das Flores" maxLength={140} value={form.condominiumName} onChange={(e) => set('condominiumName', e.target.value)} />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
                <Field label="Cidade" htmlFor="cidade" error={show('city')}>
                  <Input id="cidade" autoComplete="address-level2" maxLength={80} value={form.city} onChange={(e) => set('city', e.target.value)} />
                </Field>
                <Field label="Estado" htmlFor="estado" error={show('state')}>
                  <select
                    id="estado"
                    value={form.state}
                    onChange={(e) => set('state', e.target.value)}
                    className="h-10 w-full rounded-lg border border-line-strong/60 bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                  >
                    <option value="">UF</option>
                    {states.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Número de unidades" htmlFor="unidades" error={show('units')} hint="Casas, apartamentos, lotes ou salas." className="max-w-64">
                <Input id="unidades" type="number" inputMode="numeric" min={1} max={2000} value={units} onChange={(e) => setUnits(e.target.value)} />
              </Field>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">O condomínio já tem conta no Asaas?</p>
                <Segmented label="Conta no Asaas" value={form.hasAsaas} options={asaasOptions} onChange={(value) => set('hasAsaas', value)} />
                <p className="text-xs text-muted">É por onde as mensalidades são cobradas por Pix. Não é preciso ter para começar.</p>
              </div>
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Quem administra</legend>
              <Field label="Seu nome" htmlFor="nome" error={show('contactName')}>
                <Input id="nome" autoComplete="name" maxLength={120} value={form.contactName} onChange={(e) => set('contactName', e.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="E-mail" htmlFor="email" error={show('contactEmail')}>
                  <Input id="email" type="email" autoComplete="email" maxLength={160} value={form.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
                </Field>
                <Field label="Telefone (opcional)" htmlFor="telefone" error={show('contactPhone')}>
                  <Input
                    id="telefone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="(21) 99999-0000"
                    value={form.contactPhone}
                    onChange={(e) => set('contactPhone', maskPhone(e.target.value))}
                  />
                </Field>
              </div>
              <Field label="Quer contar mais alguma coisa? (opcional)" htmlFor="mensagem">
                <textarea
                  id="mensagem"
                  rows={3}
                  maxLength={1000}
                  value={form.message}
                  onChange={(e) => set('message', e.target.value)}
                  className="w-full resize-y rounded-lg border border-line-strong/60 bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/80 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                />
              </Field>
            </fieldset>

            {/* Hidden from people; robots fill every field they find. */}
            <div aria-hidden className="absolute -left-[10000px] h-px w-px overflow-hidden">
              <label htmlFor="site">Site</label>
              <input id="site" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} />
            </div>

            <Button type="submit" className="w-full" disabled={send.isPending}>
              {send.isPending && <Spinner />}
              {send.isPending ? 'Enviando…' : 'Enviar pedido'}
            </Button>
            <p className="text-center text-xs text-muted">
              O seu condomínio já usa o Portal da Vila?{' '}
              <a href={RESIDENTS_APP_URL} className="font-medium text-brand hover:underline">
                Abrir o aplicativo
              </a>
            </p>
          </form>
        </>
      )}
    </PublicLayout>
  );
}
