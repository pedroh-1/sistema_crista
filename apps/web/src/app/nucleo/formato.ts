import { Indicador } from '@crista/domain';

const numero = (casas: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

/** Número no formato brasileiro, ou travessão quando ausente. */
export function formatarNumero(
  valor: number | null | undefined,
  casas = 0,
): string {
  return valor == null ? '—' : numero(casas).format(valor);
}

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Valor em reais (R$ 1.250,00), ou travessão quando ausente. */
export function formatarReais(valor: number | null | undefined): string {
  return valor == null ? '—' : reais.format(valor);
}

/** Valor do indicador, ou travessão quando indisponível (o motivo vai no title). */
export function formatarIndicador(
  i: Indicador,
  casas = 0,
  unidade = '',
): string {
  return i.disponivel ? `${numero(casas).format(i.valor)}${unidade}` : '—';
}

/** AAAA-MM-DD para DD/MM/AAAA. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Hoje (AAAA-MM-DD) no fuso das fazendas, para valores iniciais de formulário. */
export const hoje = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
