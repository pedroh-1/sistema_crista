import { afterNextRender, Directive, ElementRef, inject } from '@angular/core';

/**
 * Primeiro campo de um formulário de lançamento (Design System, Campo): recebe o foco quando a
 * tela abre e volta a recebê-lo depois de cada envio, para o próximo lançamento.
 */
@Directive({ selector: '[cristaPrimeiroCampo]' })
export class PrimeiroCampo {
  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => this.focar());
  }

  focar(): void {
    this.elemento.nativeElement.focus({ preventScroll: true });
  }
}
