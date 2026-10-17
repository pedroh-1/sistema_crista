import {
  avaliarLimite,
  avesAlojadas,
  conversaoAlimentar,
  dataFimCarencia,
  densidadeKgM2,
  disponivel,
  gpdMedio,
  idadeDias,
  iep,
  Indicador,
  IndicadorDoLote,
  indisponivel,
  Limites,
  limitesEfetivos,
  mortalidadeAcumulada,
  NivelAlerta,
  pesoMedioAmostra,
  pesoVivoEmEstoqueKg,
  pesoVivoProduzidoKg,
  racaoConsumidaKg,
  saldoAves,
  uniformidade,
  viabilidade,
} from '@crista/domain';

/** Dados do lote já filtrados: só eventos válidos e não estornados. */
export interface EntradaResumo {
  hoje: string;
  dataAlojamento: string;
  idadeInicialDias: number;
  pesoPintoG: number | null;
  areaUtilM2: number;
  /** Limites dos alertas que a fazenda configurou; sem eles, valem os padrão. */
  limites?: Partial<Record<IndicadorDoLote, Limites>>;
  alojamento: { avesRecebidas: number; mortasTransporte: number } | null;
  baixas: { data: string; mortes: number; descartes: number }[];
  pesagens: {
    data: string;
    avesPesadas: number;
    pesoTotalG: number;
    pesos: number[];
  }[];
  movimentosRacao: {
    data: string;
    tipo: 'entrada' | 'estoque_restante';
    quantidadeKg: number;
  }[];
  ocorrencias: { data: string; carenciaDias: number | null }[];
  /** Cargas de saída (UC17). */
  cargas?: {
    data: string;
    aves: number;
    pesoTotalKg: number;
    precoKg: number | null;
  }[];
}

const SEM_ALOJAMENTO = indisponivel('Alojamento não registrado');

/** Indicadores do lote no dia (docs/03-indicadores.md). O painel completo vem na Fase 4. */
export function resumoDoLote(e: EntradaResumo) {
  const idade = idadeDias(e.dataAlojamento, e.hoje, e.idadeInicialDias);
  const alojadas = e.alojamento
    ? avesAlojadas(e.alojamento.avesRecebidas, e.alojamento.mortasTransporte)
    : null;
  const baixasAcumuladas = e.baixas.reduce(
    (s, b) => s + b.mortes + b.descartes,
    0,
  );
  const cargas = e.cargas ?? [];
  const avesSaidas = cargas.reduce((s, c) => s + c.aves, 0);
  const pesoEntregueKg = cargas.reduce((s, c) => s + c.pesoTotalKg, 0);
  const saldo =
    alojadas === null
      ? null
      : saldoAves(alojadas, baixasAcumuladas, avesSaidas);

  const mortalidade = mortalidadeAcumulada(baixasAcumuladas, alojadas);
  const viab = viabilidade(mortalidade);

  // Última pesagem: o peso médio vale para a data em que foi medido.
  const ultima = [...e.pesagens]
    .sort((a, b) => a.data.localeCompare(b.data))
    .at(-1);
  const pesoMedio = ultima
    ? pesoMedioAmostra(ultima.pesoTotalG, ultima.avesPesadas)
    : indisponivel('Sem pesagem');
  const pesoMedioG = pesoMedio.disponivel ? pesoMedio.valor : null;
  const idadePesagem = ultima
    ? idadeDias(e.dataAlojamento, ultima.data, e.idadeInicialDias)
    : idade;

  const pesoEstoque =
    saldo === null
      ? SEM_ALOJAMENTO
      : saldo === 0
        ? disponivel(0)
        : pesoVivoEmEstoqueKg(saldo, pesoMedioG);
  const pesoProduzido = pesoVivoProduzidoKg(pesoEstoque, pesoEntregueKg);
  const unif = ultima
    ? uniformidade(ultima.pesos)
    : indisponivel('Sem pesagem');
  const ca = conversaoAlimentar(
    racaoConsumidaKg(e.movimentosRacao),
    pesoProduzido,
  );

  return {
    idadeDias: idade,
    avesAlojadas: alojadas,
    baixasAcumuladas,
    saldoAves: saldo,
    avesSaidas,
    pesoEntregueKg,
    pesoVivoProduzidoKg: pesoProduzido,
    mortalidade,
    viabilidade: viab,
    mortalidadeHoje: mortalidadeDoDia(e, alojadas, idade),
    ultimaPesagem: ultima?.data ?? null,
    pesoMedioG: pesoMedio,
    uniformidade: unif,
    uniformidadeNivel: unif.disponivel
      ? avaliarLimite(
          unif.valor,
          limitesEfetivos('uniformidade', limiteDe(e, 'uniformidade'), idade),
          'abaixo',
        )
      : null,
    gpdMedioG: gpdMedio(pesoMedioG, e.pesoPintoG, idadePesagem),
    pesoVivoEstoqueKg: pesoEstoque,
    racaoConsumidaKg: racaoOuIndisponivel(racaoConsumidaKg(e.movimentosRacao)),
    conversaoAlimentar: ca,
    iep: iep(viab, pesoMedioG, idadePesagem, ca),
    densidadeKgM2: densidadeKgM2(pesoEstoque, e.areaUtilM2),
    carenciaAte: carenciaVigenteAte(e.ocorrencias, e.hoje),
  };
}

function mortalidadeDoDia(
  e: EntradaResumo,
  alojadas: number | null,
  idade: number,
): { percentual: Indicador; nivel: NivelAlerta | null } {
  if (alojadas === null) return { percentual: SEM_ALOJAMENTO, nivel: null };
  const doDia = e.baixas
    .filter((b) => b.data === e.hoje)
    .reduce((s, b) => s + b.mortes + b.descartes, 0);
  const antes = e.baixas
    .filter((b) => b.data < e.hoje)
    .reduce((s, b) => s + b.mortes + b.descartes, 0);
  const saidasAntes = (e.cargas ?? [])
    .filter((c) => c.data < e.hoje)
    .reduce((s, c) => s + c.aves, 0);
  const saldoInicioDia = alojadas - antes - saidasAntes;
  if (saldoInicioDia <= 0)
    return { percentual: indisponivel('Sem aves no lote'), nivel: null };
  const percentual = (doDia / saldoInicioDia) * 100;
  const limites = limitesEfetivos(
    'mortalidade_dia',
    limiteDe(e, 'mortalidade_dia'),
    idade,
  );
  return {
    percentual: disponivel(percentual),
    nivel: avaliarLimite(percentual, limites, 'acima'),
  };
}

/** Limite configurado pela fazenda para o indicador, ou nulo (vale o padrão). */
export const limiteDe = (
  e: Pick<EntradaResumo, 'limites'>,
  indicador: IndicadorDoLote,
): Limites | null => e.limites?.[indicador] ?? null;

const racaoOuIndisponivel = (kg: number | null): Indicador =>
  kg === null ? indisponivel('Sem registro de ração') : disponivel(kg);

/** Maior data de fim de carência ainda vigente (UC08/UC09), ou nulo. */
export function carenciaVigenteAte(
  ocorrencias: EntradaResumo['ocorrencias'],
  hoje: string,
): string | null {
  const fins = ocorrencias
    .filter((o) => o.carenciaDias !== null)
    .map((o) => dataFimCarencia(o.data, o.carenciaDias ?? 0))
    .filter((fim) => fim >= hoje)
    .sort();
  return fins.at(-1) ?? null;
}
