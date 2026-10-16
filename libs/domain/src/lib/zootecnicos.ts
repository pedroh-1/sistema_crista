import {
  disponivel,
  Entrada,
  Indicador,
  indisponivel,
  informado,
} from './indicador';

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Dias entre duas datas no formato AAAA-MM-DD, sem efeito de fuso horário. */
export function diasEntre(inicio: string, fim: string): number {
  return Math.round(
    (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) /
      MS_POR_DIA,
  );
}

/** Inconsistência #1: a idade soma `idade_inicial_dias` (padrão 0 = pinto de um dia). */
export function idadeDias(
  dataAlojamento: string,
  data: string,
  idadeInicialDias = 0,
): number {
  return diasEntre(dataAlojamento, data) + idadeInicialDias;
}

export function avesAlojadas(
  avesRecebidas: number,
  mortasTransporte: number,
): number {
  return avesRecebidas - mortasTransporte;
}

export function saldoAves(
  avesAlojadas: number,
  baixasAcumuladas: number,
  avesSaidas = 0,
): number {
  return avesAlojadas - baixasAcumuladas - avesSaidas;
}

export function mortalidadeAcumulada(
  baixasAcumuladas: number,
  avesAlojadas: Entrada,
): Indicador {
  if (!informado(avesAlojadas) || avesAlojadas <= 0)
    return indisponivel('Alojamento não registrado');
  return disponivel((baixasAcumuladas / avesAlojadas) * 100);
}

export function viabilidade(mortalidade: Indicador): Indicador {
  return mortalidade.disponivel
    ? disponivel(100 - mortalidade.valor)
    : mortalidade;
}

export function pesoMedioAmostra(
  pesoTotalG: number,
  avesPesadas: number,
): Indicador {
  if (avesPesadas <= 0) return indisponivel('Pesagem sem aves');
  return disponivel(pesoTotalG / avesPesadas);
}

/** Percentual de aves dentro de ±10% da média. Exige pesos individuais. */
export function uniformidade(pesosIndividuaisG: readonly number[]): Indicador {
  if (pesosIndividuaisG.length === 0)
    return indisponivel('Pesagem sem pesos individuais');
  const media =
    pesosIndividuaisG.reduce((s, p) => s + p, 0) / pesosIndividuaisG.length;
  const dentro = pesosIndividuaisG.filter(
    (p) => Math.abs(p - media) <= media * 0.1,
  ).length;
  return disponivel((dentro / pesosIndividuaisG.length) * 100);
}

/** 1% do saldo ou 50 aves, o que for menor. Abaixo disso, aviso de baixa representatividade. */
export function amostraMinima(saldoAves: number): number {
  return Math.min(Math.ceil(saldoAves * 0.01), 50);
}

export function desvioCurva(
  pesoRealG: Entrada,
  pesoPadraoG: Entrada,
): Indicador {
  if (!informado(pesoRealG)) return indisponivel('Sem pesagem');
  if (!informado(pesoPadraoG) || pesoPadraoG <= 0)
    return indisponivel('Linhagem sem curva de referência');
  return disponivel(((pesoRealG - pesoPadraoG) / pesoPadraoG) * 100);
}

/** GPD médio desde o alojamento, descontando o peso do pinto. */
export function gpdMedio(
  pesoMedioG: Entrada,
  pesoPintoG: Entrada,
  idadeDias: number,
): Indicador {
  if (!informado(pesoMedioG)) return indisponivel('Sem pesagem');
  if (!informado(pesoPintoG))
    return indisponivel('Peso do pinto não informado');
  if (idadeDias <= 0) return indisponivel('Idade zero');
  return disponivel((pesoMedioG - pesoPintoG) / idadeDias);
}

/** GPD entre duas pesagens (UC11). */
export function gpdPeriodo(
  pesoAnteriorG: number,
  pesoAtualG: number,
  diasEntrePesagens: number,
): Indicador {
  if (diasEntrePesagens <= 0) return indisponivel('Pesagens na mesma data');
  return disponivel((pesoAtualG - pesoAnteriorG) / diasEntrePesagens);
}

export function pesoVivoEmEstoqueKg(
  saldoAves: number,
  pesoMedioG: Entrada,
): Indicador {
  if (!informado(pesoMedioG)) return indisponivel('Sem pesagem');
  return disponivel((saldoAves * pesoMedioG) / 1000);
}

export function pesoVivoProduzidoKg(
  pesoVivoEmEstoque: Indicador,
  pesoEntregueKg = 0,
): Indicador {
  return pesoVivoEmEstoque.disponivel
    ? disponivel(pesoVivoEmEstoque.valor + pesoEntregueKg)
    : pesoVivoEmEstoque;
}

export function conversaoAlimentar(
  racaoConsumidaKg: Entrada,
  pesoVivoProduzido: Indicador,
): Indicador {
  if (!informado(racaoConsumidaKg) || racaoConsumidaKg <= 0)
    return indisponivel('Sem registro de ração');
  if (!pesoVivoProduzido.disponivel) return pesoVivoProduzido;
  if (pesoVivoProduzido.valor <= 0) return indisponivel('Peso vivo zero');
  return disponivel(racaoConsumidaKg / pesoVivoProduzido.valor);
}

/** IEP = viabilidade (%) × peso médio (kg) ÷ (idade × CA) × 100. */
export function iep(
  viab: Indicador,
  pesoMedioG: Entrada,
  idadeDias: number,
  ca: Indicador,
): Indicador {
  if (!viab.disponivel) return viab;
  if (!ca.disponivel) return ca;
  if (!informado(pesoMedioG)) return indisponivel('Sem pesagem');
  if (idadeDias <= 0) return indisponivel('Idade zero');
  return disponivel(
    ((viab.valor * (pesoMedioG / 1000)) / (idadeDias * ca.valor)) * 100,
  );
}

export function densidadeAvesM2(
  avesAlojadas: number,
  areaUtilM2: number,
): number {
  return avesAlojadas / areaUtilM2;
}

export function densidadeKgM2(
  pesoVivoEmEstoque: Indicador,
  areaUtilM2: number,
): Indicador {
  return pesoVivoEmEstoque.disponivel
    ? disponivel(pesoVivoEmEstoque.valor / areaUtilM2)
    : pesoVivoEmEstoque;
}
