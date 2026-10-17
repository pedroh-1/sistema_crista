import { z } from 'zod';
import {
  avaliarLimite,
  FORMATOS_RELATORIO,
  Limites,
  NivelLimite,
  PontoMortalidadeDia,
} from './alertas';
import { SituacaoMeta, situacaoMeta } from './custos';
import { disponivel, Indicador, indisponivel } from './indicador';
import { dataISO } from './schemas';
import {
  conversaoAlimentar,
  mortalidadeAcumulada,
  viabilidade,
} from './zootecnicos';

// ---------- Tom dos indicadores (docs/08-design.md) ----------

/**
 * Como a tela pinta um indicador. Só recebe cor o que tem regra por trás: os
 * limites dos alertas (configuráveis pela fazenda) e a faixa da meta de peso.
 * O resto fica `neutro`, porque não há referência para dizer se é bom ou ruim.
 */
export type Tom = 'sucesso' | 'atencao' | 'critico' | 'neutro';

/** Nível de um limite de alerta: dentro do limite é favorável. */
export function tomDoNivel(nivel: NivelLimite | null | undefined): Tom {
  if (nivel === 'critico' || nivel === 'atencao') return nivel;
  return nivel === 'normal' ? 'sucesso' : 'neutro';
}

/**
 * Peso contra a curva: o limite de `desvio_peso` decide atenção e crítico; sem
 * passar dele, fora da faixa da meta (abaixo ou acima) pede atenção.
 */
export function tomDaMeta(
  nivel: NivelLimite | null | undefined,
  situacao: SituacaoMeta | null | undefined,
): Tom {
  if (nivel === 'critico' || nivel === 'atencao') return nivel;
  if (!situacao) return 'neutro';
  return situacao === 'dentro' ? 'sucesso' : 'atencao';
}

/** Tom do desvio da curva (%), direto dos limites de `desvio_peso`. */
export function tomDoDesvioPeso(desvioPct: number, limites: Limites): Tom {
  return tomDaMeta(
    avaliarLimite(desvioPct, limites, 'abaixo'),
    situacaoMeta(desvioPct),
  );
}

const GRAVIDADE: Record<NivelLimite, number> = {
  normal: 0,
  atencao: 1,
  critico: 2,
};

/** O pior de vários níveis (crítico > atenção > normal). */
export function piorNivel(niveis: readonly NivelLimite[]): NivelLimite {
  return niveis.reduce<NivelLimite>(
    (pior, n) => (GRAVIDADE[n] > GRAVIDADE[pior] ? n : pior),
    'normal',
  );
}

// ---------- Filtro da visão geral e do relatório da fazenda ----------

/** Sem período informado, a visão geral olha os últimos 90 dias. */
export const PERIODO_PADRAO_DIAS = 90;

export const SITUACOES_FILTRO = ['todos', 'em_andamento', 'encerrado'] as const;
export type SituacaoFiltro = (typeof SITUACOES_FILTRO)[number];
export const NOME_SITUACAO_FILTRO: Record<SituacaoFiltro, string> = {
  todos: 'Todos os lotes',
  em_andamento: 'Em andamento',
  encerrado: 'Encerrados',
};

const camposFiltro = {
  de: dataISO.optional(),
  ate: dataISO.optional(),
  galpao: z.uuid().optional(),
  lote: z.uuid().optional(),
  situacao: z.enum(SITUACOES_FILTRO).default('todos'),
};

const periodoEmOrdem = (v: { de?: string; ate?: string }) =>
  !v.de || !v.ate || v.de <= v.ate;
const PERIODO_INVERTIDO = {
  message: 'A data inicial precisa ser antes da final',
  path: ['de'],
};

export const filtroVisaoGeralSchema = z
  .object(camposFiltro)
  .refine(periodoEmOrdem, PERIODO_INVERTIDO);
export type FiltroVisaoGeral = z.output<typeof filtroVisaoGeralSchema>;

/** Partes opcionais do relatório; os indicadores principais sempre entram. */
export const SECOES_RELATORIO = [
  'atencao',
  'mortalidade',
  'lotes',
  'custos',
] as const;
export type SecaoRelatorio = (typeof SECOES_RELATORIO)[number];
export const NOME_SECAO_RELATORIO: Record<SecaoRelatorio, string> = {
  atencao: 'Pontos de atenção',
  mortalidade: 'Mortalidade diária',
  lotes: 'Comparação dos lotes',
  custos: 'Custos por categoria',
};

/** O relatório usa o mesmo filtro da visão geral, para os números baterem. */
export const relatorioFazendaSchema = z
  .object({
    ...camposFiltro,
    formato: z.enum(FORMATOS_RELATORIO),
    secoes: z
      .string()
      .optional()
      .transform((v) =>
        v === undefined ? [...SECOES_RELATORIO] : v.split(',').filter(Boolean),
      )
      .pipe(z.array(z.enum(SECOES_RELATORIO))),
  })
  .refine(periodoEmOrdem, PERIODO_INVERTIDO);
export type FiltroRelatorioFazenda = z.output<typeof relatorioFazendaSchema>;

// ---------- Agregação da fazenda ----------

/** O que a agregação precisa de cada lote, já cortado na data final do período. */
export interface LoteParaAgregar {
  situacao: 'em_andamento' | 'encerrado' | 'cancelado';
  avesAlojadas: number | null;
  baixasAcumuladas: number;
  saldoAves: number | null;
  racaoConsumidaKg: number | null;
  pesoVivoProduzidoKg: number | null;
  iep: number | null;
  situacaoMeta: SituacaoMeta | null;
  /** Nulo quando o perfil não vê o financeiro. */
  custoTotal: number | null;
  margem: number | null;
}

const soma = (valores: readonly number[]) => valores.reduce((s, v) => s + v, 0);

/**
 * Indicadores da fazenda no período (Proposta, docs/01-mvp.md): mortalidade e
 * conversão ponderadas pelas aves e pelos quilos de cada lote, não a média das
 * porcentagens; IEP como média simples dos lotes que têm valor.
 */
export function indicadoresDaFazenda(lotes: readonly LoteParaAgregar[]) {
  const alojados = lotes.filter((l) => l.avesAlojadas !== null);
  const avesAlojadas = alojados.length
    ? soma(alojados.map((l) => l.avesAlojadas ?? 0))
    : null;
  const baixas = soma(alojados.map((l) => l.baixasAcumuladas));
  const mortalidade = alojados.length
    ? mortalidadeAcumulada(baixas, avesAlojadas)
    : indisponivel('Nenhum lote alojado no período');

  const comConversao = lotes.filter(
    (l) =>
      l.racaoConsumidaKg !== null &&
      l.pesoVivoProduzidoKg !== null &&
      l.pesoVivoProduzidoKg > 0,
  );
  const conversao = comConversao.length
    ? conversaoAlimentar(
        soma(comConversao.map((l) => l.racaoConsumidaKg ?? 0)),
        disponivel(soma(comConversao.map((l) => l.pesoVivoProduzidoKg ?? 0))),
      )
    : indisponivel('Nenhum lote com ração e pesagem');

  const ieps = lotes.flatMap((l) => (l.iep === null ? [] : [l.iep]));
  const custos = lotes.flatMap((l) =>
    l.custoTotal === null ? [] : [l.custoTotal],
  );
  const margens = lotes.flatMap((l) => (l.margem === null ? [] : [l.margem]));
  const naMeta = (s: SituacaoMeta | null) =>
    lotes.filter((l) => l.situacaoMeta === s).length;

  return {
    lotes: {
      total: lotes.length,
      emAndamento: lotes.filter((l) => l.situacao === 'em_andamento').length,
      encerrados: lotes.filter((l) => l.situacao === 'encerrado').length,
    },
    avesAlojadas,
    plantelAtual: soma(
      lotes
        .filter((l) => l.situacao === 'em_andamento')
        .map((l) => l.saldoAves ?? 0),
    ),
    baixas,
    mortalidade,
    viabilidade: viabilidade(mortalidade),
    conversaoAlimentar: conversao,
    iepMedio: ieps.length
      ? disponivel(soma(ieps) / ieps.length)
      : indisponivel('Nenhum lote com IEP'),
    meta: {
      dentro: naMeta('dentro'),
      abaixo: naMeta('abaixo'),
      acima: naMeta('acima'),
      semPesagem: naMeta(null),
    },
    custoTotal: custos.length ? soma(custos) : null,
    margem: margens.length ? soma(margens) : null,
  };
}
export type IndicadoresFazenda = ReturnType<typeof indicadoresDaFazenda>;

export interface PontoMortalidadeFazenda {
  data: string;
  baixas: number;
  /** Soma do saldo no início do dia dos lotes que lançaram baixa. */
  avesInicioDia: number;
  percentual: number;
  /** Pior nível entre os lotes, cada um pelo limite da sua idade. */
  nivel: NivelLimite;
  lotes: number;
}

/**
 * Mortalidade diária da fazenda: soma as baixas e o saldo do início do dia dos
 * lotes que lançaram baixa naquele dia (a mesma regra do lote, em que dia sem
 * lançamento fica de fora). Só os dias dentro do período.
 */
export function mortalidadeDiariaDaFazenda(
  series: readonly (readonly PontoMortalidadeDia[])[],
  de: string,
  ate: string,
): PontoMortalidadeFazenda[] {
  const porDia = new Map<string, PontoMortalidadeDia[]>();
  for (const ponto of series.flat()) {
    if (ponto.data < de || ponto.data > ate) continue;
    porDia.set(ponto.data, [...(porDia.get(ponto.data) ?? []), ponto]);
  }
  return [...porDia]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, pontos]) => {
      const baixas = soma(pontos.map((p) => p.baixas));
      const aves = soma(pontos.map((p) => p.avesInicioDia));
      return {
        data,
        baixas,
        avesInicioDia: aves,
        percentual: (baixas / aves) * 100,
        nivel: piorNivel(pontos.map((p) => p.nivel)),
        lotes: pontos.length,
      };
    });
}

/** Indicador disponível como número, ou nulo. */
export const valorDe = (i: Indicador): number | null =>
  i.disponivel ? i.valor : null;
