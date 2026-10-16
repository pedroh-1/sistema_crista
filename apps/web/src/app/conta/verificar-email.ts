import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { mensagemErro } from '../nucleo/erros';

@Component({
  selector: 'crista-verificar-email',
  imports: [RouterLink],
  template: `
    <main class="pagina-estreita">
      <h1>Confirmação de e-mail</h1>
      <div class="cartao">
        @switch (estado()) {
          @case ('verificando') {
            <p>Confirmando seu e-mail…</p>
          }
          @case ('ok') {
            <p class="alerta sucesso" role="status">
              E-mail confirmado. Sua conta está ativa.
            </p>
            <p><a class="botao" routerLink="/entrar">Entrar</a></p>
          }
          @default {
            <p class="alerta" role="alert">{{ erro() }}</p>
          }
        }
      </div>
    </main>
  `,
})
export class VerificarEmail implements OnInit {
  private readonly http = inject(HttpClient);

  readonly token = input<string>();

  protected readonly estado = signal<'verificando' | 'ok' | 'erro'>(
    'verificando',
  );
  protected readonly erro = signal('');

  async ngOnInit(): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post('/api/auth/verificar-email', {
          token: this.token() ?? '',
        }),
      );
      this.estado.set('ok');
    } catch (e) {
      this.erro.set(mensagemErro(e));
      this.estado.set('erro');
    }
  }
}
