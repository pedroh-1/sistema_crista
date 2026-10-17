import { z } from 'zod';
import { Perfil } from './permissoes';
import { dataISO, texto, textoOpcional } from './schemas';
import { idadeDias } from './zootecnicos';

// ---------- Alertas de desvio (UC16) ----------

/**
 * Indicadores monitorados. Os de sensores e equipamentos (inconsistência #8)
 * já existem no modelo, mas só são avaliados nas Fases 6 e 7.
 */
export const INDICADORES_ALERTA = [
  'mortalidade_dia',
  'desvio_peso',
  'uniformidade',
  'temperatura',
  'umidade',
  'amonia',
  'energia',
  'equipamento_parado',
  'falta_sinal',
] as const;
export type IndicadorAlerta = (typeof INDICADORES_ALERTA)[number];

/** Indicadores avaliados hoje a partir dos lançamentos do lote. */
export const INDICADORES_DO_LOTE = [
  'mortalidade_dia',
  'desvio_peso',
  'uniformidade',
] as const;
export type IndicadorDoLote = (typeof INDICADORES_DO_LOTE)[number];

export type Criticidade = 'atencao' | 'critico';
export type NivelLimite = 'normal' | Criticidade;

export interface Limites {
  atencao: number;
  critico: number;
}

/**
 * Como cada indicador do lote é avaliado. `acima`: piora quando sobe.
 * Os limites padrão são provisórios (doc 06) até a equipe validar com o veterinário.
 */
export const CONFIG_INDICADOR: Record<
  IndicadorDoLote,
  {
    nome: string;
    unidade: string;
    direcao: 'acima' | 'abaixo';
    padrao: Limites;
  }
> = {
  mortalidade_dia: {
    nome: 'Mortalidade do dia',
    unidade: '%',
    direcao: 'acima',
    padrao: { atencao: 0.3, critico: 0.5 },
  },
  desvio_peso: {
    nome: 'Peso × curva',
    unidade: '%',
    direcao: 'abaixo',
    padrao: { atencao: -5, critico: -10 },
  },
  uniformidade: {
    nome: 'Uniformidade',
    unidade: '%',
    direcao: 'abaixo',
    padrao: { atencao: 80, critico: 70 },
  },
};

export const NOME_INDICADOR_ALERTA: Record<IndicadorAlerta, string> = {
  mortalidade_dia: 'Mortalidade do dia',
  desvio_peso: 'Peso × curva',
  uniformidade: 'Uniformidade',
  temperatura: 'Temperatura',
  umidade: 'Umidade',
  amonia: 'Amônia',
  energia: 'Energia',
  equipamento_parado: 'Equipamento crítico parado',
  falta_sinal: 'Sensor sem sinal',
};

/**
 * Quem recebe o alerta crítico. O de equipamento vai ao Produtor, responsável
 * pelos equipamentos (doc 02), em vez do Veterinário.
 */
export function perfisNotificados(
  indicador: IndicadorAlerta,
): readonly Perfil[] {
  return indicador === 'equipamento_parado'
    ? ['gestor', 'produtor']
    : ['gestor', 'veterinario'];
}

/** Compara o valor com os limites, respeitando o sentido do indicador. */
export function avaliarLimite(
  valor: number,
  limites: Limites,
  direcao: 'acima' | 'abaixo',
): NivelLimite {
  const passou = (limite: number) =>
    direcao === 'acima' ? valor >= limite : valor <= limite;
  if (passou(limites.critico)) return 'critico';
  if (passou(limites.atencao)) return 'atencao';
  return 'normal';
}

/**
 * Limites padrão da mortalidade do dia são dobrados na primeira semana, como no
 * aviso da Fase 2. Limites configurados pela fazenda valem como estão.
 */
export function limitesEfetivos(
  indicador: IndicadorDoLote,
  configurado: Limites | null,
  idadeDias: number,
): Limites {
  if (configurado) return configurado;
  const padrao = CONFIG_INDICADOR[indicador].padrao;
  if (indicador === 'mortalidade_dia' && idadeDias <= 7)
    return { atencao: padrao.atencao * 2, critico: padrao.critico * 2 };
  return padrao;
}

export interface PontoMortalidadeDia {
  data: string;
  idadeDias: number;
  /** Mortes + descartes do dia. */
  baixas: number;
  percentual: number;
  /** Limites que valiam naquela idade (o padrão dobra na primeira semana). */
  limites: Limites;
  nivel: NivelLimite;
}

/**
 * Mortalidade de cada dia com baixa lançada, sobre o saldo do início do dia
 * (alojadas − baixas e cargas dos dias anteriores), como no resumo do lote.
 * Dias sem lançamento não entram, porque não dá para saber se foram zero.
 */
export function serieMortalidadeDia(
  lote: {
    dataAlojamento: string;
    idadeInicialDias: number;
    avesAlojadas: number;
    baixas: readonly { data: string; mortes: number; descartes: number }[];
    cargas?: readonly { data: string; aves: number }[];
  },
  configurado: Limites | null,
): PontoMortalidadeDia[] {
  const porDia = new Map<string, number>();
  for (const b of lote.baixas)
    porDia.set(b.data, (porDia.get(b.data) ?? 0) + b.mortes + b.descartes);

  const pontos: PontoMortalidadeDia[] = [];
  let baixasAntes = 0;
  for (const [data, baixas] of [...porDia].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const saidasAntes = (lote.cargas ?? [])
      .filter((c) => c.data < data)
      .reduce((s, c) => s + c.aves, 0);
    const saldoInicioDia = lote.avesAlojadas - baixasAntes - saidasAntes;
    baixasAntes += baixas;
    if (saldoInicioDia <= 0) continue;
    const idade = idadeDias(lote.dataAlojamento, data, lote.idadeInicialDias);
    const percentual = (baixas / saldoInicioDia) * 100;
    const limites = limitesEfetivos('mortalidade_dia', configurado, idade);
    pontos.push({
      data,
      idadeDias: idade,
      baixas,
      percentual,
      limites,
      nivel: avaliarLimite(percentual, limites, 'acima'),
    });
  }
  return pontos;
}

export const regraAlertaSchema = z
  .object({
    indicador: z.enum(INDICADORES_DO_LOTE),
    limiteAtencao: z.number().min(-100).max(100),
    limiteCritico: z.number().min(-100).max(100),
  })
  .superRefine((v, ctx) => {
    const { direcao } = CONFIG_INDICADOR[v.indicador];
    const ordem =
      direcao === 'acima'
        ? v.limiteCritico > v.limiteAtencao
        : v.limiteCritico < v.limiteAtencao;
    if (!ordem) {
      ctx.addIssue({
        code: 'custom',
        path: ['limiteCritico'],
        message:
          direcao === 'acima'
            ? 'O limite crítico precisa ser maior que o de atenção'
            : 'O limite crítico precisa ser menor que o de atenção',
      });
    }
  });
export type NovaRegraAlerta = z.input<typeof regraAlertaSchema>;

/** UC16: fechar o alerta exige a providência adotada. */
export const fecharAlertaSchema = z.object({ providencia: texto(5, 1000) });

// ---------- Saída e encerramento (UC17) ----------

export const cargaSchema = z.object({
  data: dataISO,
  aves: z.number().int().positive('Informe as aves da carga').max(1_000_000),
  pesoTotalKg: z.number().positive('Informe o peso da carga').max(10_000_000),
  precoKg: z.number().positive().max(1000).optional(),
  destino: textoOpcional(120),
  /** Guia de Trânsito Animal */
  numeroGta: textoOpcional(40),
});
export type NovaCarga = z.input<typeof cargaSchema>;

export const encerramentoSchema = z.object({
  data: dataISO,
  /** Encerra mesmo com pendências: o relatório sai como parcial. */
  confirmarParcial: z.boolean().optional(),
});

export const FORMATOS_RELATORIO = ['pdf', 'xlsx'] as const;
