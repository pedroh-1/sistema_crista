import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';
import { autenticacaoInterceptor } from './nucleo/interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Parâmetros de rota e de query (token, voltar, idFazenda) viram inputs dos componentes.
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([autenticacaoInterceptor])),
  ],
};
