import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NOME_PERFIL } from '@crista/domain';
import { mensagemErro } from '../nucleo/erros';
import { Sessao } from '../nucleo/sessao';
import { FazendaAtual } from './fazenda-atual';

/** Leiaute da fazenda: menu lateral fixo (Design System, Navegacao) e o conteúdo à direita. */
@Component({
  selector: 'crista-pagina-fazenda',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  providers: [FazendaAtual],
  template: `
    <div class="leiaute">
      <aside class="menu">
        <a class="marca" routerLink="/fazendas">CRISTA</a>
        @if (atual.fazenda(); as fazenda) {
          <details class="troca-fazenda" #troca>
            <summary>
              <span class="nome-fazenda">{{ fazenda.nome }}</span>
              <small>{{ nomePerfil[fazenda.perfil] }} · trocar fazenda</small>
            </summary>
            <ul>
              @for (f of sessao.fazendas(); track f.id) {
                @if (f.id !== fazenda.id) {
                  <li>
                    <a
                      [routerLink]="['/fazendas', f.id]"
                      (click)="troca.open = false"
                      >{{ f.nome }}</a
                    >
                  </li>
                }
              }
              <li>
                <a routerLink="/fazendas" (click)="troca.open = false"
                  >Ver todas as fazendas</a
                >
              </li>
            </ul>
          </details>

          <nav aria-label="Fazenda">
            <a routerLink="lotes" routerLinkActive="ativa">Lotes</a>
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
            @if (atual.pode('painel.filtrar')) {
              <a routerLink="painel" routerLinkActive="ativa">Painel</a>
            }
            @if (atual.pode('financeiro.ver')) {
              <span class="grupo">Custos</span>
              <a routerLink="despesas" routerLinkActive="ativa">Despesas</a>
            }
            <span class="grupo">Estrutura</span>
            <a routerLink="galpoes" routerLinkActive="ativa">Galpões</a>
            <a routerLink="equipamentos" routerLinkActive="ativa"
              >Equipamentos</a
            >
            @if (atual.pode('vinculo.gerenciar')) {
              <a routerLink="equipe" routerLinkActive="ativa">Equipe</a>
            }
          </nav>
        }
        @if (sessao.usuario(); as usuario) {
          <div class="usuario">
            <span>{{ usuario.nome }}</span>
            <button
              type="button"
              class="fantasma pequeno"
              (click)="sessao.sair()"
            >
              Sair
            </button>
          </div>
        }
      </aside>

      <main class="conteudo">
        @if (erro()) {
          <p class="aviso" role="alert">{{ erro() }}</p>
        }
        @if (atual.fazenda()) {
          <router-outlet />
        } @else if (!erro()) {
          <span class="esqueleto" style="height: 34px; width: 280px"></span>
        }
      </main>
    </div>
  `,
  styles: `
    .leiaute {
      display: grid;
      grid-template-columns: var(--largura-menu) minmax(0, 1fr);
      min-height: 100vh;
    }
    .menu {
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      background: var(--superficie-2);
      border-right: 1px solid var(--borda);
      padding: var(--espaco-5) var(--espaco-3);
      display: flex;
      flex-direction: column;
      gap: var(--espaco-5);
    }
    .marca {
      font-family: var(--font-titulo);
      font-weight: 700;
      font-size: 20px;
      letter-spacing: 0.02em;
      color: var(--primaria);
      padding: 0 var(--espaco-3);
      text-decoration: none;
    }
    .troca-fazenda {
      position: relative;
    }
    .troca-fazenda summary {
      display: grid;
      gap: 2px;
      padding: var(--espaco-2) var(--espaco-3);
      border: 1px solid var(--borda);
      border-radius: var(--raio-sm);
      background: var(--superficie);
      cursor: pointer;
      list-style: none;
    }
    .troca-fazenda summary::-webkit-details-marker {
      display: none;
    }
    .nome-fazenda {
      font-weight: 600;
    }
    .troca-fazenda small {
      color: var(--texto-suave);
      font-size: 12px;
    }
    .troca-fazenda ul {
      position: absolute;
      z-index: 10;
      left: 0;
      right: 0;
      margin: var(--espaco-1) 0 0;
      padding: var(--espaco-1);
      list-style: none;
      background: var(--superficie);
      border: 1px solid var(--borda);
      border-radius: var(--raio-sm);
      box-shadow: var(--sombra-dialogo);
    }
    .troca-fazenda ul a {
      display: block;
      padding: var(--espaco-2) var(--espaco-3);
      border-radius: var(--raio-sm);
      color: var(--texto);
      text-decoration: none;
    }
    .troca-fazenda ul a:hover {
      background: var(--primaria-suave);
    }
    nav {
      display: grid;
      gap: 2px;
    }
    .grupo {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--texto-suave);
      padding: var(--espaco-3) var(--espaco-3) var(--espaco-1);
    }
    nav a {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--espaco-2);
      padding: var(--espaco-2) var(--espaco-3);
      border-radius: var(--raio-sm);
      color: var(--texto);
      text-decoration: none;
      font-weight: 500;
    }
    nav a:hover {
      background: var(--superficie);
    }
    nav a.ativa {
      background: var(--primaria-suave);
      color: var(--primaria);
      font-weight: 600;
    }
    .usuario {
      margin-top: auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--espaco-2);
      padding: var(--espaco-3) 0 0 var(--espaco-3);
      border-top: 1px solid var(--borda);
      font-size: 13px;
      color: var(--texto-suave);
    }
    .conteudo {
      width: 100%;
      max-width: calc(var(--largura-conteudo) + 2 * var(--espaco-6));
      padding: var(--espaco-6) var(--espaco-6) var(--espaco-7);
    }
    @media (max-width: 640px) {
      .leiaute {
        display: block;
      }
      .menu {
        position: static;
        height: auto;
        padding: var(--espaco-3);
        gap: var(--espaco-3);
        border-right: 0;
        border-bottom: 1px solid var(--borda);
      }
      nav {
        display: flex;
        overflow-x: auto;
      }
      nav a {
        white-space: nowrap;
      }
      .grupo {
        display: none;
      }
      .usuario {
        display: none;
      }
      .conteudo {
        padding: var(--espaco-4) var(--espaco-3) var(--espaco-7);
      }
    }
  `,
})
export class PaginaFazenda {
  protected readonly atual = inject(FazendaAtual);
  protected readonly sessao = inject(Sessao);
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
