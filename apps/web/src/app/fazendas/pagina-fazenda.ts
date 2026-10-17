import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NOME_PERFIL } from '@crista/domain';
import { mensagemErro } from '../nucleo/erros';
import { FazendaAtual } from './fazenda-atual';

@Component({
  selector: 'crista-pagina-fazenda',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  providers: [FazendaAtual],
  template: `
    <main class="pagina">
      <p><a routerLink="/fazendas">← Minhas fazendas</a></p>
      @if (erro()) {
        <p class="alerta" role="alert">{{ erro() }}</p>
      }
      @if (atual.fazenda(); as fazenda) {
        <div class="cabecalho-secao">
          <div>
            <h1>{{ fazenda.nome }}</h1>
            <span class="suave"
              >{{ fazenda.municipio }}/{{ fazenda.uf }} · seu perfil:
              {{ nomePerfil[fazenda.perfil] }}</span
            >
          </div>
        </div>
        <nav class="abas">
          <a routerLink="lotes" routerLinkActive="ativa">Lotes</a>
          @if (atual.pode('painel.filtrar')) {
            <a routerLink="painel" routerLinkActive="ativa">Painel</a>
          }
          @if (atual.pode('financeiro.ver')) {
            <a routerLink="despesas" routerLinkActive="ativa">Despesas</a>
          }
          <a routerLink="alertas" routerLinkActive="ativa">
            Alertas
            @if (atual.alertasAbertos().length > 0) {
              <span
                class="contador"
                [attr.aria-label]="atual.alertasAbertos().length + ' abertos'"
                >{{ atual.alertasAbertos().length }}</span
              >
            }
          </a>
          <a routerLink="galpoes" routerLinkActive="ativa">Galpões</a>
          <a routerLink="equipamentos" routerLinkActive="ativa">Equipamentos</a>
          @if (atual.pode('vinculo.gerenciar')) {
            <a routerLink="equipe" routerLinkActive="ativa">Equipe</a>
          }
        </nav>
        <router-outlet />
      }
    </main>
  `,
  styles: `
    .abas {
      display: flex;
      gap: 0.25rem;
      border-bottom: 1px solid var(--borda);
      margin-bottom: 1rem;
      overflow-x: auto;
    }
    .abas a {
      padding: 0.5rem 0.9rem;
      text-decoration: none;
      color: var(--texto-suave);
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .contador {
      display: inline-block;
      min-width: 1.3rem;
      padding: 0 0.35rem;
      margin-left: 0.25rem;
      border-radius: 999px;
      background: var(--perigo);
      color: #fff;
      font-size: 0.75rem;
      font-weight: 700;
      text-align: center;
    }
    .abas a.ativa {
      color: var(--primaria);
      border-bottom-color: var(--primaria);
      font-weight: 600;
    }
  `,
})
export class PaginaFazenda {
  protected readonly atual = inject(FazendaAtual);
  protected readonly nomePerfil = NOME_PERFIL;
  protected readonly erro = signal('');

  readonly idFazenda = input.required<string>();

  constructor() {
    effect(() => {
      const id = this.idFazenda();
      this.erro.set('');
      this.atual.carregar(id).catch((e) => this.erro.set(mensagemErro(e)));
    });
  }
}
