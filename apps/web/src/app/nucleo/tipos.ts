import {
  Indicador,
  IndicadoresFazenda,
  NivelAlerta,
  Perfil,
  PontoMortalidadeFazenda,
  SituacaoFiltro,
} from '@crista/domain';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
}

export interface FazendaResumo {
  id: string;
  nome: string;
  perfil: Perfil;
}

export interface Fazenda extends FazendaResumo {
  documento: string;
  logradouro: string | null;
  municipio: string;
  uf: string;
  integradora: string | null;
  tipoCriacao: 'corte';
}

export interface Galpao {
  id: string;
  identificacao: string;
  areaUtilM2: number;
  capacidadeAves: number;
  densidadeMaxima: number;
  tipo: 'convencional' | 'climatizado' | 'dark_house';
  situacao: 'disponivel' | 'ocupado' | 'inativo';
}

export interface Vinculo {
  id: string;
  email: string;
  nome: string | null;
  perfil: Perfil;
  crmv: string | null;
  galpoes: string[];
  validoAte: string | null;
  status: 'pendente' | 'ativo' | 'expirado' | 'revogado';
}

/** Lote em andamento no resumo da fazenda (página inicial). */
export interface LoteNoResumo {
  id: string;
  codigo: string;
  galpao: string;
  linhagem: 'cobb500' | 'ross308' | 'hubbard' | 'outra';
  dataAlojamento: string;
  idadeDias: number;
  saldoAves: number | null;
  mortalidade: Indicador;
  mortalidadeHoje: { percentual: Indicador; nivel: NivelAlerta | null };
  pesoMedioG: Indicador;
  ultimaPesagem: string | null;
  situacaoMeta: 'abaixo' | 'dentro' | 'acima' | null;
  nivelMeta: NivelAlerta | null;
  carenciaAte: string | null;
  alertas: { abertos: number; criticos: number };
}

/** GET fazendas/:id/resumo, só com os galpões do vínculo. */
export interface ResumoFazenda {
  lotes: LoteNoResumo[];
  saldoAves: number;
  galpoes: { total: number; ocupados: number };
  alertas: { abertos: number; criticos: number };
  equipamentosParados: { total: number; criticos: number };
}

/** Ponto do resumo gerencial da visão geral, já ordenado (crítico primeiro). */
export interface PontoAtencao {
  tom: 'critico' | 'atencao' | 'info' | 'sucesso';
  texto: string;
  link:
    | { tipo: 'lote'; id: string }
    | { tipo: 'alertas' }
    | { tipo: 'equipamentos' }
    | null;
}

/** Lote na visão geral, como estava no fim do período (ou no encerramento). */
export interface LoteNaVisao {
  id: string;
  codigo: string;
  galpao: string;
  galpaoId: string;
  linhagem: LoteNoResumo['linhagem'];
  situacao: 'em_andamento' | 'encerrado' | 'cancelado';
  dataAlojamento: string;
  dataEncerramento: string | null;
  encerramentoParcial: boolean;
  idadeDias: number;
  avesAlojadas: number | null;
  saldoAves: number | null;
  baixasAcumuladas: number;
  mortalidade: Indicador;
  mortalidadeHoje: { percentual: Indicador; nivel: NivelAlerta | null } | null;
  pesoMedioG: Indicador;
  desvioCurva: Indicador;
  situacaoMeta: LoteNoResumo['situacaoMeta'];
  nivelMeta: NivelAlerta | null;
  uniformidade: Indicador;
  uniformidadeNivel: NivelAlerta | null;
  conversaoAlimentar: Indicador;
  iep: Indicador;
  carenciaAte: string | null;
  alertas: { abertos: number; criticos: number };
  financeiro: {
    custoTotal: number;
    custoPorKg: Indicador;
    margem: Indicador;
  } | null;
}

/** GET fazendas/:id/visao-geral: tudo com o mesmo filtro do relatório. */
export interface VisaoGeral {
  fazenda: { id: string; nome: string; municipio: string; uf: string };
  periodo: { de: string; ate: string };
  filtro: {
    galpao: string | null;
    lote: string | null;
    situacao: SituacaoFiltro;
  };
  financeiroVisivel: boolean;
  indicadores: IndicadoresFazenda;
  alertas: { abertos: number; criticos: number };
  mortalidadeDiaria: PontoMortalidadeFazenda[];
  lotes: LoteNaVisao[];
  custos: {
    porCategoria: { categoria: string; valor: number; percentual: number }[];
    porMes: { mes: string; valor: number }[];
  } | null;
  atencao: PontoAtencao[];
}
