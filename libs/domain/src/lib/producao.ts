import { z } from 'zod';
import { diasEntre } from './zootecnicos';
import { dataISO, texto, textoOpcional } from './schemas';

// ---------- Lote (UC05) ----------

export const LINHAGENS = ['cobb500', 'ross308', 'hubbard', 'outra'] as const;
export type Linhagem = (typeof LINHAGENS)[number];
export const NOME_LINHAGEM: Record<Linhagem, string> = {
  cobb500: 'Cobb 500',
  ross308: 'Ross 308',
  hubbard: 'Hubbard',
  outra: 'Outra',
};

export const SEXAGENS = ['misto', 'macho', 'femea'] as const;
export const NOME_SEXAGEM: Record<(typeof SEXAGENS)[number], string> = {
  misto: 'Misto',
  macho: 'Macho',
  femea: 'Fêmea',
};

export const loteSchema = z.object({
  codigo: texto(1, 40),
  galpaoId: z.uuid({ error: 'Escolha o galpão' }),
  linhagem: z.enum(LINHAGENS),
  sexagem: z.enum(SEXAGENS).default('misto'),
  origem: textoOpcional(120),
  dataAlojamento: dataISO,
  idadeInicialDias: z.number().int().min(0).max(30).default(0),
  pesoPintoG: z.number().positive().max(200).optional(),
  custoPinto: z.number().min(0).max(1000).optional(),
  quantidadePrevista: z
    .number()
    .int()
    .positive('Informe a quantidade prevista')
    .max(1_000_000),
  /** O Gestor confirma que vai alojar acima da capacidade do galpão (inconsistência #3). */
  confirmarDensidade: z.boolean().optional(),
});
export type NovoLote = z.input<typeof loteSchema>;

// ---------- Alojamento (UC06) ----------

export const alojamentoSchema = z
  .object({
    data: dataISO,
    avesRecebidas: z
      .number()
      .int()
      .positive('Informe as aves recebidas')
      .max(1_000_000),
    mortasTransporte: z.number().int().min(0).default(0),
    justificativaDivergencia: textoOpcional(500),
    confirmarDensidade: z.boolean().optional(),
  })
  .refine((v) => v.mortasTransporte <= v.avesRecebidas, {
    path: ['mortasTransporte'],
    message: 'Mortas no transporte não pode passar das aves recebidas',
  });
export type NovoAlojamento = z.input<typeof alojamentoSchema>;

// ---------- Baixa diária (UC07) ----------

export const baixaSchema = z
  .object({
    data: dataISO,
    mortes: z.number().int().min(0).max(1_000_000),
    descartes: z.number().int().min(0).max(1_000_000).default(0),
    causaProvavel: textoOpcional(200),
  })
  .refine((v) => v.mortes + v.descartes > 0, {
    path: ['mortes'],
    message: 'Informe mortes ou descartes',
  });
export type NovaBaixa = z.input<typeof baixaSchema>;

/** Correção de um lançamento: o original continua no histórico (docs/05-sincronizacao.md). */
export const estornoSchema = z.object({ motivo: texto(3, 500) });

// ---------- Pesagem (UC10) ----------

export const pesagemSchema = z
  .object({
    data: dataISO,
    pesosIndividuaisG: z
      .array(z.number().positive().max(10_000))
      .max(5000)
      .optional(),
    avesPesadas: z.number().int().positive().optional(),
    pesoTotalG: z.number().positive().optional(),
    pontoColeta: textoOpcional(80),
    /** Confirma uma pesagem que fugiu muito da anterior. */
    confirmarRevisao: z.boolean().optional(),
  })
  .refine(
    (v) =>
      (v.pesosIndividuaisG?.length ?? 0) > 0 || (v.avesPesadas && v.pesoTotalG),
    {
      path: ['pesosIndividuaisG'],
      message: 'Informe os pesos individuais ou o total de aves e o peso total',
    },
  );
export type NovaPesagem = z.input<typeof pesagemSchema>;

// ---------- Ocorrência sanitária (UC08) ----------

export const TIPOS_OCORRENCIA = [
  'doenca',
  'vacinacao',
  'medicacao',
  'anomalia',
  'inspecao',
] as const;
export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];
export const NOME_TIPO_OCORRENCIA: Record<TipoOcorrencia, string> = {
  doenca: 'Doença',
  vacinacao: 'Vacinação',
  medicacao: 'Medicação',
  anomalia: 'Anomalia',
  inspecao: 'Inspeção',
};

export const VIAS = [
  'agua',
  'racao',
  'spray',
  'ocular',
  'injetavel',
  'outra',
] as const;
export const NOME_VIA: Record<(typeof VIAS)[number], string> = {
  agua: 'Água de bebida',
  racao: 'Ração',
  spray: 'Spray',
  ocular: 'Ocular',
  injetavel: 'Injetável',
  outra: 'Outra',
};

export const ocorrenciaSchema = z
  .object({
    data: dataISO,
    tipo: z.enum(TIPOS_OCORRENCIA),
    descricao: texto(3, 2000),
    produto: textoOpcional(120),
    dose: textoOpcional(60),
    via: z.enum(VIAS).optional(),
    loteProduto: textoOpcional(60),
    carenciaDias: z.number().int().min(0).max(365).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tipo !== 'vacinacao' && v.tipo !== 'medicacao') return;
    const exigidos = [
      'produto',
      'dose',
      'via',
      'loteProduto',
      'carenciaDias',
    ] as const;
    for (const campo of exigidos) {
      if (v[campo] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [campo],
          message: 'Obrigatório para vacinação e medicação',
        });
      }
    }
  });
export type NovaOcorrencia = z.input<typeof ocorrenciaSchema>;

// ---------- Ração ----------

export const TIPOS_MOVIMENTO_RACAO = ['entrada', 'estoque_restante'] as const;

export const movimentoRacaoSchema = z
  .object({
    data: dataISO,
    tipo: z.enum(TIPOS_MOVIMENTO_RACAO),
    quantidadeKg: z.number().min(0).max(10_000_000),
    fornecedor: textoOpcional(120),
    notaFiscal: textoOpcional(60),
    /** Valor da entrega (R$): gera a despesa de ração do lote junto (UC12). */
    valorTotal: z.number().positive().max(100_000_000).optional(),
  })
  .refine((v) => v.tipo === 'entrada' || v.valorTotal === undefined, {
    path: ['valorTotal'],
    message: 'Valor só se aplica a entregas de ração',
  });
export type NovoMovimentoRacao = z.input<typeof movimentoRacaoSchema>;

// ---------- Regras ----------

/** Fim da carência = data da ocorrência + dias de carência (UC08). */
export function dataFimCarencia(data: string, carenciaDias: number): string {
  const fim = new Date(`${data}T00:00:00Z`);
  fim.setUTCDate(fim.getUTCDate() + carenciaDias);
  return fim.toISOString().slice(0, 10);
}

export type NivelAlerta = 'normal' | 'atencao' | 'critico';

/**
 * Mortalidade do dia contra os limites provisórios do doc 06: 0,3% (atenção) e
 * 0,5% (crítico), em dobro na primeira semana. Suposição a validar com o veterinário.
 */
export function avaliarMortalidadeDia(
  percentualDia: number,
  idadeDias: number,
): NivelAlerta {
  const fator = idadeDias <= 7 ? 2 : 1;
  if (percentualDia >= 0.5 * fator) return 'critico';
  if (percentualDia >= 0.3 * fator) return 'atencao';
  return 'normal';
}

/** GPD acima disso entre duas pesagens é improvável em frango de corte. */
export const GPD_MAXIMO_PLAUSIVEL_G = 120;

/**
 * UC10: pede revisão quando a pesagem foge muito da anterior. Proposta: peso
 * menor que o anterior ou ganho diário acima do plausível.
 */
export function motivoRevisaoPesagem(
  anterior: { data: string; pesoMedioG: number } | null,
  atual: { data: string; pesoMedioG: number },
): string | null {
  if (!anterior) return null;
  const dias = diasEntre(anterior.data, atual.data);
  if (dias <= 0) return null;
  if (atual.pesoMedioG < anterior.pesoMedioG) {
    return `O peso médio (${Math.round(atual.pesoMedioG)} g) ficou abaixo da pesagem anterior (${Math.round(anterior.pesoMedioG)} g)`;
  }
  const gpd = (atual.pesoMedioG - anterior.pesoMedioG) / dias;
  if (gpd > GPD_MAXIMO_PLAUSIVEL_G) {
    return `O ganho desde a pesagem anterior (${Math.round(gpd)} g/dia) está acima do plausível`;
  }
  return null;
}

/** Ração consumida = entradas − estoque restante informado por último. */
export function racaoConsumidaKg(
  movimentos: readonly {
    data: string;
    tipo: (typeof TIPOS_MOVIMENTO_RACAO)[number];
    quantidadeKg: number;
  }[],
): number | null {
  const entradas = movimentos.filter((m) => m.tipo === 'entrada');
  if (entradas.length === 0) return null;
  const total = entradas.reduce((s, m) => s + m.quantidadeKg, 0);
  const estoques = movimentos
    .filter((m) => m.tipo === 'estoque_restante')
    .sort((a, b) => a.data.localeCompare(b.data));
  const restante = estoques.at(-1)?.quantidadeKg ?? 0;
  return Math.max(total - restante, 0);
}
