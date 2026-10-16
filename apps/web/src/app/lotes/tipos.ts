import { Indicador, NivelAlerta, Perfil } from '@crista/domain';

export interface Estorno {
  motivo: string;
  em: string;
}

export interface LoteResumido {
  id: string;
  codigo: string;
  galpao: string;
  linhagem: 'cobb500' | 'ross308' | 'hubbard' | 'outra';
  dataAlojamento: string;
  quantidadePrevista: number;
  situacao: 'em_andamento' | 'encerrado' | 'cancelado';
}

export interface ResumoLote {
  idadeDias: number;
  avesAlojadas: number | null;
  baixasAcumuladas: number;
  saldoAves: number | null;
  mortalidade: Indicador;
  viabilidade: Indicador;
  mortalidadeHoje: { percentual: Indicador; nivel: NivelAlerta | null };
  ultimaPesagem: string | null;
  pesoMedioG: Indicador;
  uniformidade: Indicador;
  gpdMedioG: Indicador;
  pesoVivoEstoqueKg: Indicador;
  racaoConsumidaKg: Indicador;
  conversaoAlimentar: Indicador;
  iep: Indicador;
  densidadeKgM2: Indicador;
  carenciaAte: string | null;
}

export interface LoteDetalhe extends Omit<LoteResumido, 'galpao'> {
  sexagem: 'misto' | 'macho' | 'femea';
  origem: string | null;
  idadeInicialDias: number;
  pesoPintoG: number | null;
  custoPinto: number | null;
  galpao: { id: string; identificacao: string; capacidadeAves: number };
  alojamento: {
    data: string;
    avesRecebidas: number;
    mortasTransporte: number;
    justificativaDivergencia: string | null;
  } | null;
  precoReferenciaKg: number | null;
  resumo: ResumoLote;
  meta: MetaLote;
}

export type SituacaoMeta = 'abaixo' | 'dentro' | 'acima';

export interface MetaLote {
  idadeDias: number | null;
  pesoPadraoG: number | null;
  desvioCurva: Indicador;
  situacao: SituacaoMeta | null;
  caPadrao: Indicador;
  fonteCurva: string | null;
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

export interface CurvaLote {
  fonteCurva: string | null;
  linhagem: LoteResumido['linhagem'];
  pesagens: PontoPesagem[];
  curvaPadrao: { idadeDias: number; pesoG: number }[];
}

export interface FinanceiroLote {
  custoPintos: number;
  custoPintoInformado: boolean;
  custoTotal: number;
  porCategoria: { categoria: string; valor: number; percentual: number }[];
  custoPorAveAlojada: Indicador;
  custoPorKg: Indicador;
  precoReferenciaKg: number | null;
  receitaPrevista: Indicador;
  margem: Indicador;
  margemPercentual: Indicador;
}

export interface Baixa {
  id: string;
  data: string;
  mortes: number;
  descartes: number;
  causaProvavel: string | null;
  registradoPor: string | null;
  estorno: Estorno | null;
}

export interface PesagemLinha {
  id: string;
  data: string;
  idadeDias: number;
  avesPesadas: number;
  pesoMedioG: number;
  uniformidade: Indicador;
  pontoColeta: string | null;
  revisaoConfirmada: boolean;
  estorno: Estorno | null;
}

export interface MovimentoRacao {
  id: string;
  data: string;
  tipo: 'entrada' | 'estoque_restante';
  quantidadeKg: number;
  fornecedor: string | null;
  notaFiscal: string | null;
  estorno: Estorno | null;
}

export interface Ocorrencia {
  id: string;
  data: string;
  tipo: 'doenca' | 'vacinacao' | 'medicacao' | 'anomalia' | 'inspecao';
  descricao: string;
  produto: string | null;
  dose: string | null;
  via: string | null;
  loteProduto: string | null;
  carenciaDias: number | null;
  dataFimCarencia: string | null;
  carenciaVigente: boolean;
  veterinario: string | null;
  estorno: Estorno | null;
  anexos: { id: string; nome: string; mime: string; tamanho: number }[];
}

export type { Perfil };
