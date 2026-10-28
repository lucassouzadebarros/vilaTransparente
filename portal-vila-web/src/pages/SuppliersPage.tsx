import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Pencil, Plus, Search, Truck } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { FormAlert } from '@/components/PublicLayout';
import { Badge, Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { Field, PageHeader } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type PixKeyType, type Supplier, type SupplierInput } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatPhone, useDocumentTitle } from '@/lib/utils';

export const pixKeyTypes: { value: PixKeyType; label: string }[] = [
  { value: 'CNPJ', label: 'CNPJ' },
  { value: 'CPF', label: 'CPF' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'PHONE', label: 'Telefone' },
  { value: 'EVP', label: 'Chave aleatória' }
];

/** 12345678000190 -> 12.345.678/0001-90; 12345678901 -> 123.456.789-01. */
export function formatDocument(value: string | null) {
  if (!value) return '';
  if (value.length === 14) return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (value.length === 11) return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return value;
}

export function pixKeyText(supplier: Pick<Supplier, 'pixKey' | 'pixKeyType'>) {
  if (!supplier.pixKey) return null;
  if (supplier.pixKeyType === 'CPF' || supplier.pixKeyType === 'CNPJ') return formatDocument(supplier.pixKey);
  if (supplier.pixKeyType === 'PHONE') return formatPhone(supplier.pixKey);
  return supplier.pixKey;
}

const empty: SupplierInput = { name: '', document: '', pixKey: '', pixKeyType: 'CNPJ', phone: '', email: '', notes: '' };

/** A supplier's details: name, document and the Pix key the payments go to. */
export function SupplierDialog({ supplier, onClose, onSaved }: { supplier: Supplier | null; onClose: () => void; onSaved?: (saved: Supplier) => void }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [form, setForm] = useState<SupplierInput>(() =>
    supplier
      ? {
          name: supplier.name,
          document: formatDocument(supplier.document),
          pixKey: supplier.pixKey ? (pixKeyText(supplier) ?? '') : '',
          pixKeyType: supplier.pixKeyType ?? 'CNPJ',
          phone: supplier.phone ?? '',
          email: supplier.email ?? '',
          notes: supplier.notes ?? ''
        }
      : empty
  );
  const set = (field: keyof SupplierInput) => (value: string) => setForm({ ...form, [field]: value });
  const nameError = form.name.trim().length < 2 ? 'Informe o nome.' : null;

  const save = useMutation({
    mutationFn: () =>
      api.saveSupplier(supplier?.id ?? null, {
        ...form,
        document: form.document?.trim() || null,
        pixKey: form.pixKey?.trim() || null,
        pixKeyType: form.pixKey?.trim() ? form.pixKeyType : null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        notes: form.notes?.trim() || null
      }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['condo', 'suppliers'] });
      notify('ok', supplier ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
      onSaved?.(saved);
      onClose();
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!nameError) save.mutate();
  }

  return (
    <Dialog
      open
      onClose={() => !save.isPending && onClose()}
      icon={<Truck aria-hidden className="size-5" />}
      title={supplier ? `Editar ${supplier.name}` : 'Novo fornecedor'}
      description="Quem o condomínio paga. Com a chave Pix, o pagamento pelo sistema fica a um clique."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="fornecedor" disabled={save.isPending || !!nameError}>
            {save.isPending && <Spinner />}
            Salvar
          </Button>
        </>
      }
    >
      <form id="fornecedor" onSubmit={submit} noValidate className="space-y-4">
        {save.isError && <FormAlert>{save.error.message}</FormAlert>}
        <Field label="Nome" htmlFor="fornecedor-nome" error={form.name && nameError ? nameError : null}>
          <Input id="fornecedor-nome" data-autofocus maxLength={160} value={form.name} onChange={(e) => set('name')(e.target.value)} />
        </Field>
        <Field label="CPF ou CNPJ" htmlFor="fornecedor-documento" hint="Opcional.">
          <Input id="fornecedor-documento" inputMode="numeric" value={form.document ?? ''} onChange={(e) => set('document')(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,11rem)_1fr]">
          <Field label="Tipo da chave Pix" htmlFor="fornecedor-tipo">
            <select
              id="fornecedor-tipo"
              value={form.pixKeyType ?? 'CNPJ'}
              onChange={(e) => set('pixKeyType')(e.target.value)}
              className="h-10 w-full rounded-lg border border-line-strong/60 bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              {pixKeyTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Chave Pix" htmlFor="fornecedor-chave" hint="Opcional. Confira com o fornecedor: é para onde o dinheiro vai.">
            <Input id="fornecedor-chave" value={form.pixKey ?? ''} onChange={(e) => set('pixKey')(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone" htmlFor="fornecedor-telefone">
            <Input id="fornecedor-telefone" inputMode="tel" value={form.phone ?? ''} onChange={(e) => set('phone')(e.target.value)} />
          </Field>
          <Field label="E-mail" htmlFor="fornecedor-email">
            <Input id="fornecedor-email" type="email" value={form.email ?? ''} onChange={(e) => set('email')(e.target.value)} />
          </Field>
        </div>
        <Field label="Observações" htmlFor="fornecedor-obs">
          <Input id="fornecedor-obs" maxLength={500} value={form.notes ?? ''} onChange={(e) => set('notes')(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/** Who the condominium pays: name, document, Pix key and contact. */
export function SuppliersPage() {
  const me = useSession();
  const condominium = me.condominium!;
  useDocumentTitle('Fornecedores');
  const queryClient = useQueryClient();
  const notify = useToast();
  const suppliers = useQuery({ queryKey: ['condo', 'suppliers'], queryFn: api.suppliers });
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const deactivate = useMutation({
    mutationFn: api.deactivateSupplier,
    onSuccess: (supplier) => {
      queryClient.invalidateQueries({ queryKey: ['condo', 'suppliers'] });
      notify('ok', `${supplier.name} saiu da lista.`);
    },
    onError: (error) => notify('danger', error.message)
  });

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (suppliers.data ?? [])
      .filter((supplier) => showInactive || supplier.active)
      .filter((supplier) => !term || supplier.name.toLocaleLowerCase('pt-BR').includes(term) || (supplier.document ?? '').includes(term.replace(/\D/g, '') || '§'));
  }, [suppliers.data, search, showInactive]);

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: condominium.name, to: me.role === 'ADMIN' ? '/condominio' : '/condominio/contas' }, { label: 'Fornecedores' }]}
        title="Fornecedores"
        description="Quem o condomínio paga, com a chave Pix para onde o dinheiro vai."
        actions={
          me.canPay && (
            <Button onClick={() => setEditing('new')}>
              <Plus aria-hidden className="size-4" />
              Novo fornecedor
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="busca-fornecedor" className="sr-only">
              Buscar fornecedor
            </label>
            <Input id="busca-fornecedor" type="search" placeholder="Buscar por nome ou documento" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            Mostrar os que saíram da lista
          </label>
        </div>
        {suppliers.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AlertTriangle aria-hidden className="size-6 text-danger" />
            <p className="max-w-md text-sm text-muted">{suppliers.error.message}</p>
            <Button variant="secondary" onClick={() => suppliers.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Fornecedores do condomínio</caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Fornecedor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Chave Pix</th>
                  <th scope="col" className="px-4 py-3 font-medium">Contato</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {suppliers.isPending &&
                  [0, 1, 2].map((index) => (
                    <tr key={index}>
                      {[0, 1, 2, 3].map((cell) => (
                        <td key={cell} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-36" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!suppliers.isPending &&
                  visible.map((supplier) => (
                    <tr key={supplier.id} className="transition-colors hover:bg-surface-alt/50">
                      <td className="px-4 py-3.5">
                        <p className="font-medium">
                          {supplier.name}
                          {!supplier.active && (
                            <Badge className="ml-2" tone="neutral">
                              Fora da lista
                            </Badge>
                          )}
                        </p>
                        {supplier.document && <p className="text-xs text-muted tabular-nums">{formatDocument(supplier.document)}</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        {supplier.pixKey ? (
                          <>
                            <p className="tabular-nums">{pixKeyText(supplier)}</p>
                            <p className="text-xs text-muted">{pixKeyTypes.find((type) => type.value === supplier.pixKeyType)?.label}</p>
                          </>
                        ) : (
                          <span className="text-muted">Sem chave</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-muted">
                        {[supplier.phone && formatPhone(supplier.phone), supplier.email].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        {me.canPay && supplier.active && (
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setEditing(supplier)} aria-label={`Editar ${supplier.name}`}>
                              <Pencil aria-hidden className="size-4" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deactivate.isPending}
                              onClick={() => deactivate.mutate(supplier.id)}
                              aria-label={`Tirar ${supplier.name} da lista`}
                              className="text-danger hover:bg-danger-soft hover:text-danger"
                            >
                              <Ban aria-hidden className="size-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                {!suppliers.isPending && visible.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-14 text-center text-sm text-muted">
                      {(suppliers.data ?? []).length === 0 ? 'Nenhum fornecedor cadastrado ainda.' : 'Nenhum fornecedor com essa busca.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <SupplierDialog supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
