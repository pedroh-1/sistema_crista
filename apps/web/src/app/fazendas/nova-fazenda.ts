import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fazendaSchema } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { Sessao } from '../nucleo/sessao';

@Component({
  selector: 'crista-nova-fazenda',
  imports: [FormsModule, RouterLink],
  template: `
    <main class="pagina">
      <p><a routerLink="/fazendas">← Minhas fazendas</a></p>
      <h1>Cadastrar fazenda</h1>
      <form class="cartao formulario" (ngSubmit)="enviar()">
        @if (erro()) {
          <p class="aviso" role="alert">{{ erro() }}</p>
        }
        <label>
          Nome da fazenda
          <input name="nome" [(ngModel)]="dados.nome" />
          @if (erros()['nome']) {
            <span class="erro-campo">{{ erros()['nome'] }}</span>
          }
        </label>
        <label>
          CPF ou CNPJ do produtor
          <input
            name="documento"
            inputmode="numeric"
            [(ngModel)]="dados.documento"
          />
          @if (erros()['documento']) {
            <span class="erro-campo">{{ erros()['documento'] }}</span>
          }
        </label>
        <label>
          Endereço (opcional)
          <input name="logradouro" [(ngModel)]="dados.logradouro" />
        </label>
        <div class="grade-2">
          <label>
            Município
            <input name="municipio" [(ngModel)]="dados.municipio" />
            @if (erros()['municipio']) {
              <span class="erro-campo">{{ erros()['municipio'] }}</span>
            }
          </label>
          <label>
            UF
            <input name="uf" maxlength="2" [(ngModel)]="dados.uf" />
            @if (erros()['uf']) {
              <span class="erro-campo">{{ erros()['uf'] }}</span>
            }
          </label>
        </div>
        <label>
          Integradora (opcional)
          <input name="integradora" [(ngModel)]="dados.integradora" />
        </label>
        <p class="suave">
          Tipo de criação: frango de corte. Você será o Gestor da fazenda.
        </p>
        <button type="submit" [disabled]="enviando()">
          {{ enviando() ? 'Salvando…' : 'Cadastrar fazenda' }}
        </button>
      </form>
    </main>
  `,
})
export class NovaFazenda {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly sessao = inject(Sessao);

  protected dados = {
    nome: '',
    documento: '',
    logradouro: '',
    municipio: '',
    uf: '',
    integradora: '',
  };
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  async enviar(): Promise<void> {
    const v = validar(fazendaSchema, this.dados);
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      const fazenda = await firstValueFrom(
        this.http.post<{ id: string }>('/api/fazendas', v.dados),
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
