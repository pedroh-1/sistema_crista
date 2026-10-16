import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NOME_PERFIL, Perfil } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { mensagemErro } from '../nucleo/erros';
import { Sessao } from '../nucleo/sessao';

interface DadosConvite {
  fazenda: string;
  perfil: Perfil;
  email: string;
  expirado: boolean;
}

@Component({
  selector: 'crista-convite',
  imports: [RouterLink],
  template: `
    <main class="pagina-estreita">
      <h1>Convite</h1>
      <div class="cartao">
        @if (erro()) {
          <p class="alerta" role="alert">{{ erro() }}</p>
        }
        @if (convite(); as c) {
          <p>
            Você foi convidado para a fazenda
            <strong>{{ c.fazenda }}</strong> como
            <strong>{{ nomePerfil[c.perfil] }}</strong
            >.
          </p>
          @if (c.expirado) {
            <p class="alerta">
              Este convite expirou. Peça um novo ao Gestor da fazenda.
            </p>
          } @else if (sessao.logado()) {
            @if (sessao.usuario()?.email === c.email) {
              <button type="button" (click)="aceitar()" [disabled]="enviando()">
                Aceitar convite
              </button>
            } @else {
              <p class="alerta">
                O convite foi enviado para {{ c.email }}, mas você entrou como
                {{ sessao.usuario()?.email }}.
                <button
                  type="button"
                  class="secundario"
                  (click)="sessao.sair()"
                >
                  Sair
                </button>
              </p>
            }
          } @else {
            <p class="suave">
              Para aceitar, entre ou crie uma conta com o e-mail {{ c.email }}.
            </p>
            <p>
              <a
                class="botao"
                routerLink="/entrar"
                [queryParams]="{ voltar: urlAtual }"
                >Entrar</a
              >
              &nbsp;
              <a
                class="botao secundario"
                routerLink="/cadastro"
                [queryParams]="{ voltar: urlAtual }"
                >Criar conta</a
              >
            </p>
          }
        } @else if (!erro()) {
          <p>Carregando convite…</p>
        }
      </div>
    </main>
  `,
})
export class Convite implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly sessao = inject(Sessao);

  readonly token = input<string>();

  protected readonly nomePerfil = NOME_PERFIL;
  protected readonly convite = signal<DadosConvite | null>(null);
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);
  protected readonly urlAtual = this.router.url;

  async ngOnInit(): Promise<void> {
    try {
      if (this.sessao.logado() && !this.sessao.usuario())
        await this.sessao.carregar();
      this.convite.set(
        await firstValueFrom(
          this.http.post<DadosConvite>('/api/convites/consultar', {
            token: this.token() ?? '',
          }),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  async aceitar(): Promise<void> {
    this.enviando.set(true);
    try {
      const fazenda = await firstValueFrom(
        this.http.post<{ id: string }>('/api/convites/aceitar', {
          token: this.token(),
        }),
      );
      await this.sessao.carregar();
      await this.router.navigate(['/fazendas', fazenda.id]);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
