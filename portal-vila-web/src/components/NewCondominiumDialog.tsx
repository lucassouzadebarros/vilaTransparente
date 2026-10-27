import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { Field, Segmented } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type UnitLabel } from '@/lib/api';
import { formatNumber, slugify } from '@/lib/utils';

const unitLabels: { value: UnitLabel; label: string }[] = [
  { value: 'Casa', label: 'Casas' },
  { value: 'Apto', label: 'Apartamentos' },
  { value: 'Unidade', label: 'Unidades' },
  { value: 'Lote', label: 'Lotes' },
  { value: 'Sala', label: 'Salas' }
];

const MAX_UNITS = 2000;

function unitName(label: UnitLabel, number: number) {
  return `${label} ${number < 10 ? `0${number}` : number}`;
}

/** Name, identifier (made from the name, can be changed) and the units, with a preview of what will be created. */
export function NewCondominiumDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [unitLabel, setUnitLabel] = useState<UnitLabel>('Casa');
  const [units, setUnits] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const effectiveSlug = slugTouched ? slugify(slug) : slugify(name);
  const count = units === '' ? 0 : Number(units);
  const errors = {
    name: name.trim().length < 3 ? 'Escreva o nome do condomínio (pelo menos 3 letras).' : null,
    slug: effectiveSlug.length < 2 ? 'O identificador precisa ter letras ou números.' : null,
    units: !Number.isInteger(count) || count < 0 || count > MAX_UNITS ? `De 0 a ${formatNumber(MAX_UNITS)} unidades.` : null
  };
  const valid = !errors.name && !errors.slug && !errors.units;

  const create = useMutation({
    mutationFn: () => api.createCondominium({ name: name.trim(), slug: effectiveSlug, unitLabel, units: count }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
      notify('ok', `${created.name} foi criado com ${formatNumber(created.houses)} ${created.houses === 1 ? 'unidade' : 'unidades'}.`);
      close();
      navigate(`/condominios/${created.id}`);
    }
  });

  function close() {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setUnitLabel('Casa');
    setUnits('');
    setSubmitted(false);
    create.reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (valid) create.mutate();
  }

  const preview =
    count > 0 && !errors.units
      ? count <= 4
        ? Array.from({ length: count }, (_, index) => unitName(unitLabel, index + 1)).join(', ')
        : `${unitName(unitLabel, 1)}, ${unitName(unitLabel, 2)}, ${unitName(unitLabel, 3)} … ${unitName(unitLabel, count)}`
      : null;

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Novo condomínio"
      description="Ele nasce ativo, com as unidades que você informar. O síndico e o Pix são ligados depois."
      icon={<Building2 aria-hidden className="size-5" />}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="novo-condominio" disabled={create.isPending}>
            {create.isPending && <Spinner />}
            {create.isPending ? 'Criando…' : 'Criar condomínio'}
          </Button>
        </>
      }
    >
      <form id="novo-condominio" onSubmit={submit} noValidate className="space-y-5">
        {create.isError && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {create.error.message}
          </div>
        )}

        <Field label="Nome do condomínio" htmlFor="nome" error={submitted ? errors.name : null}>
          <Input
            id="nome"
            data-autofocus
            placeholder="Ex.: Residencial Jardim das Flores"
            value={name}
            maxLength={140}
            aria-invalid={submitted && !!errors.name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field
          label="Identificador"
          htmlFor="identificador"
          error={submitted ? errors.slug : null}
          hint="Nome curto e único, usado pelo sistema. Só letras minúsculas, números e hífen."
        >
          <Input
            id="identificador"
            className="font-mono"
            placeholder="residencial-jardim-das-flores"
            value={slugTouched ? slug : effectiveSlug}
            maxLength={60}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
          />
        </Field>

        <div className="space-y-3 rounded-xl border border-line bg-surface-alt/50 p-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Tipo de unidade</p>
            <Segmented label="Tipo de unidade" value={unitLabel} options={unitLabels} onChange={setUnitLabel} />
          </div>
          <Field label="Quantidade" htmlFor="quantidade" error={submitted || units !== '' ? errors.units : null} className="max-w-40">
            <Input
              id="quantidade"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_UNITS}
              placeholder="0"
              value={units}
              onChange={(event) => setUnits(event.target.value)}
            />
          </Field>
          <p className="text-xs text-muted" aria-live="polite">
            {preview ? (
              <>
                Serão criadas <strong className="font-medium text-ink">{formatNumber(count)}</strong>: {preview}
              </>
            ) : (
              'Sem unidades por enquanto: dá para criar o condomínio e cadastrar as unidades depois.'
            )}
          </p>
        </div>
      </form>
    </Dialog>
  );
}
