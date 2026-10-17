import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { DialogosHost } from './nucleo/dialogos';
import { Sessao } from './nucleo/sessao';

@Component({
  imports: [RouterLink, RouterOutlet, DialogosHost],
  selector: 'crista-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly sessao = inject(Sessao);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Dentro da fazenda o menu lateral faz o papel do topo (marca e sair). */
  protected readonly dentroDaFazenda = computed(() =>
    /^\/fazendas\/(?!nova(?:[/?#]|$))[^/?#]+/.test(this.url()),
  );
}
