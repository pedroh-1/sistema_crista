import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { loginSchema } from '@crista/domain';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { Sessao } from '../nucleo/sessao';

@Component({
  selector: 'crista-entrar',
  imports: [FormsModule, RouterLink, PrimeiroCampo],
  template: `
    <main class="pagina-estreita">
      <h1>Entrar no CRISTA</h1>
      <p class="suave">Gestão de lotes de frango de corte.</p>
      <form class="cartao formulario" (ngSubmit)="enviar()">
        @if (erro()) {
          <p class="aviso" role="alert">{{ erro() }}</p>
        }
        <label>
          E-mail
          <input
            cristaPrimeiroCampo
            type="email"
            name="email"
            autocomplete="email"
            [(ngModel)]="email"
          />
          @if (erros()['email']) {
            <span class="erro-campo">{{ erros()['email'] }}</span>
          }
        </label>
        <label>
          Senha
          <input
            type="password"
            name="senha"
            autocomplete="current-password"
            [(ngModel)]="senha"
          />
        </label>
        <button type="submit" [disabled]="enviando()">
          {{ enviando() ? 'Entrando…' : 'Entrar' }}
        </button>
      </form>
      <p class="suave">
        Ainda não tem conta?
        <a routerLink="/cadastro" [queryParams]="{ voltar: voltar() }"
          >Criar conta</a
        >
      </p>
    </main>
  `,
})
export class Entrar {
  private readonly sessao = inject(Sessao);
  private readonly router = inject(Router);

  /** Página para onde voltar depois do login (query param). */
  readonly voltar = input<string>();

  protected email = '';
  protected senha = '';
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  async enviar(): Promise<void> {
    const v = validar(loginSchema, { email: this.email, senha: this.senha });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      await this.sessao.entrar(v.dados.email, v.dados.senha);
      await this.router.navigateByUrl(this.voltar() || '/fazendas');
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
