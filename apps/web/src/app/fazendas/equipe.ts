import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { conviteSchema, NOME_PERFIL, Perfil, PERFIS } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Dialogos } from '../nucleo/dialogos';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
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
  imports: [FormsModule, DatePipe],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (aviso()) {
      <p class="aviso sucesso" role="status">{{ aviso() }}</p>
    }
    <section class="cartao">
      <h2>Convidar pessoa</h2>
      <form class="formulario" (ngSubmit)="convidar()">
        <div class="grade-2">
          <label>
            E-mail
            <input type="email" name="email" [(ngModel)]="dados.email" />
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
            <legend class="suave">
              Galpões permitidos (nenhum marcado = todos)
            </legend>
            @for (g of atual.galpoes(); track g.id) {
              <label class="caixa">
                <input
                  type="checkbox"
                  [checked]="dados.galpoes.includes(g.id)"
                  (change)="alternarGalpao(g.id)"
                />
                {{ g.identificacao }}
              </label>
            }
          </fieldset>
        }
        <div>
          <button type="submit" [disabled]="enviando()">Enviar convite</button>
          <span class="suave">&nbsp;O convite vale por 7 dias.</span>
        </div>
      </form>
    </section>

    <section class="cartao">
      <h2>Pessoas com acesso</h2>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Perfil</th>
              <th>Galpões</th>
              <th>Validade</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (v of vinculos(); track v.id) {
              <tr>
                <td>
                  {{ v.nome ?? v.email }}
                  @if (v.nome) {
                    <br /><span class="suave">{{ v.email }}</span>
                  }
                </td>
                <td>
                  {{ nomePerfil[v.perfil] }}
                  @if (v.crmv) {
                    <br /><span class="suave">CRMV {{ v.crmv }}</span>
                  }
                </td>
                <td>{{ nomesGalpoes(v.galpoes) }}</td>
                <td>
                  {{
                    v.validoAte
                      ? (v.validoAte | date: 'dd/MM/yyyy' : 'UTC')
                      : '—'
                  }}
                </td>
                <td>
                  <span class="etiqueta" [class]="v.status">{{
                    nomeStatus[v.status]
                  }}</span>
                </td>
                <td>
                  @if (v.status === 'ativo' || v.status === 'pendente') {
                    <button type="button" class="perigo" (click)="revogar(v)">
                      Revogar
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    fieldset {
      border: 1px solid var(--borda);
      border-radius: 6px;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.25rem;
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
