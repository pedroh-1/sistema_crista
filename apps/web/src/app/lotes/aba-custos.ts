import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NOME_CATEGORIA } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { mensagemErro } from '../nucleo/erros';
import { CartaoIndicador } from '../nucleo/cartao-indicador';
import { formatarData, formatarNumero, formatarReais } from '../nucleo/formato';
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

const NOMES: Partial<Record<string, string>> = {
  ...NOME_CATEGORIA,
  pintos: 'Pintos',
};

/** UC14: indicadores econômico-financeiros do lote. */
@Component({
  selector: 'crista-aba-custos',
  imports: [FormsModule, RouterLink, CartaoIndicador],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (fin(); as f) {
      @if (!f.custoPintoInformado) {
        <p class="aviso atencao">
          ⚠ O custo dos pintos não foi informado no cadastro do lote e está fora
          do custo total.
        </p>
      }
      <section class="indicadores" aria-label="Indicadores financeiros">
        <crista-cartao-indicador
          class="compacto"
          nome="Custo total"
          [valor]="f.custoTotal"
          [formato]="brl"
        >
          pintos {{ brl(f.custoPintos) }}
        </crista-cartao-indicador>
        <crista-cartao-indicador
          class="compacto"
          nome="Custo por ave alojada"
          [valor]="f.custoPorAveAlojada"
          [formato]="brl"
        />
        <crista-cartao-indicador
          class="compacto"
          nome="Custo por kg"
          [valor]="f.custoPorKg"
          [formato]="brl"
        />
        <crista-cartao-indicador
          class="compacto"
          nome="Receita prevista"
          [valor]="f.receitaPrevista"
          [formato]="brl"
        >
          @if (f.precoReferenciaKg !== null) {
            a {{ brl(f.precoReferenciaKg) }}/kg
          }
        </crista-cartao-indicador>
        <crista-cartao-indicador
          class="compacto"
          nome="Margem prevista"
          [valor]="f.margem"
          [formato]="brl"
          [tom]="
            f.margem.disponivel
              ? f.margem.valor < 0
                ? 'critico'
                : 'sucesso'
              : null
          "
          [estado]="
            f.margem.disponivel && f.margem.valor < 0
              ? 'Prejuízo previsto'
              : 'Lucro previsto'
          "
        >
          @if (f.margemPercentual.disponivel) {
            {{ num(f.margemPercentual.valor, 1) }} % da receita
          }
        </crista-cartao-indicador>
      </section>

      <div class="duas-colunas">
        <section class="cartao">
          <h3>Custo por categoria</h3>
          <div class="rolagem">
            <table class="tabela">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th class="num">Valor</th>
                  <th class="col-barra">Participação</th>
                </tr>
              </thead>
              <tbody>
                @for (c of f.porCategoria; track c.categoria) {
                  <tr>
                    <td>{{ nomes[c.categoria] ?? c.categoria }}</td>
                    <td class="num">{{ brl(c.valor) }}</td>
                    <td class="col-barra">
                      <div class="barra-linha">
                        <span
                          class="barra"
                          [style.width.%]="c.percentual"
                        ></span>
                        <span class="pct num"
                          >{{ num(c.percentual, 1) }} %</span
                        >
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
          <h3>Preço de venda de referência</h3>
          @if (podeEditar()) {
            <form class="formulario" (ngSubmit)="salvarPreco()">
              <label>
                Preço por kg vivo
                <span class="campo-unidade prefixo">
                  <input
                    type="number"
                    name="preco"
                    min="0"
                    step="0.01"
                    [(ngModel)]="preco"
                  />
                  <span>R$</span>
                </span>
              </label>
              <span class="ajuda"
                >A receita prevista é o peso vivo estimado do lote hoje
                multiplicado por este preço.</span
              >
              <div>
                <button type="submit" [disabled]="enviando()">
                  {{ enviando() ? 'Salvando…' : 'Salvar preço' }}
                </button>
              </div>
            </form>
          } @else {
            <p class="num">
              {{
                f.precoReferenciaKg === null
                  ? 'Não informado'
                  : brl(f.precoReferenciaKg) + ' por kg'
              }}
            </p>
          }
        </section>
      </div>

      <section class="cartao">
        <div class="cabecalho-secao">
          <h3>Despesas deste lote</h3>
          @if (fazenda.pode('despesa.registrar')) {
            <a
              class="botao secundario pequeno"
              [routerLink]="fazenda.link('despesas')"
              >Lançar despesa</a
            >
          }
        </div>
        <div class="rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th class="num">Data</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Nota</th>
                <th class="num">Parcela do lote</th>
              </tr>
            </thead>
            <tbody>
              @for (d of parcelas(); track d.idDespesa) {
                <tr>
                  <td class="num">{{ data(d.data) }}</td>
                  <td>{{ nomes[d.categoria] ?? d.categoria }}</td>
                  <td>{{ d.descricao }}</td>
                  <td>{{ d.numeroNota ?? '—' }}</td>
                  <td class="num">
                    {{ brl(d.valor) }}
                    @if (d.percentual < 100) {
                      <span class="suave">({{ num(d.percentual, 1) }} %)</span>
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
    .duas-colunas {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      gap: var(--espaco-4);
      align-items: start;
    }
    .col-barra {
      width: 40%;
      min-width: 160px;
    }
    .barra-linha {
      display: flex;
      align-items: center;
      gap: var(--espaco-2);
    }
    .barra {
      display: inline-block;
      height: 12px;
      max-width: calc(100% - 4rem);
      background: var(--serie-1);
      border-radius: 0 4px 4px 0;
    }
    .pct {
      font-size: 13px;
      color: var(--texto-suave);
    }
    @media (max-width: 900px) {
      .duas-colunas {
        grid-template-columns: 1fr;
      }
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
  protected readonly brl = formatarReais;
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
