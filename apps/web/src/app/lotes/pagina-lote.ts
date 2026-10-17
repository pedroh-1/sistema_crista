import {
  computed,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Indicador, NOME_LINHAGEM, NOME_SEXAGEM } from '@crista/domain';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { ROTULO_CRITICIDADE } from '../nucleo/alertas';
import { CartaoIndicador } from '../nucleo/cartao-indicador';
import { mensagemErro } from '../nucleo/erros';
import {
  formatarData,
  formatarIndicador,
  formatarNumero,
} from '../nucleo/formato';
import {
  CLASSE_SITUACAO_META,
  ICONE_SITUACAO_META,
  NOME_SITUACAO_META,
} from './situacao-meta';
import { FormAlojamento } from './form-alojamento';
import { LoteAtual } from './lote-atual';

@Component({
  selector: 'crista-pagina-lote',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    FormAlojamento,
    CartaoIndicador,
  ],
  providers: [LoteAtual],
  template: `
    <nav class="trilha" aria-label="Caminho">
      <a [routerLink]="fazenda.link('lotes')">Lotes</a>
      @if (atual.lote(); as lote) {
        <span aria-hidden="true">/</span><span>{{ lote.codigo }}</span>
      }
    </nav>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (atual.lote(); as lote) {
      <header class="cabecalho-secao">
        <div>
          <h1>Lote {{ lote.codigo }}</h1>
          <span class="suave">
            {{ lote.galpao.identificacao }} · {{ nomeLinhagem[lote.linhagem] }}
            {{ nomeSexagem[lote.sexagem] }} · alojado em
            {{ data(lote.dataAlojamento) }}
            @if (lote.alojamento) {
              · <strong class="num">{{ lote.resumo.idadeDias }} dias</strong>
            }
          </span>
        </div>
        @if (!atual.emAndamento()) {
          <span class="etiqueta" [class.critico]="lote.situacao === 'cancelado'"
            >{{ lote.situacao === 'cancelado' ? 'Cancelado' : 'Encerrado' }}: só
            consulta</span
          >
        }
      </header>

      @for (a of alertasDoLote(); track a.id) {
        <p
          class="aviso"
          [class.atencao]="a.criticidade === 'atencao'"
          role="alert"
        >
          <span
            ><strong>{{ rotuloCriticidade[a.criticidade] }}:</strong>
            {{ a.mensagem }}.</span
          >
          <a class="acoes" [routerLink]="fazenda.link('alertas')"
            >Ver alertas</a
          >
        </p>
      }
      @if (lote.resumo.carenciaAte) {
        <p class="aviso atencao">
          ⚠ Aves em período de carência até
          {{ data(lote.resumo.carenciaAte) }}: não podem ser abatidas antes
          disso.
        </p>
      }
      <!-- Aviso imediato; some quando o alerta formal (UC16) do dia já existe -->
      @if (!temAlertaMortalidade() && tomMortalidade(); as tom) {
        <p class="aviso" [class.atencao]="tom === 'atencao'">
          {{ rotuloCriticidade[tom] }}: mortalidade de hoje em
          {{ ind(lote.resumo.mortalidadeHoje.percentual, 2, ' %') }}.
        </p>
      }

      @if (lote.alojamento) {
        <section class="indicadores" aria-label="Indicadores do lote">
          <crista-cartao-indicador
            nome="Saldo de aves"
            [valor]="lote.resumo.saldoAves"
          >
            de {{ num(lote.resumo.avesAlojadas) }} alojadas ·
            {{ num(lote.resumo.baixasAcumuladas) }} baixas
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Mortalidade"
            [valor]="lote.resumo.mortalidade"
            [casas]="2"
            unidade="%"
            [tom]="tomMortalidade()"
          >
            @if (tomMortalidade(); as tom) {
              <span class="etiqueta" [class]="tom">{{
                rotuloCriticidade[tom]
              }}</span>
            }
            hoje {{ ind(lote.resumo.mortalidadeHoje.percentual, 2, ' %') }}
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Peso médio"
            [valor]="lote.resumo.pesoMedioG"
            unidade="g"
          >
            @if (lote.meta.situacao) {
              <span
                class="etiqueta"
                [class]="classeSituacao[lote.meta.situacao]"
                >{{ iconeSituacao[lote.meta.situacao] }}
                {{ nomeSituacao[lote.meta.situacao] }}</span
              >
            }
            @if (lote.meta.pesoPadraoG) {
              padrão {{ num(lote.meta.pesoPadraoG) }} g
            }
            @if (lote.meta.desvioCurva.disponivel) {
              ({{ ind(lote.meta.desvioCurva, 1, ' %') }})
            }
            @if (lote.resumo.ultimaPesagem) {
              · {{ data(lote.resumo.ultimaPesagem) }}
            }
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Uniformidade"
            [valor]="lote.resumo.uniformidade"
            [casas]="1"
            unidade="%"
          >
            na última pesagem
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Conversão alimentar"
            [valor]="lote.resumo.conversaoAlimentar"
            [casas]="3"
          >
            @if (lote.meta.caPadrao.disponivel) {
              padrão {{ ind(lote.meta.caPadrao, 3) }}
            }
          </crista-cartao-indicador>
          <crista-cartao-indicador nome="IEP" [valor]="lote.resumo.iep">
            índice de eficiência produtiva
          </crista-cartao-indicador>
        </section>

        <dl class="detalhes cartao">
          @for (d of detalhes; track d.rotulo) {
            <div [title]="motivo(lote.resumo[d.chave])">
              <dt>{{ d.rotulo }}</dt>
              <dd class="num">
                {{ ind(lote.resumo[d.chave], d.casas, d.unidade) }}
              </dd>
            </div>
          }
          <div>
            <dt>Alojamento</dt>
            <dd class="num">
              {{ num(lote.alojamento.avesRecebidas) }} aves em
              {{ data(lote.alojamento.data) }}
              @if (lote.alojamento.mortasTransporte > 0) {
                · {{ num(lote.alojamento.mortasTransporte) }} mortas no
                transporte
              }
            </dd>
          </div>
        </dl>
      } @else if (atual.emAndamento()) {
        <crista-form-alojamento />
      }

      <nav class="abas" aria-label="Áreas do lote">
        <a routerLink="mortalidade" routerLinkActive="ativa">Mortalidade</a>
        <a routerLink="pesagens" routerLinkActive="ativa">Pesagens</a>
        <a routerLink="sanidade" routerLinkActive="ativa"
          >Sanidade
          @if (lote.resumo.carenciaAte) {
            <span class="etiqueta atencao">Carência</span>
          }
        </a>
        <a routerLink="racao" routerLinkActive="ativa">Ração</a>
        <a routerLink="curva" routerLinkActive="ativa">Curva de peso</a>
        @if (fazenda.pode('financeiro.ver')) {
          <a routerLink="custos" routerLinkActive="ativa">Custos</a>
        }
        <a routerLink="encerramento" routerLinkActive="ativa"
          >Saída e encerramento</a
        >
      </nav>
      <router-outlet />
    } @else if (!erro()) {
      <span class="esqueleto" style="height: 34px; width: 240px"></span>
      <div class="indicadores" style="margin-top: 24px">
        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
          <span class="esqueleto" style="height: 110px"></span>
        }
      </div>
    }
  `,
  styles: `
    .detalhes {
      display: flex;
      flex-wrap: wrap;
      gap: var(--espaco-3) var(--espaco-6);
      padding: var(--espaco-4) var(--espaco-5);
      margin: 0 0 var(--espaco-6);
    }
    .detalhes dt {
      font-size: 13px;
      color: var(--texto-suave);
    }
    .detalhes dd {
      margin: 0;
      font-weight: 600;
    }
  `,
})
export class PaginaLote {
  protected readonly atual = inject(LoteAtual);
  protected readonly fazenda = inject(FazendaAtual);
  protected readonly rotuloCriticidade = ROTULO_CRITICIDADE;
  protected readonly temAlertaMortalidade = computed(() =>
    this.alertasDoLote().some((a) => a.indicador === 'mortalidade_dia'),
  );
  protected readonly alertasDoLote = computed(() =>
    this.fazenda
      .alertasAbertos()
      .filter((a) => a.loteId === this.atual.lote()?.id),
  );
  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly nomeSexagem = NOME_SEXAGEM;
  protected readonly nomeSituacao = NOME_SITUACAO_META;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly ind = formatarIndicador;
  protected readonly erro = signal('');

  protected readonly classeSituacao = CLASSE_SITUACAO_META;
  protected readonly iconeSituacao = ICONE_SITUACAO_META;
  /** Nível da mortalidade de hoje, quando pede atenção. */
  protected readonly tomMortalidade = computed(() => {
    const nivel = this.atual.lote()?.resumo.mortalidadeHoje.nivel;
    return nivel === 'critico' || nivel === 'atencao' ? nivel : null;
  });

  /** Indicadores de apoio, numa linha só abaixo dos cartões. */
  protected readonly detalhes = [
    { rotulo: 'Viabilidade', chave: 'viabilidade', casas: 2, unidade: ' %' },
    { rotulo: 'GPD médio', chave: 'gpdMedioG', casas: 1, unidade: ' g/dia' },
    {
      rotulo: 'Ração consumida',
      chave: 'racaoConsumidaKg',
      casas: 0,
      unidade: ' kg',
    },
    {
      rotulo: 'Peso vivo em estoque',
      chave: 'pesoVivoEstoqueKg',
      casas: 0,
      unidade: ' kg',
    },
    {
      rotulo: 'Densidade',
      chave: 'densidadeKgM2',
      casas: 1,
      unidade: ' kg/m²',
    },
  ] as const;

  readonly idLote = input.required<string>();

  constructor() {
    effect(() => {
      const id = this.idLote();
      this.erro.set('');
      this.atual.carregar(id).catch((e) => this.erro.set(mensagemErro(e)));
    });
  }

  protected motivo(i: Indicador): string {
    return i.disponivel ? '' : i.motivo;
  }
}
