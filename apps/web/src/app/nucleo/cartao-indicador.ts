import { Component, computed, input } from '@angular/core';
import { Indicador, Tom } from '@crista/domain';
import { Estado } from './estado';
import { formatarNumero } from './formato';

/**
 * Cartão de indicador (Design System, CartaoIndicador): nome, valor com unidade e a linha de
 * referência projetada no conteúdo. Indicador indisponível mostra `—` e o motivo da API.
 * Com `tom`, o selo de estado (ícone + texto) abre a linha de referência; atenção e
 * crítico ainda destacam a borda, e o verde fica só no selo, para a tela seguir calma.
 */
@Component({
  selector: 'crista-cartao-indicador',
  imports: [Estado],
  host: {
    class: 'indicador',
    '[class.sem-valor]': '!disponivel()',
    '[class.critico]': "tom() === 'critico'",
    '[class.atencao]': "tom() === 'atencao'",
    '[attr.title]': 'motivo() || null',
  },
  template: `
    <span class="nome">{{ nome() }}</span>
    <span class="valor"
      >{{ texto() }}
      @if (disponivel() && unidade()) {
        <small>{{ unidade() }}</small>
      }
    </span>
    <span class="meta">
      @if (motivo()) {
        {{ motivo() }}
      } @else {
        @if (tom()) {
          <crista-estado [tom]="tom()" [texto]="estado()" />
        }
        <ng-content />
      }
    </span>
  `,
})
export class CartaoIndicador {
  readonly nome = input.required<string>();
  /** Indicador calculado pela API, ou um número simples (saldo de aves). */
  readonly valor = input.required<Indicador | number | null>();
  readonly casas = input(0);
  readonly unidade = input('');
  /** Formato próprio do valor (reais, por exemplo); sem ele, número com `casas`. */
  readonly formato = input<((valor: number) => string) | null>(null);
  /** Estado pela regra de negócio (limites dos alertas, meta de peso); nulo ou neutro não classifica. */
  readonly tom = input<Tom | null>(null);
  /** Texto do selo de estado; sem ele, o rótulo padrão do tom. */
  readonly estado = input('');
  /** Motivo quando `valor` é um número ausente (null). */
  readonly semValor = input('Sem dado');

  protected readonly disponivel = computed(() => {
    const v = this.valor();
    return typeof v === 'number' || (v !== null && v.disponivel);
  });

  protected readonly texto = computed(() => {
    const v = this.valor();
    const n = typeof v === 'number' ? v : v?.disponivel ? v.valor : null;
    if (n === null) return '—';
    return this.formato()?.(n) ?? formatarNumero(n, this.casas());
  });

  protected readonly motivo = computed(() => {
    const v = this.valor();
    if (v === null) return this.semValor();
    return typeof v === 'number' || v.disponivel ? '' : v.motivo;
  });
}
