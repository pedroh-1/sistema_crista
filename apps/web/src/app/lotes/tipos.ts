import {
  Indicador,
  Limites,
  NivelAlerta,
  Perfil,
  PontoMortalidadeDia,
} from '@crista/domain';

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
  /** Nível pelo limite de uniformidade da fazenda (o mesmo dos alertas). */
  uniformidadeNivel: NivelAlerta | null;
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
  encerramento: Encerramento | null;
  resumo: ResumoLote;
  meta: MetaLote;
}

export type SituacaoMeta = 'abaixo' | 'dentro' | 'acima';

export interface MetaLote {
  idadeDias: number | null;
  pesoPadraoG: number | null;
  desvioCurva: Indicador;
  situacao: SituacaoMeta | null;
  /** Nível pelo limite de desvio de peso da fazenda (o mesmo dos alertas). */
  nivel: NivelAlerta | null;
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
  nivel: NivelAlerta | null;
  gpdPeriodoG: number | null;
}

export interface CurvaLote {
  fonteCurva: string | null;
  linhagem: LoteResumido['linhagem'];
  pesagens: PontoPesagem[];
  curvaPadrao: { idadeDias: number; pesoG: number }[];
}

/** Mortalidade de cada dia com baixa e os limites do alerta (E5). */
export interface MortalidadeDiaria {
  limitesConfigurados: Limites | null;
  pontos: PontoMortalidadeDia[];
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

export interface Carga {
  id: string;
  data: string;
  aves: number;
  pesoTotalKg: number;
  pesoMedioKg: number;
  precoKg: number | null;
  destino: string | null;
  numeroGta: string | null;
  estorno: Estorno | null;
}

export interface ResultadoEncerramento {
  zootecnico: {
    avesRecebidas: number | null;
    avesAlojadas: number | null;
    baixas: number;
    avesEntregues: number;
    avesSemSaida: number | null;
    mortalidadePct: number | null;
    viabilidadePct: number | null;
    idadeAbateDias: number;
    pesoEntregueKg: number;
    pesoMedioFinalKg: number | null;
    gpdFinalG: number | null;
    racaoConsumidaKg: number | null;
    conversaoAlimentar: number | null;
    iep: number | null;
  };
  financeiro: {
    custoTotal: number;
    porCategoria: { categoria: string; valor: number; percentual: number }[];
    custoPorAveAlojada: number | null;
    custoPorKgEntregue: number | null;
    receitaRealizada: number;
    cargasSemPreco: number;
    margem: number;
    margemPct: number | null;
  };
}

export interface Encerramento {
  data: string;
  parcial: boolean;
  pendencias: string[];
  resultado: ResultadoEncerramento;
  encerradoPor: string | null;
  encerradoEm: string;
}
