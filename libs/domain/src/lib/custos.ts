import { z } from 'zod';
import { dataISO, texto, textoOpcional } from './schemas';

// ---------- Curva de referência (UC11, doc 06) ----------

export interface PontoCurva {
  idadeDias: number;
  pesoG: number;
  consumoAcumG: number | null;
}

/** Valor da curva na idade, com interpolação linear entre os dias tabelados. */
export function valorNaCurva(
  curva: readonly PontoCurva[],
  idade: number,
  campo: 'pesoG' | 'consumoAcumG' = 'pesoG',
): number | null {
  const pontos = curva
    .filter((p) => p[campo] !== null)
    .sort((a, b) => a.idadeDias - b.idadeDias);
  if (pontos.length === 0) return null;
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  if (idade < primeiro.idadeDias || idade > ultimo.idadeDias) return null;
  const depois = pontos.findIndex((p) => p.idadeDias >= idade);
  const b = pontos[depois];
  if (b.idadeDias === idade) return b[campo];
  const a = pontos[depois - 1];
  const fracao = (idade - a.idadeDias) / (b.idadeDias - a.idadeDias);
  return (
    (a[campo] as number) +
    fracao * ((b[campo] as number) - (a[campo] as number))
  );
}

/** Faixa "dentro da meta" do desvio da curva: ±5% (proposta, doc 03). */
export const FAIXA_META_PCT = 5;
export type SituacaoMeta = 'abaixo' | 'dentro' | 'acima';

export function situacaoMeta(desvioPct: number): SituacaoMeta {
  if (desvioPct < -FAIXA_META_PCT) return 'abaixo';
  if (desvioPct > FAIXA_META_PCT) return 'acima';
  return 'dentro';
}

// ---------- Despesas (UC12) ----------

export const CATEGORIAS_DESPESA = [
  'racao',
  'medicamentos',
  'energia',
  'gas',
  'mao_de_obra',
  'cama',
  'manutencao',
  'transporte',
  'outros',
] as const;
export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number];
export const NOME_CATEGORIA: Record<CategoriaDespesa, string> = {
  racao: 'Ração',
  medicamentos: 'Medicamentos',
  energia: 'Energia',
  gas: 'Gás',
  mao_de_obra: 'Mão de obra',
  cama: 'Cama',
  manutencao: 'Manutenção',
  transporte: 'Transporte',
  outros: 'Outros',
};

/** O custo dos pintos não é lançado como despesa: vem do cadastro do lote. */
export const CATEGORIA_PINTOS = 'pintos';

export const CRITERIOS_RATEIO = [
  'aves_alojadas',
  'consumo_racao',
  'percentual',
] as const;
export type CriterioRateio = (typeof CRITERIOS_RATEIO)[number];
export const NOME_CRITERIO: Record<CriterioRateio, string> = {
  aves_alojadas: 'Proporcional às aves alojadas',
  consumo_racao: 'Proporcional ao consumo de ração',
  percentual: 'Percentual informado',
};

export const despesaSchema = z
  .object({
    data: dataISO,
    categoria: z.enum(CATEGORIAS_DESPESA),
    descricao: texto(2, 200),
    valor: z.number().positive('Informe o valor').max(100_000_000),
    fornecedor: textoOpcional(120),
    numeroNota: textoOpcional(60),
    /** Lotes que recebem a despesa. Vazio = despesa da fazenda, fora dos lotes. */
    lotes: z.array(z.uuid()).max(50).default([]),
    criterioRateio: z.enum(CRITERIOS_RATEIO).default('aves_alojadas'),
    /** Só no critério percentual: percentual de cada lote, na ordem de `lotes`. */
    percentuais: z.array(z.number().positive().max(100)).optional(),
    /** Confirma uma despesa com a mesma nota e fornecedor de outra já lançada. */
    confirmarDuplicidade: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.criterioRateio !== 'percentual' || v.lotes.length < 2) return;
    if (v.percentuais?.length !== v.lotes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['percentuais'],
        message: 'Informe o percentual de cada lote',
      });
      return;
    }
    const soma = v.percentuais.reduce((s, p) => s + p, 0);
    if (Math.abs(soma - 100) > 0.001) {
      ctx.addIssue({
        code: 'custom',
        path: ['percentuais'],
        message: `Os percentuais somam ${soma}%, e não 100%`,
      });
    }
  });
export type NovaDespesa = z.input<typeof despesaSchema>;

/** Preço de venda de referência do lote (R$/kg vivo), base da receita prevista (UC14). */
export const precoReferenciaSchema = z.object({
  precoReferenciaKg: z.number().positive().max(1000).nullable(),
});

// ---------- Painel (UC15) ----------

export const MAXIMO_LOTES_COMPARACAO = 4;

export const filtroPainelSchema = z
  .object({
    lotes: z
      .string()
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(
        z
          .array(z.uuid())
          .min(1, 'Escolha ao menos um lote')
          .max(MAXIMO_LOTES_COMPARACAO, 'Compare no máximo 4 lotes'),
      ),
    /** Período por idade (dias) ou por data; sem nada, até hoje. */
    idadeDe: z.coerce.number().int().min(0).optional(),
    idadeAte: z.coerce.number().int().min(0).optional(),
    de: dataISO.optional(),
    ate: dataISO.optional(),
  })
  .refine(
    (v) =>
      !(
        (v.idadeDe !== undefined || v.idadeAte !== undefined) &&
        (v.de || v.ate)
      ),
    {
      message: 'Filtre por idade ou por data, não pelos dois',
      path: ['de'],
    },
  );
export type FiltroPainel = z.output<typeof filtroPainelSchema>;
