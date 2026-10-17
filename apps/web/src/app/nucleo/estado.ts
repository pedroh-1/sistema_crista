import { Component, computed, input } from '@angular/core';
import { Tom } from '@crista/domain';
import { Icone, NomeIcone } from './icone';

/** Ícone e texto padrão de cada tom: estado nunca só por cor. */
export const ICONE_TOM: Record<Exclude<Tom, 'neutro'>, NomeIcone> = {
  sucesso: 'ok',
  atencao: 'atencao',
  critico: 'critico',
};

export const ROTULO_TOM: Record<Exclude<Tom, 'neutro'>, string> = {
  sucesso: 'Dentro do limite',
  atencao: 'Atenção',
  critico: 'Crítico',
};

/**
 * Selo de estado (verde, âmbar ou vermelho) com ícone e texto. Tom neutro não
 * desenha nada: sem regra por trás, o indicador não é classificado.
 */
@Component({
  selector: 'crista-estado',
  imports: [Icone],
  template: `
    @if (icone(); as i) {
      <span class="etiqueta" [class]="tom()">
        <crista-icone [nome]="i" [tamanho]="13" />
        {{ texto() || rotulo() }}
      </span>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class Estado {
  readonly tom = input.required<Tom | null>();
  /** Texto do selo; sem ele, o rótulo padrão do tom. */
  readonly texto = input('');

  protected readonly icone = computed(() => {
    const t = this.tom();
    return t && t !== 'neutro' ? ICONE_TOM[t] : null;
  });
  protected readonly rotulo = computed(() => {
    const t = this.tom();
    return t && t !== 'neutro' ? ROTULO_TOM[t] : '';
  });
}
