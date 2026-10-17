import { Indicador, NivelAlerta, Perfil } from '@crista/domain';

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
