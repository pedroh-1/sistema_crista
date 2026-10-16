import {
  avesAlojadas,
  CATEGORIA_PINTOS,
  CategoriaDespesa,
  custoPintos,
  custoPorAveAlojada,
  custoPorKg,
  desvioCurva,
  disponivel,
  gpdPeriodo,
  idadeDias,
  Indicador,
  indisponivel,
  margem,
  margemPercentual,
  PontoCurva,
  receitaPrevista,
  SituacaoMeta,
  situacaoMeta,
  valorNaCurva,
} from '@crista/domain';
import { DadosDoLote } from './dados-lote';
import { numOuNulo } from './lote-contexto';
import { resumoDoLote } from './resumo';

const ordenadas = (pesagens: DadosDoLote['entrada']['pesagens']) =>
  [...pesagens].sort((a, b) => a.data.localeCompare(b.data));

/** UC13: peso da última pesagem contra a curva da linhagem na mesma idade. */
export function metaDoLote(dados: DadosDoLote) {
  const e = dados.entrada;
  const ultima = ordenadas(e.pesagens).at(-1);
  const semCurva =
    dados.curva.length === 0 ? 'Linhagem sem curva de referência' : null;
  if (!ultima) {
    return {
      idadeDias: null,
      pesoPadraoG: null,
      desvioCurva: indisponivel('Sem pesagem'),
      situacao: null,
      caPadrao: indisponivel(semCurva ?? 'Sem pesagem'),
      fonteCurva: dados.fonteCurva,
    };
  }
  const idade = idadeDias(e.dataAlojamento, ultima.data, e.idadeInicialDias);
  const pesoPadraoG = valorNaCurva(dados.curva, idade);
  const desvio = desvioCurva(
    ultima.pesoTotalG / ultima.avesPesadas,
    pesoPadraoG,
  );
  const consumoPadrao = valorNaCurva(dados.curva, idade, 'consumoAcumG');
  return {
    idadeDias: idade,
    pesoPadraoG,
    desvioCurva: desvio,
    situacao: desvio.disponivel ? situacaoMeta(desvio.valor) : null,
    caPadrao:
      consumoPadrao && pesoPadraoG
        ? disponivel(consumoPadrao / pesoPadraoG)
        : indisponivel(semCurva ?? 'Curva sem consumo nesta idade'),
    fonteCurva: dados.fonteCurva,
  };
}

export interface PontoPesagem {
  data: string;
  idadeDias: number;
  pesoMedioG: number;
  pesoPadraoG: number | null;
  desvioPct: number | null;
  situacao: SituacaoMeta | null;
  gpdPeriodoG: number | null;
}

/** UC11: evolução do peso médio contra a curva padrão. */
export function serieDePeso(dados: DadosDoLote): PontoPesagem[] {
  const e = dados.entrada;
  let anterior: { data: string; peso: number } | null = null;
  return ordenadas(e.pesagens).map((p) => {
    const idade = idadeDias(e.dataAlojamento, p.data, e.idadeInicialDias);
    const peso = p.pesoTotalG / p.avesPesadas;
    const padrao = valorNaCurva(dados.curva, idade);
    const desvio = desvioCurva(peso, padrao);
    const dias = anterior ? idadeDias(anterior.data, p.data) : 0;
    const gpd = anterior
      ? gpdPeriodo(anterior.peso, peso, dias)
      : indisponivel('Primeira pesagem');
    anterior = { data: p.data, peso };
    return {
      data: p.data,
      idadeDias: idade,
      pesoMedioG: peso,
      pesoPadraoG: padrao,
      desvioPct: desvio.disponivel ? desvio.valor : null,
      situacao: desvio.disponivel ? situacaoMeta(desvio.valor) : null,
      gpdPeriodoG: gpd.disponivel ? gpd.valor : null,
    };
  });
}

/** Curva padrão do alojamento até a idade pedida (para o gráfico). */
export function curvaAte(curva: readonly PontoCurva[], idadeMaxima: number) {
  return curva
    .filter((p) => p.idadeDias <= idadeMaxima)
    .map((p) => ({ idadeDias: p.idadeDias, pesoG: p.pesoG }));
}

/** Mortalidade acumulada (%) dia a dia, do alojamento até a data de corte (UC15). */
export function serieDeMortalidade(dados: DadosDoLote) {
  const e = dados.entrada;
  if (!e.alojamento) return [];
  const alojadas = avesAlojadas(
    e.alojamento.avesRecebidas,
    e.alojamento.mortasTransporte,
  );
  const porDia = new Map<string, number>();
  for (const b of e.baixas)
    porDia.set(b.data, (porDia.get(b.data) ?? 0) + b.mortes + b.descartes);
  let acumulado = 0;
  return [...porDia.keys()].sort().map((data) => {
    acumulado += porDia.get(data) ?? 0;
    return {
      data,
      idadeDias: idadeDias(e.dataAlojamento, data, e.idadeInicialDias),
      mortalidadePct: (acumulado / alojadas) * 100,
    };
  });
}

/** UC14: custos, receita e margem do lote. */
export function financeiroDoLote(dados: DadosDoLote) {
  const e = dados.entrada;
  const resumo = resumoDoLote(e);
  const precoKg = numOuNulo(dados.lote.precoReferenciaKg);
  const custoPinto = numOuNulo(dados.lote.custoPinto);
  const pintos =
    e.alojamento && custoPinto !== null
      ? custoPintos(e.alojamento.avesRecebidas, custoPinto)
      : 0;

  const porCategoria = new Map<
    CategoriaDespesa | typeof CATEGORIA_PINTOS,
    number
  >();
  if (pintos > 0) porCategoria.set(CATEGORIA_PINTOS, pintos);
  for (const p of dados.parcelas)
    porCategoria.set(
      p.categoria,
      (porCategoria.get(p.categoria) ?? 0) + p.valor,
    );
  const total = [...porCategoria.values()].reduce((s, v) => s + v, 0);

  const pesoProduzido: Indicador = resumo.pesoVivoEstoqueKg;
  const receita = receitaPrevista(resumo.pesoVivoEstoqueKg, precoKg);
  return {
    custoPintos: pintos,
    custoPintoInformado: custoPinto !== null,
    custoTotal: total,
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, valor]) => ({
        categoria,
        valor,
        percentual: total > 0 ? (valor / total) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor),
    custoPorAveAlojada:
      resumo.avesAlojadas === null
        ? indisponivel('Alojamento não registrado')
        : custoPorAveAlojada(total, resumo.avesAlojadas),
    custoPorKg: custoPorKg(total, pesoProduzido),
    precoReferenciaKg: precoKg,
    receitaPrevista: receita,
    margem: margem(receita, total),
    margemPercentual: margemPercentual(receita, total),
  };
}
