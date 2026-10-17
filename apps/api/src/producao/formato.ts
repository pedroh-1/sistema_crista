import { CategoriaDespesa, NOME_CATEGORIA } from '@crista/domain';

/** Formatação dos relatórios e textos gerados pela API, no padrão brasileiro. */
export const br = (iso: string) => iso.split('-').reverse().join('/');

export const num = (v: number | null | undefined, casas = 0) =>
  v == null
    ? '—'
    : v.toLocaleString('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      });

export const brl = (v: number | null | undefined) =>
  v == null
    ? '—'
    : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const nomeCategoria = (c: string) =>
  NOME_CATEGORIA[c as CategoriaDespesa] ?? (c === 'pintos' ? 'Pintos' : c);
