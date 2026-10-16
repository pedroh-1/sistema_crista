import { Route } from '@angular/router';
import { Cadastro } from './conta/cadastro';
import { Convite } from './conta/convite';
import { Entrar } from './conta/entrar';
import { VerificarEmail } from './conta/verificar-email';
import { Equipe } from './fazendas/equipe';
import { Galpoes } from './fazendas/galpoes';
import { ListaFazendas } from './fazendas/lista-fazendas';
import { NovaFazenda } from './fazendas/nova-fazenda';
import { PaginaFazenda } from './fazendas/pagina-fazenda';
import { exigeLogin, somenteVisitante } from './nucleo/guardas';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', redirectTo: 'fazendas' },
  {
    path: 'entrar',
    component: Entrar,
    canActivate: [somenteVisitante],
    title: 'Entrar · CRISTA',
  },
  {
    path: 'cadastro',
    component: Cadastro,
    canActivate: [somenteVisitante],
    title: 'Criar conta · CRISTA',
  },
  {
    path: 'verificar-email',
    component: VerificarEmail,
    title: 'Confirmar e-mail · CRISTA',
  },
  { path: 'convite', component: Convite, title: 'Convite · CRISTA' },
  {
    path: 'fazendas',
    canActivate: [exigeLogin],
    children: [
      { path: '', component: ListaFazendas, title: 'Minhas fazendas · CRISTA' },
      {
        path: 'nova',
        component: NovaFazenda,
        title: 'Cadastrar fazenda · CRISTA',
      },
      {
        path: ':idFazenda',
        component: PaginaFazenda,
        title: 'Fazenda · CRISTA',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'galpoes' },
          { path: 'galpoes', component: Galpoes },
          { path: 'equipe', component: Equipe },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'fazendas' },
];
