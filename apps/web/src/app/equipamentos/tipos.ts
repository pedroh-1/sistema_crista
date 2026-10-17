import {
  SituacaoEquipamento,
  SituacaoPreventiva,
  TipoEquipamento,
  TipoManutencao,
} from '@crista/domain';

/** Equipamento com a situação calculada pela API (UC18). */
export interface Equipamento {
  id: string;
  nome: string;
  tipo: TipoEquipamento;
  galpaoId: string | null;
  galpao: string | null;
  numeroSerie: string | null;
  fabricante: string | null;
  modelo: string | null;
  critico: boolean;
  periodicidadeDias: number | null;
  dataAquisicao: string | null;
  situacao: SituacaoEquipamento;
  paradoDesde: string | null;
  ultimaManutencao: string | null;
  proximaPreventiva: string | null;
  situacaoPreventiva: SituacaoPreventiva;
  /** Nulo para quem não vê o financeiro. */
  custoTotal: number | null;
}

/** Manutenção registrada (UC19). Custos nulos para quem não vê o financeiro. */
export interface Manutencao {
  id: string;
  tipo: TipoManutencao;
  data: string;
  descricao: string;
  custoPecas: number | null;
  custoMaoObra: number | null;
  custoTotal: number | null;
  fornecedor: string | null;
  ordemServico: string | null;
  paradaInicio: string | null;
  retornoOperacao: string | null;
  horasParado: number | null;
  registradoPor: string | null;
  estorno: { motivo: string } | null;
}

/** Classe da etiqueta: a cor sempre acompanha o texto. */
export const CLASSE_PREVENTIVA: Record<SituacaoPreventiva, string> = {
  sem_previsao: '',
  em_dia: 'sucesso',
  vence_logo: 'atencao',
  vencida: 'critico',
};

/** Glifo que vai junto do texto nos estados que pedem ação. */
export const ICONE_PREVENTIVA: Record<SituacaoPreventiva, string> = {
  sem_previsao: '',
  em_dia: '',
  vence_logo: '⚠',
  vencida: '‼',
};

/** Data e hora (ISO) no formato brasileiro, no fuso das fazendas. */
export function formatarDataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Valor de um <input type="datetime-local"> (hora do navegador) para ISO 8601. */
export function dataHoraParaISO(valor: string): string | undefined {
  return valor ? new Date(valor).toISOString() : undefined;
}

/** Agora, no formato do <input type="datetime-local">. */
export function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
