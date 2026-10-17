import { z } from 'zod';
import { dataISO, texto, textoOpcional } from './schemas';

// ---------- Equipamentos (UC18) ----------

export const TIPOS_EQUIPAMENTO = [
  'comedouro',
  'bebedouro',
  'ventilacao',
  'aquecimento',
  'nebulizacao',
  'iluminacao',
  'gerador',
  'outro',
] as const;
export type TipoEquipamento = (typeof TIPOS_EQUIPAMENTO)[number];
export const NOME_TIPO_EQUIPAMENTO: Record<TipoEquipamento, string> = {
  comedouro: 'Comedouro',
  bebedouro: 'Bebedouro',
  ventilacao: 'Ventilação / exaustão',
  aquecimento: 'Aquecimento',
  nebulizacao: 'Nebulização / resfriamento',
  iluminacao: 'Iluminação',
  gerador: 'Gerador',
  outro: 'Outro',
};

export const SITUACOES_EQUIPAMENTO = ['ativo', 'inativo'] as const;
export type SituacaoEquipamento = (typeof SITUACOES_EQUIPAMENTO)[number];

export const equipamentoSchema = z.object({
  nome: texto(2, 80),
  tipo: z.enum(TIPOS_EQUIPAMENTO),
  /** Sem galpão: equipamento da fazenda inteira (inconsistência #4). */
  galpaoId: z.uuid().optional(),
  /** Único na fazenda quando informado. */
  numeroSerie: textoOpcional(60),
  fabricante: textoOpcional(80),
  modelo: textoOpcional(80),
  /** Parada de equipamento crítico abre alerta (UC16). */
  critico: z.boolean().default(false),
  /** Intervalo da manutenção preventiva. Sem ele, não há previsão. */
  periodicidadeDias: z
    .number()
    .int('Use um número inteiro de dias')
    .positive('A periodicidade precisa ser maior que zero')
    .max(3650)
    .optional(),
  /** Opcional; as regras que dependem dela só valem quando existir (inconsistência #2). */
  dataAquisicao: dataISO.optional(),
});
export type NovoEquipamento = z.input<typeof equipamentoSchema>;

/** A edição manda o cadastro inteiro: campo opcional ausente fica vazio. */
export const edicaoEquipamentoSchema = equipamentoSchema.extend({
  situacao: z.enum(SITUACOES_EQUIPAMENTO).default('ativo'),
});
export type EdicaoEquipamento = z.input<typeof edicaoEquipamentoSchema>;

// ---------- Manutenção (UC19) ----------

export const TIPOS_MANUTENCAO = ['preventiva', 'corretiva'] as const;
export type TipoManutencao = (typeof TIPOS_MANUTENCAO)[number];
export const NOME_TIPO_MANUTENCAO: Record<TipoManutencao, string> = {
  preventiva: 'Preventiva',
  corretiva: 'Corretiva',
};

/** Data e hora com fuso (ISO 8601), como o navegador manda. */
const dataHora = z.iso.datetime({
  offset: true,
  error: 'Data e hora inválidas',
});
const custo = z
  .number()
  .min(0, 'O custo não pode ser negativo')
  .max(10_000_000)
  .default(0);

export const manutencaoSchema = z
  .object({
    tipo: z.enum(TIPOS_MANUTENCAO),
    data: dataISO,
    descricao: texto(3, 500),
    custoPecas: custo,
    custoMaoObra: custo,
    fornecedor: textoOpcional(120),
    ordemServico: textoOpcional(60),
    /** Início da parada do equipamento. Sem retorno, ele segue parado. */
    paradaInicio: dataHora.optional(),
    retornoOperacao: dataHora.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.retornoOperacao && !v.paradaInicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['paradaInicio'],
        message: 'Informe quando o equipamento parou',
      });
    }
    const erro = erroRetorno(v.paradaInicio, v.retornoOperacao);
    if (erro) {
      ctx.addIssue({
        code: 'custom',
        path: ['retornoOperacao'],
        message: erro,
      });
    }
  });
export type NovaManutencao = z.input<typeof manutencaoSchema>;

/** Registra a volta à operação de uma parada que ficou aberta. */
export const retornoOperacaoSchema = z.object({ retornoOperacao: dataHora });

/** O retorno não pode ser antes da parada. */
export function erroRetorno(
  paradaInicio: string | undefined,
  retornoOperacao: string | undefined,
): string | null {
  if (!paradaInicio || !retornoOperacao) return null;
  return Date.parse(retornoOperacao) < Date.parse(paradaInicio)
    ? 'O retorno não pode ser antes da parada'
    : null;
}

/** Custo da manutenção em reais, somado em centavos. */
export function custoManutencao(custoPecas: number, custoMaoObra: number) {
  return (Math.round(custoPecas * 100) + Math.round(custoMaoObra * 100)) / 100;
}

/**
 * Manutenção não pode ser antes da aquisição do equipamento. Sem data de
 * aquisição, a regra não se aplica (inconsistência #2).
 */
export function antesDaAquisicao(
  data: string,
  dataAquisicao: string | null | undefined,
): boolean {
  return !!dataAquisicao && data < dataAquisicao;
}

/** Horas paradas entre o início da parada e o retorno (ou agora). */
export function horasParado(inicio: Date, fim: Date): number {
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 36e5));
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Data prevista da próxima preventiva: a última preventiva mais a
 * periodicidade. Antes da primeira, conta da data de aquisição; sem
 * nenhuma das duas, não há previsão (inconsistência #2).
 */
export function proximaPreventiva(
  periodicidadeDias: number | null | undefined,
  ultimaPreventiva: string | null | undefined,
  dataAquisicao: string | null | undefined,
): string | null {
  const base = ultimaPreventiva ?? dataAquisicao;
  if (!periodicidadeDias || !base) return null;
  return somarDias(base, periodicidadeDias);
}

/** A preventiva "vence logo" nos últimos dias antes da data prevista. */
export const AVISO_PREVENTIVA_DIAS = 7;

export type SituacaoPreventiva =
  'sem_previsao' | 'em_dia' | 'vence_logo' | 'vencida';

export function situacaoPreventiva(
  proxima: string | null,
  hoje: string,
): SituacaoPreventiva {
  if (!proxima) return 'sem_previsao';
  if (proxima < hoje) return 'vencida';
  if (proxima <= somarDias(hoje, AVISO_PREVENTIVA_DIAS)) return 'vence_logo';
  return 'em_dia';
}

export const NOME_SITUACAO_PREVENTIVA: Record<SituacaoPreventiva, string> = {
  sem_previsao: 'Sem previsão',
  em_dia: 'Em dia',
  vence_logo: 'Vence em breve',
  vencida: 'Vencida',
};
