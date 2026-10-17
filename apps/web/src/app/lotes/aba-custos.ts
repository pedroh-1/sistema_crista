import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Indicador, NOME_CATEGORIA } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { mensagemErro } from '../nucleo/erros';
import { formatarData, formatarNumero } from '../nucleo/formato';
import { LoteAtual } from './lote-atual';
import { FinanceiroLote } from './tipos';

interface ParcelaLote {
  idDespesa: string;
  data: string;
  categoria: string;
  descricao: string;
  fornecedor: string | null;
  numeroNota: string | null;
  valor: number;
  percentual: number;
}

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const NOMES: Partial<Record<string, string>> = {
  ...NOME_CATEGORIA,
  pintos: 'Pintos',
};

/** UC14: indicadores econômico-financeiros do lote. */
@Component({
  selector: 'crista-aba-custos',
  imports: [FormsModule, RouterLink],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (fin(); as f) {
      @if (!f.custoPintoInformado) {
        <p class="aviso">
          O custo dos pintos não foi informado no cadastro do lote e está fora
          do custo total.
        </p>
      }
      <div class="indicadores">
        <div class="indicador">
          <span class="rotulo">Custo total</span
          ><strong>{{ brl(f.custoTotal) }}</strong>
        </div>
        <div class="indicador" [title]="motivo(f.custoPorAveAlojada)">
          <span class="rotulo">Custo por ave alojada</span
          ><strong>{{ brlInd(f.custoPorAveAlojada) }}</strong>
        </div>
        <div class="indicador" [title]="motivo(f.custoPorKg)">
          <span class="rotulo">Custo por kg</span
          ><strong>{{ brlInd(f.custoPorKg) }}</strong>
        </div>
        <div class="indicador" [title]="motivo(f.receitaPrevista)">
          <span class="rotulo">Receita prevista</span
          ><strong>{{ brlInd(f.receitaPrevista) }}</strong>
        </div>
        <div class="indicador" [title]="motivo(f.margem)">
          <span class="rotulo">Margem prevista</span>
          <strong>{{ brlInd(f.margem) }}</strong>
          @if (f.margemPercentual.disponivel) {
            <span class="suave"
              >{{ num(f.margemPercentual.valor, 1) }}% da receita</span
            >
          }
        </div>
      </div>

      <section class="cartao">
        <h3>Preço de venda de referência</h3>
        @if (podeEditar()) {
          <form class="linha-preco" (ngSubmit)="salvarPreco()">
            <label>
              R$ por kg vivo
              <input
                type="number"
                name="preco"
                min="0"
                step="0.01"
                [(ngModel)]="preco"
              />
            </label>
            <button type="submit" [disabled]="enviando()">Salvar</button>
          </form>
          <p class="suave">
            A receita prevista é o peso vivo estimado do lote hoje multiplicado
            por este preço.
          </p>
        } @else {
          <p>
            {{
              f.precoReferenciaKg === null
                ? 'Não informado'
                : brl(f.precoReferenciaKg) + ' por kg'
            }}
          </p>
        }
      </section>

      <section class="cartao">
        <h3>Custo por categoria</h3>
        <div class="rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Valor</th>
                <th class="col-barra">Participação</th>
              </tr>
            </thead>
            <tbody>
              @for (c of f.porCategoria; track c.categoria) {
                <tr>
                  <td>{{ nomes[c.categoria] ?? c.categoria }}</td>
                  <td>{{ brl(c.valor) }}</td>
                  <td class="col-barra">
                    <div class="barra-linha">
                      <span class="barra" [style.width.%]="c.percentual"></span>
                      <span class="pct">{{ num(c.percentual, 1) }}%</span>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="3" class="suave">Nenhum custo lançado.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="cartao">
        <div class="cabecalho-secao">
          <h3>Despesas deste lote</h3>
          @if (fazenda.pode('despesa.registrar')) {
            <a class="botao secundario" [routerLink]="fazenda.link('despesas')"
              >Lançar despesa</a
            >
          }
        </div>
        <div class="rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Nota</th>
                <th>Parcela do lote</th>
              </tr>
            </thead>
            <tbody>
              @for (d of parcelas(); track d.idDespesa) {
                <tr>
                  <td>{{ data(d.data) }}</td>
                  <td>{{ nomes[d.categoria] ?? d.categoria }}</td>
                  <td>{{ d.descricao }}</td>
                  <td>{{ d.numeroNota ?? '—' }}</td>
                  <td>
                    {{ brl(d.valor) }}
                    @if (d.percentual < 100) {
                      <span class="suave">({{ num(d.percentual, 1) }}%)</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="suave">
                    Nenhuma despesa rateada para este lote.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: `
    .indicadores {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 0.6rem;
      margin-bottom: 1rem;
    }
    .indicador {
      background: var(--superficie);
      border: 1px solid var(--borda);
      border-radius: var(--raio);
      padding: 0.6rem 0.75rem;
      display: grid;
    }
    .indicador strong {
      font-size: 1.1rem;
    }
    .rotulo {
      font-size: 0.8rem;
      color: var(--texto-suave);
    }
    .linha-preco {
      display: flex;
      gap: 0.75rem;
      align-items: end;
      flex-wrap: wrap;
    }
    .linha-preco input {
      width: 10rem;
    }
    .col-barra {
      width: 45%;
      min-width: 160px;
    }
    .barra-linha {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .barra {
      display: inline-block;
      height: 12px;
      max-width: calc(100% - 4rem);
      background: var(--serie-1);
      border-radius: 0 4px 4px 0;
    }
    .pct {
      font-size: 0.85rem;
      color: var(--texto-suave);
    }
  `,
})
export class AbaCustos implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly fazenda = inject(FazendaAtual);
  private readonly lote = inject(LoteAtual);

  protected readonly nomes = NOMES;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly brl = (v: number) => reais.format(v);
  protected readonly fin = signal<FinanceiroLote | null>(null);
  protected readonly parcelas = signal<ParcelaLote[]>([]);
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);
  protected readonly podeEditar = computed(
    () => this.fazenda.pode('despesa.registrar') && this.lote.emAndamento(),
  );
  protected preco: number | null = null;

  ngOnInit(): Promise<void> {
    return this.carregar();
  }

  protected brlInd(i: Indicador): string {
    return i.disponivel ? reais.format(i.valor) : '—';
  }

  protected motivo(i: Indicador): string {
    return i.disponivel ? '' : i.motivo;
  }

  async salvarPreco(): Promise<void> {
    this.enviando.set(true);
    this.erro.set('');
    try {
      const valor = this.preco && this.preco > 0 ? this.preco : null;
      await firstValueFrom(
        this.http.put(`${this.lote.url()}/preco`, { precoReferenciaKg: valor }),
      );
      await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  private async carregar(): Promise<void> {
    try {
      const r = await firstValueFrom(
        this.http.get<FinanceiroLote & { despesas: ParcelaLote[] }>(
          `${this.lote.url()}/financeiro`,
        ),
      );
      const { despesas, ...fin } = r;
      this.fin.set(fin);
      this.parcelas.set(despesas);
      this.preco = fin.precoReferenciaKg;
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
