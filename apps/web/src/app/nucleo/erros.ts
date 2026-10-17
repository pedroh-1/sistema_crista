import { HttpErrorResponse } from '@angular/common/http';
import { ZodType } from 'zod';
import { Dialogos } from './dialogos';

export type ErrosCampo = Record<string, string>;

/** Valida com um schema de `@crista/domain` e devolve a primeira mensagem de cada campo. */
export function validar<T>(
  schema: ZodType<T>,
  valor: unknown,
): { ok: true; dados: T } | { ok: false; erros: ErrosCampo } {
  const resultado = schema.safeParse(valor);
  if (resultado.success) return { ok: true, dados: resultado.data };
  const erros: ErrosCampo = {};
  for (const issue of resultado.error.issues) {
    erros[issue.path.join('.')] ??= issue.message;
  }
  return { ok: false, erros };
}

/** Mensagem legível de um erro da API. */
export function mensagemErro(erro: unknown): string {
  if (erro instanceof HttpErrorResponse) {
    if (erro.status === 0) return 'Sem conexão com o servidor. Tente de novo.';
    const corpo = erro.error as {
      message?: string | string[];
      erros?: { mensagem: string }[];
    } | null;
    if (corpo?.erros?.length)
      return corpo.erros.map((e) => e.mensagem).join('. ');
    if (typeof corpo?.message === 'string') return corpo.message;
  }
  return 'Algo deu errado. Tente de novo.';
}

/** Título e botão do diálogo para cada regra branda que a API pede para confirmar. */
const CONFIRMACOES: Record<string, { titulo: string; acao: string }> = {
  DENSIDADE: {
    titulo: 'Alojar acima da capacidade?',
    acao: 'Alojar mesmo assim',
  },
  REVISAO_PESAGEM: {
    titulo: 'Confirmar esta pesagem?',
    acao: 'Registrar mesmo assim',
  },
  DUPLICIDADE: {
    titulo: 'Lançar despesa parecida?',
    acao: 'Lançar mesmo assim',
  },
  PENDENCIAS: {
    titulo: 'Encerrar com pendências?',
    acao: 'Encerrar como parcial',
  },
};

/**
 * A API responde 409 com `codigo` quando a operação pode seguir com a
 * confirmação do usuário (densidade acima da capacidade, revisão de pesagem).
 * Pergunta ao usuário no diálogo e devolve true se ele confirmou.
 */
export async function confirmouAposAviso(
  erro: unknown,
  dialogos: Dialogos,
): Promise<boolean> {
  if (!(erro instanceof HttpErrorResponse) || erro.status !== 409) return false;
  const corpo = erro.error as { codigo?: string; message?: string } | null;
  if (!corpo?.codigo) return false;
  const textos = CONFIRMACOES[corpo.codigo] ?? {
    titulo: 'Confirmar a operação?',
    acao: 'Confirmar',
  };
  return dialogos.confirmar({
    ...textos,
    mensagem: corpo.message ?? '',
  });
}
