import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CATEGORIAS_DESPESA,
  CriterioRateio,
  CRITERIOS_RATEIO,
  despesaSchema,
  NOME_CATEGORIA,
  NOME_CRITERIO,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Dialogos } from '../nucleo/dialogos';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { LoteResumido } from '../lotes/tipos';
import {
  confirmouAposAviso,
  ErrosCampo,
  mensagemErro,
  validar,
} from '../nucleo/erros';
import { formatarData, formatarNumero, hoje } from '../nucleo/formato';

interface Despesa {
  id: string;
  data: string;
  categoria: keyof typeof NOME_CATEGORIA;
  descricao: string;
  valor: number;
  fornecedor: string | null;
  numeroNota: string | null;
  origem: 'manual' | 'racao' | 'manutencao';
  estorno: { motivo: string } | null;
  rateios: {
    loteId: string;
    lote: string;
    percentual: number;
    valor: number;
  }[];
}

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const vazio = () => ({
  data: hoje(),
  categoria: 'energia' as (typeof CATEGORIAS_DESPESA)[number],
  descricao: '',
  valor: null as number | null,
  fornecedor: '',
  numeroNota: '',
  lotes: [] as string[],
  criterioRateio: 'aves_alojadas' as CriterioRateio,
  percentuais: {} as Record<string, number | null>,
});

/** UC12: despesas de produção com rateio entre lotes. */
@Component({
  selector: 'crista-despesas',
  imports: [FormsModule],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (atual.pode('despesa.registrar')) {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        <h2>Lançar despesa</h2>
        <div class="grade-2">
          <label>
            Categoria
            <select name="categoria" [(ngModel)]="dados.categoria">
              @for (c of categorias; track c) {
                <option [value]="c">{{ nomeCategoria[c] }}</option>
              }
            </select>
          </label>
          <label>
            Data
            <input
              type="date"
              name="data"
              [max]="hoje"
              [(ngModel)]="dados.data"
            />
            @if (erros()['data']) {
              <span class="erro-campo">{{ erros()['data'] }}</span>
            }
          </label>
          <label>
            Descrição
            <input
              name="descricao"
              placeholder="Ex.: conta de luz de março"
              [(ngModel)]="dados.descricao"
            />
            @if (erros()['descricao']) {
              <span class="erro-campo">{{ erros()['descricao'] }}</span>
            }
          </label>
          <label>
            Valor (R$)
            <input
              type="number"
              name="valor"
              min="0"
              step="0.01"
              [(ngModel)]="dados.valor"
            />
            @if (erros()['valor']) {
              <span class="erro-campo">{{ erros()['valor'] }}</span>
            }
          </label>
          <label>
            Fornecedor (opcional)
            <input name="fornecedor" [(ngModel)]="dados.fornecedor" />
          </label>
          <label>
            Número da nota (opcional)
            <input name="nota" [(ngModel)]="dados.numeroNota" />
          </label>
        </div>

        <fieldset>
          <legend>Lotes que recebem a despesa</legend>
          @for (l of lotes(); track l.id) {
            <label class="caixa">
              <input
                type="checkbox"
                [checked]="dados.lotes.includes(l.id)"
                (change)="alternarLote(l.id)"
              />
              {{ l.codigo }} ({{ l.galpao }})
              @if (
                dados.criterioRateio === 'percentual' &&
                dados.lotes.length > 1 &&
                dados.lotes.includes(l.id)
              ) {
                <input
                  class="pct"
                  type="number"
                  min="0"
                  max="100"
                  [name]="'pct-' + l.id"
                  [(ngModel)]="dados.percentuais[l.id]"
                  aria-label="Percentual do lote"
                />%
              }
            </label>
          } @empty {
            <p class="suave">Nenhum lote em andamento.</p>
          }
          <p class="suave">
            Sem lote marcado, a despesa fica como despesa geral da fazenda.
          </p>
          @if (erros()['lotes']) {
            <span class="erro-campo">{{ erros()['lotes'] }}</span>
          }
          @if (erros()['percentuais']) {
            <span class="erro-campo">{{ erros()['percentuais'] }}</span>
          }
        </fieldset>

        @if (dados.lotes.length > 1) {
          <label>
            Como dividir entre os lotes
            <select name="criterio" [(ngModel)]="dados.criterioRateio">
              @for (c of criterios; track c) {
                <option [value]="c">{{ nomeCriterio[c] }}</option>
              }
            </select>
          </label>
        }
        <div>
          <button type="submit" [disabled]="enviando()">Lançar despesa</button>
        </div>
      </form>
    }

    <section class="cartao">
      <h2>Despesas</h2>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Categoria</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Lotes</th>
              <th>Nota</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (d of despesas(); track d.id) {
              <tr [class.estornado]="d.estorno">
                <td>{{ data(d.data) }}</td>
                <td>{{ nomeCategoria[d.categoria] }}</td>
                <td>{{ d.descricao }}</td>
                <td>{{ brl(d.valor) }}</td>
                <td>
                  @for (r of d.rateios; track r.loteId) {
                    <div>
                      {{ r.lote }}: {{ brl(r.valor) }}
                      <span class="suave">({{ num(r.percentual, 1) }}%)</span>
                    </div>
                  } @empty {
                    <span class="suave">Fazenda</span>
                  }
                </td>
                <td>
                  {{ d.numeroNota ?? '—'
                  }}{{ d.fornecedor ? ' · ' + d.fornecedor : '' }}
                </td>
                <td>
                  @if (d.estorno) {
                    <span class="etiqueta inativo" [title]="d.estorno.motivo"
                      >Estornada</span
                    >
                  } @else if (d.origem === 'racao') {
                    <span class="suave" title="Corrija pela aba Ração do lote"
                      >Ração</span
                    >
                  } @else if (d.origem === 'manutencao') {
                    <span
                      class="suave"
                      title="Corrija pela página do equipamento"
                      >Manutenção</span
                    >
                  } @else if (atual.pode('despesa.registrar')) {
                    <button
                      type="button"
                      class="secundario"
                      (click)="estornar(d)"
                    >
                      Corrigir
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="suave">Nenhuma despesa lançada.</td>
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
      display: grid;
      gap: 0.4rem;
    }
    input.pct {
      width: 5rem;
      margin-left: 0.5rem;
    }
    .estornado td:not(:last-child) {
      text-decoration: line-through;
      color: var(--texto-suave);
    }
  `,
})
export class Despesas implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(Dialogos);
  protected readonly atual = inject(FazendaAtual);

  protected readonly hoje = hoje();
  protected readonly categorias = CATEGORIAS_DESPESA;
  protected readonly criterios = CRITERIOS_RATEIO;
  protected readonly nomeCategoria = NOME_CATEGORIA;
  protected readonly nomeCriterio = NOME_CRITERIO;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly brl = (v: number) => reais.format(v);
  protected dados = vazio();
  protected readonly lotes = signal<LoteResumido[]>([]);
  protected readonly despesas = signal<Despesa[]>([]);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const [lotes] = await Promise.all([
        firstValueFrom(
          this.http.get<LoteResumido[]>(`${this.atual.url()}/lotes`, {
            params: { situacao: 'em_andamento' },
          }),
        ),
        this.carregar(),
      ]);
      this.lotes.set(lotes);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  alternarLote(id: string): void {
    const atuais = this.dados.lotes;
    this.dados.lotes = atuais.includes(id)
      ? atuais.filter((l) => l !== id)
      : [...atuais, id];
  }

  async enviar(confirmarDuplicidade = false): Promise<void> {
    const percentual =
      this.dados.criterioRateio === 'percentual' && this.dados.lotes.length > 1;
    const v = validar(despesaSchema, {
      ...this.dados,
      valor: this.dados.valor ?? 0,
      percentuais: percentual
        ? this.dados.lotes.map((id) => this.dados.percentuais[id] ?? 0)
        : undefined,
      confirmarDuplicidade,
    });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.atual.url()}/despesas`, v.dados),
      );
      this.dados = vazio();
      await this.carregar();
    } catch (e) {
      if (await confirmouAposAviso(e, this.dialogos)) return this.enviar(true);
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async estornar(d: Despesa): Promise<void> {
    const motivo = await this.dialogos.pedirMotivo(
      'Estornar despesa',
      'A despesa e o rateio continuam no histórico, riscados, com o motivo.',
    );
    if (!motivo) return;
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.atual.url()}/despesas/${d.id}/estornar`, {
          motivo,
        }),
      );
      await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  private async carregar(): Promise<void> {
    this.despesas.set(
      await firstValueFrom(
        this.http.get<Despesa[]>(`${this.atual.url()}/despesas`),
      ),
    );
  }
}
