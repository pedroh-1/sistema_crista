import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NOME_LINHAGEM } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { mensagemErro } from '../nucleo/erros';
import { formatarData, formatarNumero } from '../nucleo/formato';
import { LoteResumido } from './tipos';

const NOME_SITUACAO: Record<LoteResumido['situacao'], string> = {
  em_andamento: 'Em andamento',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

@Component({
  selector: 'crista-lista-lotes',
  imports: [RouterLink],
  template: `
    @if (erro()) {
      <p class="alerta" role="alert">{{ erro() }}</p>
    }
    <section class="cartao">
      <div class="cabecalho-secao">
        <h2>Lotes em andamento</h2>
        @if (atual.pode('lote.cadastrar')) {
          <a class="botao" [routerLink]="atual.link('lotes', 'novo')"
            >Cadastrar lote</a
          >
        }
      </div>
      @for (lote of emAndamento(); track lote.id) {
        <a class="linha-lote" [routerLink]="atual.link('lotes', lote.id)">
          <strong>{{ lote.codigo }}</strong>
          <span>{{ lote.galpao }}</span>
          <span class="suave"
            >{{ nomeLinhagem[lote.linhagem] }} · alojado em
            {{ data(lote.dataAlojamento) }}</span
          >
          <span class="suave"
            >{{ numero(lote.quantidadePrevista) }} aves previstas</span
          >
        </a>
      } @empty {
        <p class="suave">Nenhum lote em andamento.</p>
      }
    </section>

    @if (anteriores().length > 0) {
      <section class="cartao">
        <h2>Lotes anteriores</h2>
        @for (lote of anteriores(); track lote.id) {
          <a class="linha-lote" [routerLink]="atual.link('lotes', lote.id)">
            <strong>{{ lote.codigo }}</strong>
            <span>{{ lote.galpao }}</span>
            <span class="suave"
              >{{ nomeLinhagem[lote.linhagem] }} · alojado em
              {{ data(lote.dataAlojamento) }}</span
            >
            <span
              class="etiqueta"
              [class.inativo]="lote.situacao === 'cancelado'"
              >{{ nomeSituacao[lote.situacao] }}</span
            >
          </a>
        }
      </section>
    }
  `,
  styles: `
    .linha-lote {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(90px, 1fr) 2fr auto;
      gap: 0.75rem;
      align-items: center;
      padding: 0.7rem 0.5rem;
      border-bottom: 1px solid var(--borda);
      text-decoration: none;
      color: inherit;
    }
    .linha-lote:hover {
      background: var(--fundo);
    }
    @media (max-width: 600px) {
      .linha-lote {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class ListaLotes implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly atual = inject(FazendaAtual);

  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly nomeSituacao = NOME_SITUACAO;
  protected readonly data = formatarData;
  protected readonly numero = formatarNumero;
  protected readonly lotes = signal<LoteResumido[]>([]);
  protected readonly erro = signal('');
  protected readonly emAndamento = computed(() =>
    this.lotes().filter((l) => l.situacao === 'em_andamento'),
  );
  protected readonly anteriores = computed(() =>
    this.lotes().filter((l) => l.situacao !== 'em_andamento'),
  );

  async ngOnInit(): Promise<void> {
    try {
      this.lotes.set(
        await firstValueFrom(
          this.http.get<LoteResumido[]>(`${this.atual.url()}/lotes`),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
