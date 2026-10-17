import { SituacaoMeta } from './tipos';

/** Nome da situação da meta de peso. O tom vem de `tomDaMeta()` (`@crista/domain`). */
export const NOME_SITUACAO_META: Record<SituacaoMeta, string> = {
  abaixo: 'Abaixo da meta',
  dentro: 'Dentro da meta',
  acima: 'Acima da meta',
};
