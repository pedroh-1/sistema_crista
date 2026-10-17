import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fazendaSchema } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { Sessao } from '../nucleo/sessao';

@Component({
  selector: 'crista-nova-fazenda',
  imports: [FormsModule, RouterLink, PrimeiroCampo],
  template: `
    <main class="pagina estreita">
      <nav class="trilha" aria-label="Caminho">
        <a routerLink="/fazendas">Minhas fazendas</a>
        <span aria-hidden="true">/</span><span>Cadastrar fazenda</span>
      </nav>
      <h1>Cadastrar fazenda</h1>
      <form class="cartao formulario" (ngSubmit)="enviar()">
        @if (erro()) {
          <p class="aviso" role="alert">{{ erro() }}</p>
        }
        <div class="linha-campos">
          <label>
            Nome da fazenda
            <input cristaPrimeiroCampo name="nome" [(ngModel)]="dados.nome" />
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
        </div>
        <label>
          Endereço (opcional)
          <input name="logradouro" [(ngModel)]="dados.logradouro" />
        </label>
        <div class="linha-campos local">
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
        <span class="ajuda"
          >Tipo de criação: frango de corte. Você será o Gestor da
          fazenda.</span
        >
        <div>
          <button type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Salvando…' : 'Cadastrar fazenda' }}
          </button>
        </div>
      </form>
    </main>
  `,
  styles: `
    .estreita {
      max-width: 800px;
    }
    .local {
      grid-template-columns: minmax(0, 1fr) 96px;
    }
    .local input[name='uf'] {
      text-transform: uppercase;
    }
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
