export type Criticidade = 'atencao' | 'critico';

export interface Alerta {
  id: string;
  indicador: string;
  criticidade: Criticidade;
  status: 'aberto' | 'fechado';
  valor: number;
  limite: number;
  limitePadrao: boolean;
  mensagem: string;
  loteId: string | null;
  lote: string | null;
  /** Alerta de equipamento crítico parado (UC19). */
  equipamentoId: string | null;
  dataReferencia: string;
  abertoEm: string;
  atualizadoEm: string;
  fechadoEm: string | null;
  fechadoPor: string | null;
  providencia: string | null;
}

/** Criticidade nunca só por cor: vai com ícone e texto. */
export const ROTULO_CRITICIDADE: Record<Criticidade, string> = {
  atencao: '⚠ Atenção',
  critico: '‼ Crítico',
};
