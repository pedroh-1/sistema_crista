import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { conviteSchema, NOME_PERFIL, Perfil, PERFIS } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Dialogos } from '../nucleo/dialogos';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { formatarData } from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { Vinculo } from '../nucleo/tipos';
import { FazendaAtual } from './fazenda-atual';

const NOME_STATUS: Record<Vinculo['status'], string> = {
  pendente: 'Convite pendente',
  ativo: 'Ativo',
  expirado: 'Expirado',
  revogado: 'Revogado',
};

const vazio = () => ({
  email: '',
  perfil: 'operador' as Perfil,
  crmv: '',
  validoAte: '',
  galpoes: [] as string[],
});

@Component({
  selector: 'crista-equipe',
  imports: [FormsModule, PrimeiroCampo],
  template: `
    <header class="cabecalho-secao">
      <h1>Equipe</h1>
      @if (!formAberto()) {
        <button type="button" (click)="formAberto.set(true)">
          Convidar pessoa
        </button>
      }
    </header>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (aviso()) {
      <p class="aviso sucesso" role="status">✓ {{ aviso() }}</p>
    }
    @if (formAberto()) {
      <form class="cartao formulario" (ngSubmit)="convidar()">
        <div class="cabecalho-secao">
          <h3>Convidar pessoa</h3>
          <span class="suave">O convite vale por 7 dias.</span>
        </div>
        <div class="linha-campos">
          <label>
            E-mail
            <input
              cristaPrimeiroCampo
              type="email"
              name="email"
              [(ngModel)]="dados.email"
            />
            @if (erros()['email']) {
              <span class="erro-campo">{{ erros()['email'] }}</span>
            }
          </label>
          <label>
            Perfil
            <select name="perfil" [(ngModel)]="dados.perfil">
              @for (perfil of perfis; track perfil) {
                <option [value]="perfil">{{ nomePerfil[perfil] }}</option>
              }
            </select>
          </label>
          @if (dados.perfil === 'veterinario') {
            <label>
              CRMV
              <input
                name="crmv"
                placeholder="Ex.: SC-01234"
                [(ngModel)]="dados.crmv"
              />
              @if (erros()['crmv']) {
                <span class="erro-campo">{{ erros()['crmv'] }}</span>
              }
            </label>
          }
          <label>
            Acesso válido até (opcional)
            <input type="date" name="validoAte" [(ngModel)]="dados.validoAte" />
            @if (erros()['validoAte']) {
              <span class="erro-campo">{{ erros()['validoAte'] }}</span>
            }
          </label>
        </div>
        @if (atual.galpoes().length > 0) {
          <fieldset>
            <legend>Galpões permitidos (nenhum marcado = todos)</legend>
            <div class="opcoes">
              @for (g of atual.galpoes(); track g.id) {
                <label class="opcao">
                  <input
                    type="checkbox"
                    [checked]="dados.galpoes.includes(g.id)"
                    (change)="alternarGalpao(g.id)"
                  />
                  {{ g.identificacao }}
                </label>
              }
            </div>
          </fieldset>
        }
        <div class="acoes">
          <button type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Enviando…' : 'Enviar convite' }}
          </button>
          <button
            type="button"
            class="fantasma"
            (click)="formAberto.set(false)"
          >
            Cancelar
          </button>
        </div>
      </form>
    }

    <div class="tabela-moldura">
      <table class="tabela">
        <thead>
          <tr>
            <th>Pessoa</th>
            <th>Perfil</th>
            <th>Galpões</th>
            <th class="num">Validade</th>
            <th>Situação</th>
            <th class="acao"><span class="visivel-leitor">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          @for (v of vinculos(); track v.id) {
            <tr>
              <td>
                {{ v.nome ?? v.email }}
                @if (v.nome) {
                  <span class="secundaria">{{ v.email }}</span>
                }
              </td>
              <td>
                {{ nomePerfil[v.perfil] }}
                @if (v.crmv) {
                  <span class="secundaria">CRMV {{ v.crmv }}</span>
                }
              </td>
              <td>{{ nomesGalpoes(v.galpoes) }}</td>
              <td class="num">{{ data(v.validoAte) }}</td>
              <td>
                <span class="etiqueta" [class]="v.status">{{
                  nomeStatus[v.status]
                }}</span>
              </td>
              <td class="acao">
                @if (v.status === 'ativo' || v.status === 'pendente') {
                  <button
                    type="button"
                    class="fantasma pequeno"
                    (click)="revogar(v)"
                  >
                    Revogar
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .secundaria {
      display: block;
      font-size: 13px;
      color: var(--texto-suave);
    }
  `,
})
export class Equipe implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(Dialogos);
  protected readonly atual = inject(FazendaAtual);

  protected readonly perfis = PERFIS;
  protected readonly nomePerfil = NOME_PERFIL;
  protected readonly nomeStatus = NOME_STATUS;
  protected readonly data = formatarData;
  protected readonly formAberto = signal(false);
  protected dados = vazio();
  protected readonly vinculos = signal<Vinculo[]>([]);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly enviando = signal(false);

  ngOnInit(): Promise<void> {
    return this.carregar();
  }

  alternarGalpao(id: string): void {
    const atuais = this.dados.galpoes;
    this.dados.galpoes = atuais.includes(id)
      ? atuais.filter((g) => g !== id)
      : [...atuais, id];
  }

  nomesGalpoes(ids: string[]): string {
    if (ids.length === 0) return 'Todos';
    const nomes = new Map(
      this.atual.galpoes().map((g) => [g.id, g.identificacao]),
    );
    return ids.map((id) => nomes.get(id) ?? '?').join(', ');
  }

  async convidar(): Promise<void> {
    const v = validar(conviteSchema, {
      ...this.dados,
      crmv: this.dados.perfil === 'veterinario' ? this.dados.crmv : undefined,
      validoAte: this.dados.validoAte || undefined,
    });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    this.aviso.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.atual.url()}/vinculos`, v.dados),
      );
      this.aviso.set(`Convite enviado para ${v.dados.email}.`);
      this.dados = vazio();
      this.formAberto.set(false);
      await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async revogar(v: Vinculo): Promise<void> {
    const confirmou = await this.dialogos.confirmar({
      titulo: `Revogar o acesso de ${v.nome ?? v.email}?`,
      mensagem:
        'A pessoa deixa de ver a fazenda na hora. Para voltar, envie um novo convite.',
      acao: 'Revogar acesso',
      perigo: true,
    });
    if (!confirmou) return;
    this.erro.set('');
    this.aviso.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.atual.url()}/vinculos/${v.id}/revogar`, {}),
      );
      await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  private async carregar(): Promise<void> {
    try {
      this.vinculos.set(
        await firstValueFrom(
          this.http.get<Vinculo[]>(`${this.atual.url()}/vinculos`),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
