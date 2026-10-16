import {
  disponivel,
  Entrada,
  Indicador,
  indisponivel,
  informado,
} from './indicador';

export function custoPintos(avesRecebidas: number, custoPinto: number): number {
  return avesRecebidas * custoPinto;
}

/** Custo dos pintos mais as parcelas de despesa rateadas ao lote. */
export function custoTotal(
  custoDosPintos: number,
  parcelasDespesa: readonly number[],
): number {
  return parcelasDespesa.reduce((s, v) => s + v, custoDosPintos);
}

/** Indicador único de custo por ave (inconsistência #6). */
export function custoPorAveAlojada(
  custo: number,
  avesAlojadas: number,
): Indicador {
  if (avesAlojadas <= 0) return indisponivel('Alojamento não registrado');
  return disponivel(custo / avesAlojadas);
}

export function custoPorKg(
  custo: number,
  pesoVivoProduzido: Indicador,
): Indicador {
  if (!pesoVivoProduzido.disponivel) return pesoVivoProduzido;
  if (pesoVivoProduzido.valor <= 0) return indisponivel('Peso vivo zero');
  return disponivel(custo / pesoVivoProduzido.valor);
}

export function receitaPrevista(
  pesoVivoEmEstoque: Indicador,
  precoKg: Entrada,
): Indicador {
  if (!informado(precoKg)) return indisponivel('Preço de venda não informado');
  return pesoVivoEmEstoque.disponivel
    ? disponivel(pesoVivoEmEstoque.valor * precoKg)
    : pesoVivoEmEstoque;
}

export function receitaRealizada(
  cargas: readonly { pesoKg: number; precoKg: number }[],
): number {
  return cargas.reduce((s, c) => s + c.pesoKg * c.precoKg, 0);
}

export function margem(receita: Indicador, custo: number): Indicador {
  return receita.disponivel ? disponivel(receita.valor - custo) : receita;
}

export function margemPercentual(receita: Indicador, custo: number): Indicador {
  if (!receita.disponivel) return receita;
  if (receita.valor <= 0) return indisponivel('Receita zero');
  return disponivel(((receita.valor - custo) / receita.valor) * 100);
}

/**
 * Divide um valor em centavos proporcionalmente aos pesos (aves alojadas,
 * kg de ração ou percentual manual). A soma das parcelas é sempre igual ao
 * valor; a sobra do arredondamento vai para a maior parcela.
 */
export function ratear(
  valorCentavos: number,
  pesos: readonly number[],
): number[] {
  const total = pesos.reduce((s, p) => s + p, 0);
  if (pesos.length === 0 || total <= 0) throw new Error('Rateio sem base');
  const parcelas = pesos.map((p) => Math.floor((valorCentavos * p) / total));
  const sobra = valorCentavos - parcelas.reduce((s, p) => s + p, 0);
  const maior = parcelas.indexOf(Math.max(...parcelas));
  parcelas[maior] += sobra;
  return parcelas;
}
