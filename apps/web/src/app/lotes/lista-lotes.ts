import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Acao, NOME_LINHAGEM } from '@crista/domain';
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

const ATALHOS: { aba: string; rotulo: string; acao: Acao }[] = [
  { aba: 'mortalidade', rotulo: 'Baixa', acao: 'baixa.registrar' },
  { aba: 'pesagens', rotulo: 'Pesagem', acao: 'pesagem.registrar' },
  { aba: 'racao', rotulo: 'Ração', acao: 'racao.registrar' },
];

@Component({
  selector: 'crista-lista-lotes',
  imports: [RouterLink],
  template: `
    <header class="cabecalho-secao">
      <h1>Lotes</h1>
      @if (atual.pode('lote.cadastrar')) {
        <a class="botao" [routerLink]="atual.link('lotes', 'novo')"
          >Cadastrar lote</a
        >
      }
    </header>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (alertas().total > 0) {
      <p class="aviso" [class.atencao]="alertas().criticos === 0">
        <span>
          <strong
            >{{ alertas().criticos > 0 ? '‼' : '⚠' }}
            {{ alertas().total }}
            {{
              alertas().total === 1 ? 'alerta aberto' : 'alertas abertos'
            }}</strong
          >
          @if (alertas().criticos > 0) {
            ({{ alertas().criticos }}
            {{ alertas().criticos === 1 ? 'crítico' : 'críticos' }})
          }
        </span>
        <a class="acoes" [routerLink]="atual.link('alertas')">Ver alertas</a>
      </p>
    }

    <h2>Em andamento</h2>
    @if (carregando()) {
      <div class="lotes">
        <span class="esqueleto" style="height: 150px"></span>
        <span class="esqueleto" style="height: 150px"></span>
      </div>
    } @else {
      <div class="lotes">
        @for (lote of emAndamento(); track lote.id) {
          <article class="cartao lote">
            <div class="linha">
              <a class="codigo" [routerLink]="atual.link('lotes', lote.id)">{{
                lote.codigo
              }}</a>
              @if (alertasDoLote(lote.id); as n) {
                <span class="etiqueta critico"
                  >‼ {{ n }} {{ n === 1 ? 'alerta' : 'alertas' }}</span
                >
              }
            </div>
            <p class="suave">
              {{ lote.galpao }} · {{ nomeLinhagem[lote.linhagem] }} · alojado em
              {{ data(lote.dataAlojamento) }}
            </p>
            <p class="suave num">
              {{ numero(lote.quantidadePrevista) }} aves previstas
            </p>
            @if (atalhos().length > 0) {
              <nav
                class="acoes"
                [attr.aria-label]="'Lançar no lote ' + lote.codigo"
              >
                <span class="suave" aria-hidden="true">Lançar:</span>
                @for (a of atalhos(); track a.aba) {
                  <a
                    class="botao secundario pequeno"
                    [routerLink]="atual.link('lotes', lote.id, a.aba)"
                    >{{ a.rotulo }}</a
                  >
                }
              </nav>
            }
          </article>
        } @empty {
          <p class="suave">
            Nenhum lote em andamento.
            @if (atual.pode('lote.cadastrar')) {
              <a [routerLink]="atual.link('lotes', 'novo')"
                >Cadastre o próximo lote</a
              >
              quando os pintos chegarem.
            }
          </p>
        }
      </div>
    }

    @if (anteriores().length > 0) {
      <h2>Lotes anteriores</h2>
      <div class="tabela-moldura">
        <table class="tabela">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Galpão</th>
              <th>Linhagem</th>
              <th class="num">Alojamento</th>
              <th class="num">Aves previstas</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            @for (lote of anteriores(); track lote.id) {
              <tr>
                <td>
                  <a [routerLink]="atual.link('lotes', lote.id)">{{
                    lote.codigo
                  }}</a>
                </td>
                <td>{{ lote.galpao }}</td>
                <td>{{ nomeLinhagem[lote.linhagem] }}</td>
                <td class="num">{{ data(lote.dataAlojamento) }}</td>
                <td class="num">{{ numero(lote.quantidadePrevista) }}</td>
                <td>
                  <span
                    class="etiqueta"
                    [class.critico]="lote.situacao === 'cancelado'"
                    >{{ nomeSituacao[lote.situacao] }}</span
                  >
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: `
    h2 {
      margin-top: var(--espaco-5);
    }
    .lotes {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--espaco-4);
    }
    .lote {
      display: grid;
      gap: var(--espaco-1);
      margin: 0;
    }
    .lote p {
      margin: 0;
    }
    .linha {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--espaco-2);
    }
    .codigo {
      font-family: var(--font-titulo);
      font-size: 20px;
      line-height: 28px;
      font-weight: 600;
      color: var(--texto);
      text-decoration: none;
    }
    .codigo:hover {
      color: var(--primaria);
      text-decoration: underline;
    }
    .lote .acoes {
      margin-top: var(--espaco-3);
    }
    @media (max-width: 640px) {
      .lotes {
        grid-template-columns: 1fr;
      }
      .lote .acoes .botao {
        flex: 1 1 auto;
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
  protected readonly carregando = signal(true);
  /** Alertas abertos da fazenda, em destaque no topo da entrada. */
  protected readonly alertas = computed(() => {
    const abertos = this.atual.alertasAbertos();
    return {
      total: abertos.length,
      criticos: abertos.filter((a) => a.criticidade === 'critico').length,
    };
  });
  protected readonly emAndamento = computed(() =>
    this.lotes().filter((l) => l.situacao === 'em_andamento'),
  );
  /** Lançamentos que o perfil pode fazer, como atalhos na lista. */
  protected readonly atalhos = computed(() =>
    ATALHOS.filter((a) => this.atual.pode(a.acao)),
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
    } finally {
      this.carregando.set(false);
    }
  }

  protected alertasDoLote(id: string): number {
    return this.atual.alertasAbertos().filter((a) => a.loteId === id).length;
  }
}
