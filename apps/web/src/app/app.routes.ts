import { Route } from '@angular/router';
import { Cadastro } from './conta/cadastro';
import { Convite } from './conta/convite';
import { Entrar } from './conta/entrar';
import { VerificarEmail } from './conta/verificar-email';
import { exigeLogin, somenteVisitante } from './nucleo/guardas';

// As telas de conta vão no pacote inicial; as de fazenda e lote carregam sob demanda.
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
      {
        path: '',
        loadComponent: () =>
          import('./fazendas/lista-fazendas').then((m) => m.ListaFazendas),
        title: 'Minhas fazendas · CRISTA',
      },
      {
        path: 'nova',
        loadComponent: () =>
          import('./fazendas/nova-fazenda').then((m) => m.NovaFazenda),
        title: 'Cadastrar fazenda · CRISTA',
      },
      {
        path: ':idFazenda',
        loadComponent: () =>
          import('./fazendas/pagina-fazenda').then((m) => m.PaginaFazenda),
        title: 'Fazenda · CRISTA',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'lotes' },
          {
            path: 'lotes',
            loadComponent: () =>
              import('./lotes/lista-lotes').then((m) => m.ListaLotes),
          },
          {
            path: 'lotes/novo',
            loadComponent: () =>
              import('./lotes/novo-lote').then((m) => m.NovoLote),
          },
          {
            path: 'lotes/:idLote',
            loadComponent: () =>
              import('./lotes/pagina-lote').then((m) => m.PaginaLote),
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'mortalidade' },
              {
                path: 'mortalidade',
                loadComponent: () =>
                  import('./lotes/aba-mortalidade').then(
                    (m) => m.AbaMortalidade,
                  ),
              },
              {
                path: 'pesagens',
                loadComponent: () =>
                  import('./lotes/aba-pesagens').then((m) => m.AbaPesagens),
              },
              {
                path: 'sanidade',
                loadComponent: () =>
                  import('./lotes/aba-sanidade').then((m) => m.AbaSanidade),
              },
              {
                path: 'racao',
                loadComponent: () =>
                  import('./lotes/aba-racao').then((m) => m.AbaRacao),
              },
              {
                path: 'curva',
                loadComponent: () =>
                  import('./lotes/aba-curva').then((m) => m.AbaCurva),
              },
              {
                path: 'custos',
                loadComponent: () =>
                  import('./lotes/aba-custos').then((m) => m.AbaCustos),
              },
            ],
          },
          {
            path: 'despesas',
            loadComponent: () =>
              import('./custos/despesas').then((m) => m.Despesas),
          },
          {
            path: 'painel',
            loadComponent: () =>
              import('./custos/painel').then((m) => m.Painel),
          },
          {
            path: 'galpoes',
            loadComponent: () =>
              import('./fazendas/galpoes').then((m) => m.Galpoes),
          },
          {
            path: 'equipe',
            loadComponent: () =>
              import('./fazendas/equipe').then((m) => m.Equipe),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: 'fazendas' },
];
