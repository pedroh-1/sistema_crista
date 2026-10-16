import { HttpErrorResponse } from '@angular/common/http';
import { ZodType } from 'zod';

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

/**
 * A API responde 409 com `codigo` quando a operação pode seguir com a
 * confirmação do usuário (densidade acima da capacidade, revisão de pesagem).
 * Pergunta ao usuário e devolve true se ele confirmou.
 */
export function confirmouAposAviso(erro: unknown): boolean {
  if (!(erro instanceof HttpErrorResponse) || erro.status !== 409) return false;
  const corpo = erro.error as { codigo?: string; message?: string } | null;
  if (!corpo?.codigo) return false;
  return confirm(corpo.message ?? 'Confirma a operação?');
}
