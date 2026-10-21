/** Friendly names for the document types the API stores as codes. */
const singular: Record<string, string> = {
  NOTA_FISCAL: 'Nota fiscal',
  RECIBO: 'Recibo',
  ORCAMENTO: 'Orçamento',
  ATA: 'Ata',
  CONTRATO: 'Contrato',
  COMPROVANTE: 'Comprovante'
};

const plural: Record<string, string> = {
  NOTA_FISCAL: 'Notas fiscais',
  RECIBO: 'Recibos',
  ORCAMENTO: 'Orçamentos',
  ATA: 'Atas',
  CONTRATO: 'Contratos',
  COMPROVANTE: 'Comprovantes'
};

export function documentTypeLabel(type?: string | null) {
  return (type && singular[type]) || 'Outro';
}

export function documentTypePlural(type?: string | null) {
  return (type && plural[type]) || 'Outros';
}
