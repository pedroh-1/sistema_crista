import { SituacaoMeta } from './tipos';

export const NOME_SITUACAO_META: Record<SituacaoMeta, string> = {
  abaixo: 'Abaixo da meta',
  dentro: 'Dentro da meta',
  acima: 'Acima da meta',
};

/** Tom da etiqueta: abaixo da meta é crítico, acima pede atenção. */
export const CLASSE_SITUACAO_META: Record<SituacaoMeta, string> = {
  abaixo: 'critico',
  dentro: 'sucesso',
  acima: 'atencao',
};

/** Situação nunca só por cor: o glifo vai junto do texto. */
export const ICONE_SITUACAO_META: Record<SituacaoMeta, string> = {
  abaixo: '‼',
  dentro: '✓',
  acima: '⚠',
};
