import { HttpClient } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { cadastroUsuarioSchema } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';

@Component({
  selector: 'crista-cadastro',
  imports: [FormsModule, RouterLink, PrimeiroCampo],
  template: `
    <main class="pagina-estreita">
      <h1>Criar conta</h1>
      @if (emailEnviado()) {
        <div class="cartao">
          <p class="aviso sucesso" role="status">✓ Conta criada.</p>
          <p>
            Enviamos um link de confirmação para
            <strong>{{ emailEnviado() }}</strong
            >. Abra o link para ativar a conta e depois
            <a routerLink="/entrar" [queryParams]="{ voltar: voltar() }"
              >entre</a
            >.
          </p>
        </div>
      } @else {
        <form class="cartao formulario" (ngSubmit)="enviar()">
          @if (erro()) {
            <p class="aviso" role="alert">{{ erro() }}</p>
          }
          <label>
            Nome completo
            <input
              cristaPrimeiroCampo
              name="nome"
              autocomplete="name"
              [(ngModel)]="dados.nome"
            />
            @if (erros()['nome']) {
              <span class="erro-campo">{{ erros()['nome'] }}</span>
            }
          </label>
          <label>
            E-mail
            <input
              type="email"
              name="email"
              autocomplete="email"
              [(ngModel)]="dados.email"
            />
            @if (erros()['email']) {
              <span class="erro-campo">{{ erros()['email'] }}</span>
            }
          </label>
          <div class="grade-2">
            <label>
              Telefone (opcional)
              <input
                name="telefone"
                autocomplete="tel"
                [(ngModel)]="dados.telefone"
              />
            </label>
            <label>
              CPF (opcional)
              <input name="cpf" inputmode="numeric" [(ngModel)]="dados.cpf" />
              @if (erros()['cpf']) {
                <span class="erro-campo">{{ erros()['cpf'] }}</span>
              }
            </label>
          </div>
          <label>
            Senha
            <input
              type="password"
              name="senha"
              autocomplete="new-password"
              [(ngModel)]="dados.senha"
            />
            <span class="ajuda">8 ou mais caracteres, com letra e número.</span>
            @if (erros()['senha']) {
              <span class="erro-campo">{{ erros()['senha'] }}</span>
            }
          </label>
          <label class="caixa">
            <input
              type="checkbox"
              name="aceite"
              [(ngModel)]="dados.aceiteTermos"
            />
            Li e aceito os termos de uso e a política de privacidade
          </label>
          @if (erros()['aceiteTermos']) {
            <span class="erro-campo">{{ erros()['aceiteTermos'] }}</span>
          }
          <div>
            <button type="submit" [disabled]="enviando()">
              {{ enviando() ? 'Criando…' : 'Criar conta' }}
            </button>
          </div>
        </form>
        <p class="suave">
          Já tem conta?
          <a routerLink="/entrar" [queryParams]="{ voltar: voltar() }"
            >Entrar</a
          >
        </p>
      }
    </main>
  `,
})
export class Cadastro {
  private readonly http = inject(HttpClient);

  readonly voltar = input<string>();

  protected dados = {
    nome: '',
    email: '',
    telefone: '',
    cpf: '',
    senha: '',
    aceiteTermos: false,
  };
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);
  protected readonly emailEnviado = signal('');

  async enviar(): Promise<void> {
    const v = validar(cadastroUsuarioSchema, this.dados);
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      await firstValueFrom(this.http.post('/api/auth/cadastro', v.dados));
      this.emailEnviado.set(v.dados.email);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
