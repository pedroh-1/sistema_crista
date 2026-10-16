/**
 * Resultado de um indicador. Quando falta dado de entrada o indicador é
 * indisponível, com o motivo, e nunca vira zero (UC13, docs/03-indicadores.md).
 */
export type Indicador =
  { disponivel: true; valor: number } | { disponivel: false; motivo: string };

export const disponivel = (valor: number): Indicador => ({
  disponivel: true,
  valor,
});

export const indisponivel = (motivo: string): Indicador => ({
  disponivel: false,
  motivo,
});

/** Valor numérico de entrada que pode não ter sido registrado ainda. */
export type Entrada = number | null | undefined;

export const informado = (v: Entrada): v is number =>
  typeof v === 'number' && Number.isFinite(v);
