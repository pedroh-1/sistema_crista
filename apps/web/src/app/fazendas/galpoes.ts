import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { galpaoSchema, TIPOS_GALPAO } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { Galpao } from '../nucleo/tipos';
import { FazendaAtual } from './fazenda-atual';

export const NOME_TIPO_GALPAO: Record<Galpao['tipo'], string> = {
  convencional: 'Convencional',
  climatizado: 'Climatizado',
  dark_house: 'Dark house',
};

const NOME_SITUACAO: Record<Galpao['situacao'], string> = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  inativo: 'Inativo',
};

const vazio = () => ({
  identificacao: '',
  areaUtilM2: null,
  capacidadeAves: null,
  tipo: 'convencional' as Galpao['tipo'],
});

@Component({
  selector: 'crista-galpoes',
  imports: [FormsModule, DecimalPipe],
  template: `
    @if (erro()) {
      <p class="alerta" role="alert">{{ erro() }}</p>
    }
    <section class="cartao">
      <div class="cabecalho-secao">
        <h2>Galpões</h2>
        @if (atual.pode('galpao.editar') && !formAberto()) {
          <button type="button" (click)="formAberto.set(true)">
            Cadastrar galpão
          </button>
        }
      </div>

      @if (formAberto()) {
        <form class="formulario novo" (ngSubmit)="criar()">
          <div class="grade-2">
            <label>
              Identificação
              <input
                name="identificacao"
                placeholder="Ex.: Galpão 1"
                [(ngModel)]="dados.identificacao"
              />
              @if (erros()['identificacao']) {
                <span class="erro-campo">{{ erros()['identificacao'] }}</span>
              }
            </label>
            <label>
              Tipo
              <select name="tipo" [(ngModel)]="dados.tipo">
                @for (tipo of tipos; track tipo) {
                  <option [value]="tipo">{{ nomeTipo[tipo] }}</option>
                }
              </select>
            </label>
            <label>
              Área útil (m²)
              <input
                type="number"
                name="area"
                min="0"
                step="0.01"
                [(ngModel)]="dados.areaUtilM2"
              />
              @if (erros()['areaUtilM2']) {
                <span class="erro-campo">{{ erros()['areaUtilM2'] }}</span>
              }
            </label>
            <label>
              Capacidade (aves)
              <input
                type="number"
                name="capacidade"
                min="0"
                step="1"
                [(ngModel)]="dados.capacidadeAves"
              />
              @if (erros()['capacidadeAves']) {
                <span class="erro-campo">{{ erros()['capacidadeAves'] }}</span>
              }
            </label>
          </div>
          <div>
            <button type="submit" [disabled]="enviando()">Salvar</button>
            &nbsp;
            <button type="button" class="secundario" (click)="cancelar()">
              Cancelar
            </button>
          </div>
        </form>
      }

      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Galpão</th>
              <th>Tipo</th>
              <th>Área (m²)</th>
              <th>Capacidade</th>
              <th>Densidade máx. (aves/m²)</th>
              <th>Situação</th>
              @if (atual.pode('galpao.editar')) {
                <th></th>
              }
            </tr>
          </thead>
          <tbody>
            @for (g of atual.galpoes(); track g.id) {
              <tr>
                <td>{{ g.identificacao }}</td>
                <td>{{ nomeTipo[g.tipo] }}</td>
                <td>{{ g.areaUtilM2 | number: '1.0-2' }}</td>
                <td>{{ g.capacidadeAves | number }}</td>
                <td>{{ g.densidadeMaxima | number: '1.0-2' }}</td>
                <td>
                  <span class="etiqueta" [class]="g.situacao">{{
                    nomeSituacao[g.situacao]
                  }}</span>
                </td>
                @if (atual.pode('galpao.editar')) {
                  <td>
                    @if (g.situacao !== 'ocupado') {
                      <button
                        type="button"
                        class="secundario"
                        (click)="alternarSituacao(g)"
                      >
                        {{ g.situacao === 'inativo' ? 'Reativar' : 'Inativar' }}
                      </button>
                    }
                  </td>
                }
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="suave">Nenhum galpão cadastrado.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .novo {
      padding-bottom: 1rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid var(--borda);
    }
  `,
})
export class Galpoes {
  private readonly http = inject(HttpClient);
  protected readonly atual = inject(FazendaAtual);

  protected readonly tipos = TIPOS_GALPAO;
  protected readonly nomeTipo = NOME_TIPO_GALPAO;
  protected readonly nomeSituacao = NOME_SITUACAO;
  protected dados: {
    identificacao: string;
    areaUtilM2: number | null;
    capacidadeAves: number | null;
    tipo: Galpao['tipo'];
  } = vazio();
  protected readonly formAberto = signal(false);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  async criar(): Promise<void> {
    const v = validar(galpaoSchema, this.dados);
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.atual.url()}/galpoes`, v.dados),
      );
      await this.atual.recarregarGalpoes();
      this.cancelar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async alternarSituacao(g: Galpao): Promise<void> {
    this.erro.set('');
    try {
      const situacao = g.situacao === 'inativo' ? 'disponivel' : 'inativo';
      await firstValueFrom(
        this.http.patch(`${this.atual.url()}/galpoes/${g.id}`, { situacao }),
      );
      await this.atual.recarregarGalpoes();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  cancelar(): void {
    this.dados = vazio();
    this.erros.set({});
    this.formAberto.set(false);
  }
}
