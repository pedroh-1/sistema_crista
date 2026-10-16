import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Sessao } from './sessao';

/** Exige login; depois do login volta para a página pedida. */
export const exigeLogin: CanActivateFn = async (_, estado) => {
  const sessao = inject(Sessao);
  const router = inject(Router);
  if (!sessao.logado())
    return router.createUrlTree(['/entrar'], {
      queryParams: { voltar: estado.url },
    });
  if (!sessao.usuario()) {
    try {
      await sessao.carregar();
    } catch {
      return false;
    }
  }
  return true;
};

/** Páginas de login e cadastro não fazem sentido para quem já entrou. */
export const somenteVisitante: CanActivateFn = () => {
  const sessao = inject(Sessao);
  return sessao.logado() ? inject(Router).createUrlTree(['/fazendas']) : true;
};
