/**
 * Matriz de permissões (docs/02-permissoes.md). Usada pela API para autorizar
 * e pelo web para esconder o que o perfil não pode fazer.
 *
 * Toda ação de leitura é liberada para qualquer vínculo ativo, exceto as
 * listadas aqui (vínculos e indicadores financeiros).
 */
export const PERFIS = [
  'gestor',
  'produtor',
  'veterinario',
  'operador',
  'consulta',
] as const;
export type Perfil = (typeof PERFIS)[number];

export const NOME_PERFIL: Record<Perfil, string> = {
  gestor: 'Gestor',
  produtor: 'Produtor',
  veterinario: 'Veterinário',
  operador: 'Operador',
  consulta: 'Consulta',
};

const MATRIZ = {
  'fazenda.editar': ['gestor'],
  'galpao.editar': ['gestor'],
  'vinculo.gerenciar': ['gestor'],
  'lote.cadastrar': ['gestor'],
  'alojamento.registrar': ['gestor', 'operador'],
  'baixa.registrar': ['gestor', 'veterinario', 'operador'],
  'sanidade.registrar': ['veterinario'],
  'pesagem.registrar': ['gestor', 'veterinario', 'operador'],
  'racao.registrar': ['gestor', 'produtor', 'operador'],
  'despesa.registrar': ['gestor', 'produtor'],
  'financeiro.ver': ['gestor', 'produtor', 'consulta'],
  'painel.filtrar': ['gestor', 'produtor', 'veterinario', 'consulta'],
  'alerta.fechar': ['gestor', 'veterinario'],
  'alerta.configurar': ['gestor', 'veterinario'],
  'lote.encerrar': ['gestor'],
  'equipamento.cadastrar': ['gestor', 'produtor'],
  'manutencao.registrar': ['gestor', 'produtor', 'operador'],
} as const satisfies Record<string, readonly Perfil[]>;

export type Acao = keyof typeof MATRIZ;

export function pode(perfil: Perfil, acao: Acao): boolean {
  return (MATRIZ[acao] as readonly Perfil[]).includes(perfil);
}
