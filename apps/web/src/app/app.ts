import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Sessao } from './nucleo/sessao';

@Component({
  imports: [RouterLink, RouterOutlet],
  selector: 'crista-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly sessao = inject(Sessao);
}
