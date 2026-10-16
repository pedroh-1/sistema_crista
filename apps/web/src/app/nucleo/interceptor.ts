import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { Sessao } from './sessao';

/** Envia o token e encerra a sessão quando ele expira. */
export const autenticacaoInterceptor: HttpInterceptorFn = (req, next) => {
  const sessao = inject(Sessao);
  const token = sessao.token();
  const autenticada = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;
  return next(autenticada).pipe(
    catchError((erro: unknown) => {
      if (erro instanceof HttpErrorResponse && erro.status === 401 && token)
        sessao.sair();
      return throwError(() => erro);
    }),
  );
};
