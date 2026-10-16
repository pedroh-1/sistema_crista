import { Perfil } from '@crista/domain';

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
