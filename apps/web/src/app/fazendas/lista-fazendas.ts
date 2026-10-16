import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NOME_PERFIL } from '@crista/domain';
import { Sessao } from '../nucleo/sessao';

@Component({
  selector: 'crista-lista-fazendas',
  imports: [RouterLink],
  template: `
    <main class="pagina">
      <div class="cabecalho-secao">
        <h1>Minhas fazendas</h1>
        <a class="botao" routerLink="/fazendas/nova">Cadastrar fazenda</a>
      </div>
      @for (fazenda of sessao.fazendas(); track fazenda.id) {
        <a class="cartao item" [routerLink]="['/fazendas', fazenda.id]">
          <strong>{{ fazenda.nome }}</strong>
          <span class="etiqueta">{{ nomePerfil[fazenda.perfil] }}</span>
        </a>
      } @empty {
        <div class="cartao">
          <p>Você ainda não tem acesso a nenhuma fazenda.</p>
          <p class="suave">
            Cadastre a sua fazenda ou peça ao Gestor de uma fazenda que envie um
            convite para
            {{ sessao.usuario()?.email }}.
          </p>
        </div>
      }
    </main>
  `,
  styles: `
    .item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      text-decoration: none;
      color: inherit;
    }
    .item:hover {
      border-color: var(--primaria);
    }
  `,
})
export class ListaFazendas {
  protected readonly sessao = inject(Sessao);
  protected readonly nomePerfil = NOME_PERFIL;
}
