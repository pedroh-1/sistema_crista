import { Component, computed, input } from '@angular/core';
import { Indicador } from '@crista/domain';
import { formatarNumero } from './formato';

/**
 * Cartão de indicador (Design System, CartaoIndicador): nome, valor com unidade e a linha de
 * referência projetada no conteúdo. Indicador indisponível mostra `—` e o motivo da API.
 */
@Component({
  selector: 'crista-cartao-indicador',
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
  /** Destaque quando o indicador passou do limite; no máximo um ou dois por tela. */
  readonly tom = input<'critico' | 'atencao' | null>(null);
  /** Motivo quando `valor` é um número ausente (null). */
  readonly semValor = input('Sem dado');

  protected readonly disponivel = computed(() => {
    const v = this.valor();
    return typeof v === 'number' || (v !== null && v.disponivel);
  });

  protected readonly texto = computed(() => {
    const v = this.valor();
    if (typeof v === 'number') return formatarNumero(v, this.casas());
    return v?.disponivel ? formatarNumero(v.valor, this.casas()) : '—';
  });

  protected readonly motivo = computed(() => {
    const v = this.valor();
    if (v === null) return this.semValor();
    return typeof v === 'number' || v.disponivel ? '' : v.motivo;
  });
}
