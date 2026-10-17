import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { Tom } from '@crista/domain';
import { Estado } from './estado';

export interface BarraGrafico {
  id: string;
  rotulo: string;
  /** Linha de apoio sob o rótulo (galpão, situação). */
  detalhe?: string;
  /** Nulo quando o indicador não tem valor; o `motivo` explica. */
  valor: number | null;
  /** Valor já formatado, na ponta da barra. */
  texto: string;
  motivo?: string;
  /** Estado pela regra de negócio; o selo leva ícone e texto. */
  tom?: Tom | null;
  estado?: string;
}

/**
 * Barras horizontais de uma medida só (skill dataviz): uma cor para todas, valor
 * na ponta, base no zero (com valores negativos, o zero fica no meio). O estado
 * vai no selo ao lado, nunca na cor da barra. Com `selecionavel`, cada linha é
 * um botão que leva ao detalhe.
 */
@Component({
  selector: 'crista-grafico-barras',
  imports: [Estado, NgTemplateOutlet],
  template: `
    @if (barras().length === 0) {
      <p class="suave vazio">{{ vazio() }}</p>
    } @else {
      <ul class="barras" role="list" [attr.aria-label]="descricao()">
        @for (b of barras(); track b.id) {
          <li>
            @if (selecionavel()) {
              <button
                type="button"
                class="linha"
                [attr.aria-label]="b.rotulo + ': ' + b.texto"
                [title]="b.motivo ?? ''"
                (click)="selecionar.emit(b.id)"
              >
                <ng-container
                  *ngTemplateOutlet="conteudo; context: { $implicit: b }"
                />
              </button>
            } @else {
              <div class="linha" [title]="b.motivo ?? ''">
                <ng-container
                  *ngTemplateOutlet="conteudo; context: { $implicit: b }"
                />
              </div>
            }
          </li>
        }
      </ul>
    }

    <ng-template #conteudo let-b>
      <span class="rotulo">
        <strong>{{ b.rotulo }}</strong>
        @if (b.detalhe) {
          <small>{{ b.detalhe }}</small>
        }
      </span>
      <span class="trilho">
        @if (temNegativo()) {
          <span class="zero" [style.left.%]="zero()"></span>
        }
        @if (b.valor !== null) {
          <span
            class="barra"
            [class.negativa]="b.valor < 0"
            [style.left.%]="inicio(b.valor)"
            [style.width.%]="largura(b.valor)"
          ></span>
        }
      </span>
      <span class="valor">
        <span class="num">{{ b.texto }}</span>
        <crista-estado [tom]="b.tom ?? null" [texto]="b.estado ?? ''" />
      </span>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }
    .barras {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 2px;
    }
    .linha {
      display: grid;
      grid-template-columns: minmax(96px, 22%) minmax(80px, 1fr) minmax(
          120px,
          auto
        );
      align-items: center;
      gap: var(--espaco-3);
      width: 100%;
      min-height: 40px;
      padding: var(--espaco-1) var(--espaco-2);
      border: 0;
      border-radius: var(--raio-sm);
      background: none;
      color: var(--texto);
      font: inherit;
      text-align: left;
    }
    button.linha {
      cursor: pointer;
    }
    button.linha:hover,
    button.linha:focus-visible {
      background: var(--superficie-2);
    }
    .rotulo {
      display: grid;
      line-height: 18px;
      min-width: 0;
    }
    .rotulo strong,
    .rotulo small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .rotulo small {
      color: var(--texto-suave);
      font-size: 12px;
    }
    .trilho {
      position: relative;
      height: 16px;
    }
    .zero {
      position: absolute;
      top: -4px;
      bottom: -4px;
      width: 1px;
      background: var(--borda-campo);
    }
    .barra {
      position: absolute;
      top: 0;
      bottom: 0;
      min-width: 2px;
      background: var(--serie-1);
      border-radius: 0 4px 4px 0;
    }
    .barra.negativa {
      border-radius: 4px 0 0 4px;
    }
    .valor {
      display: flex;
      align-items: center;
      gap: var(--espaco-2);
      flex-wrap: wrap;
      font-weight: 600;
      font-size: 14px;
    }
    .vazio {
      margin: 0;
    }
    @media (max-width: 640px) {
      .linha {
        grid-template-columns: 1fr;
        gap: var(--espaco-1);
      }
    }
  `,
})
export class GraficoBarras {
  readonly barras = input.required<BarraGrafico[]>();
  readonly descricao = input('Gráfico de barras');
  readonly vazio = input('Sem dados para mostrar.');
  readonly selecionavel = input(false);
  readonly selecionar = output<string>();

  private readonly valores = computed(() =>
    this.barras().flatMap((b) => (b.valor === null ? [] : [b.valor])),
  );
  protected readonly temNegativo = computed(() =>
    this.valores().some((v) => v < 0),
  );
  /** Domínio sempre inclui o zero, para a barra crescer da base. */
  private readonly dominio = computed(() => {
    const vs = this.valores();
    const min = Math.min(0, ...vs);
    const max = Math.max(0, ...vs);
    return { min, max: max === min ? min + 1 : max };
  });
  protected readonly zero = computed(() => this.posicao(0));

  private posicao(v: number): number {
    const { min, max } = this.dominio();
    return ((v - min) / (max - min)) * 100;
  }

  protected inicio(v: number): number {
    return Math.min(this.posicao(0), this.posicao(v));
  }

  protected largura(v: number): number {
    return Math.abs(this.posicao(v) - this.posicao(0));
  }
}
