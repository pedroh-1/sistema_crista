import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { galpaoSchema, TIPOS_GALPAO } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { formatarNumero } from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
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
  imports: [FormsModule, PrimeiroCampo],
  template: `
    <header class="cabecalho-secao">
      <h1>Galpões</h1>
      @if (atual.pode('galpao.editar') && !formAberto()) {
        <button type="button" (click)="formAberto.set(true)">
          Cadastrar galpão
        </button>
      }
    </header>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }

    @if (formAberto()) {
      <form class="cartao formulario" (ngSubmit)="criar()">
        <h3>Cadastrar galpão</h3>
        <div class="linha-campos">
          <label>
            Identificação
            <input
              cristaPrimeiroCampo
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
            Área útil
            <span class="campo-unidade">
              <input
                type="number"
                name="area"
                min="0"
                step="0.01"
                [(ngModel)]="dados.areaUtilM2"
              />
              <span>m²</span>
            </span>
            @if (erros()['areaUtilM2']) {
              <span class="erro-campo">{{ erros()['areaUtilM2'] }}</span>
            }
          </label>
          <label>
            Capacidade
            <span class="campo-unidade">
              <input
                type="number"
                name="capacidade"
                min="0"
                step="1"
                [(ngModel)]="dados.capacidadeAves"
              />
              <span>aves</span>
            </span>
            @if (erros()['capacidadeAves']) {
              <span class="erro-campo">{{ erros()['capacidadeAves'] }}</span>
            }
          </label>
        </div>
        <div class="acoes">
          <button type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Salvando…' : 'Cadastrar galpão' }}
          </button>
          <button type="button" class="fantasma" (click)="cancelar()">
            Cancelar
          </button>
        </div>
      </form>
    }

    <div class="tabela-moldura">
      <table class="tabela">
        <thead>
          <tr>
            <th>Galpão</th>
            <th>Tipo</th>
            <th class="num">Área útil</th>
            <th class="num">Capacidade</th>
            <th class="num">Densidade máxima</th>
            <th>Situação</th>
            @if (atual.pode('galpao.editar')) {
              <th class="acao"><span class="visivel-leitor">Ações</span></th>
            }
          </tr>
        </thead>
        <tbody>
          @for (g of atual.galpoes(); track g.id) {
            <tr>
              <td>{{ g.identificacao }}</td>
              <td>{{ nomeTipo[g.tipo] }}</td>
              <td class="num">{{ num(g.areaUtilM2, 2) }} m²</td>
              <td class="num">{{ num(g.capacidadeAves) }} aves</td>
              <td class="num">{{ num(g.densidadeMaxima, 2) }} aves/m²</td>
              <td>
                <span class="etiqueta" [class]="g.situacao">{{
                  nomeSituacao[g.situacao]
                }}</span>
              </td>
              @if (atual.pode('galpao.editar')) {
                <td class="acao">
                  @if (g.situacao !== 'ocupado') {
                    <button
                      type="button"
                      class="fantasma pequeno"
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
  `,
})
export class Galpoes {
  private readonly http = inject(HttpClient);
  protected readonly atual = inject(FazendaAtual);

  protected readonly tipos = TIPOS_GALPAO;
  protected readonly nomeTipo = NOME_TIPO_GALPAO;
  protected readonly nomeSituacao = NOME_SITUACAO;
  protected readonly num = formatarNumero;
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
