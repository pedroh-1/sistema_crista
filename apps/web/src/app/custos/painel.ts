import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  Indicador,
  MAXIMO_LOTES_COMPARACAO,
  NOME_LINHAGEM,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import {
  FinanceiroLote,
  LoteResumido,
  MetaLote,
  PontoPesagem,
  ResumoLote,
} from '../lotes/tipos';
import { mensagemErro } from '../nucleo/erros';
import {
  formatarData,
  formatarIndicador,
  formatarNumero,
} from '../nucleo/formato';
import { GraficoLinhas, SerieGrafico } from '../nucleo/grafico-linhas';

interface LoteNoPainel {
  id: string;
  codigo: string;
  galpao: string;
  linhagem: LoteResumido['linhagem'];
  periodo: { inicio: string; fim: string };
  resumo: ResumoLote;
  meta: MetaLote;
  financeiro: FinanceiroLote | null;
  series: {
    peso: PontoPesagem[];
    mortalidade: { data: string; idadeDias: number; mortalidadePct: number }[];
    curvaPadrao: { idadeDias: number; pesoG: number }[];
  };
}

interface RespostaPainel {
  lotes: LoteNoPainel[];
  avisos: string[];
  financeiroVisivel: boolean;
}

type Linha = {
  rotulo: string;
  valor: (l: LoteNoPainel) => string;
  titulo?: (l: LoteNoPainel) => string;
};

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const brl = (i: Indicador) => (i.disponivel ? reais.format(i.valor) : '—');
const motivo = (i: Indicador) => (i.disponivel ? '' : i.motivo);

const LINHAS_ZOOTECNICAS: Linha[] = [
  { rotulo: 'Idade', valor: (l) => `${l.resumo.idadeDias} dias` },
  { rotulo: 'Saldo de aves', valor: (l) => formatarNumero(l.resumo.saldoAves) },
  {
    rotulo: 'Mortalidade',
    valor: (l) => formatarIndicador(l.resumo.mortalidade, 2, '%'),
    titulo: (l) => motivo(l.resumo.mortalidade),
  },
  {
    rotulo: 'Viabilidade',
    valor: (l) => formatarIndicador(l.resumo.viabilidade, 2, '%'),
  },
  {
    rotulo: 'Peso médio',
    valor: (l) => formatarIndicador(l.resumo.pesoMedioG, 0, ' g'),
    titulo: (l) => motivo(l.resumo.pesoMedioG),
  },
  {
    rotulo: 'Peso × curva',
    valor: (l) => formatarIndicador(l.meta.desvioCurva, 1, '%'),
    titulo: (l) => motivo(l.meta.desvioCurva),
  },
  {
    rotulo: 'Uniformidade',
    valor: (l) => formatarIndicador(l.resumo.uniformidade, 1, '%'),
  },
  {
    rotulo: 'GPD médio',
    valor: (l) => formatarIndicador(l.resumo.gpdMedioG, 1, ' g/dia'),
  },
  {
    rotulo: 'Conversão alimentar',
    valor: (l) => formatarIndicador(l.resumo.conversaoAlimentar, 3),
    titulo: (l) => motivo(l.resumo.conversaoAlimentar),
  },
  {
    rotulo: 'IEP',
    valor: (l) => formatarIndicador(l.resumo.iep, 0),
    titulo: (l) => motivo(l.resumo.iep),
  },
  {
    rotulo: 'Densidade',
    valor: (l) => formatarIndicador(l.resumo.densidadeKgM2, 1, ' kg/m²'),
  },
];

const LINHAS_FINANCEIRAS: Linha[] = [
  {
    rotulo: 'Custo total',
    valor: (l) => (l.financeiro ? reais.format(l.financeiro.custoTotal) : '—'),
  },
  {
    rotulo: 'Custo por ave alojada',
    valor: (l) => (l.financeiro ? brl(l.financeiro.custoPorAveAlojada) : '—'),
  },
  {
    rotulo: 'Custo por kg',
    valor: (l) => (l.financeiro ? brl(l.financeiro.custoPorKg) : '—'),
  },
  {
    rotulo: 'Receita prevista',
    valor: (l) => (l.financeiro ? brl(l.financeiro.receitaPrevista) : '—'),
    titulo: (l) => (l.financeiro ? motivo(l.financeiro.receitaPrevista) : ''),
  },
  {
    rotulo: 'Margem prevista',
    valor: (l) => (l.financeiro ? brl(l.financeiro.margem) : '—'),
  },
];

/** UC15: compara até 4 lotes num período, por data ou por idade. */
@Component({
  selector: 'crista-painel',
  imports: [FormsModule, GraficoLinhas],
  template: `
    @if (erro()) {
      <p class="alerta" role="alert">{{ erro() }}</p>
    }
    <section class="cartao filtros">
      <fieldset>
        <legend>Lotes (até {{ maximo }})</legend>
        @for (l of lotes(); track l.id) {
          <label class="caixa">
            <input
              type="checkbox"
              [checked]="selecionados().includes(l.id)"
              [disabled]="
                !selecionados().includes(l.id) &&
                selecionados().length >= maximo
              "
              (change)="alternar(l.id)"
            />
            @if (cor(l.id); as c) {
              <span class="chave" [style.background]="c"></span>
            }
            {{ l.codigo }}
            <span class="suave"
              >· {{ l.galpao }} · {{ nomeLinhagem[l.linhagem] }}</span
            >
          </label>
        } @empty {
          <p class="suave">Nenhum lote cadastrado.</p>
        }
      </fieldset>
      <div class="periodo">
        <label>
          Período
          <select [(ngModel)]="modo" name="modo">
            <option value="hoje">Do alojamento até hoje</option>
            <option value="idade">Por idade (dias)</option>
            <option value="data">Por data</option>
          </select>
        </label>
        @if (modo === 'idade') {
          <label
            >De
            <input type="number" min="0" name="idadeDe" [(ngModel)]="idadeDe"
          /></label>
          <label
            >Até
            <input type="number" min="0" name="idadeAte" [(ngModel)]="idadeAte"
          /></label>
        }
        @if (modo === 'data') {
          <label>De <input type="date" name="de" [(ngModel)]="de" /></label>
          <label>Até <input type="date" name="ate" [(ngModel)]="ate" /></label>
        }
        <button
          type="button"
          (click)="comparar()"
          [disabled]="selecionados().length === 0 || carregando()"
        >
          Comparar
        </button>
      </div>
    </section>

    @if (resultado(); as r) {
      @for (a of r.avisos; track a) {
        <p class="alerta aviso">{{ a }}</p>
      }

      <section class="cartao">
        <h3>Indicadores</h3>
        <div class="rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th></th>
                @for (l of r.lotes; track l.id) {
                  <th>
                    <span class="chave" [style.background]="cor(l.id)"></span
                    >{{ l.codigo }}
                    <div class="suave periodo-lote">
                      {{ data(l.periodo.inicio) }} a {{ data(l.periodo.fim) }}
                    </div>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (linha of linhas(); track linha.rotulo) {
                <tr>
                  <th scope="row">{{ linha.rotulo }}</th>
                  @for (l of r.lotes; track l.id) {
                    <td [title]="linha.titulo ? linha.titulo(l) : ''">
                      {{ linha.valor(l) }}
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="cartao">
        <h3>Peso médio por idade</h3>
        <crista-grafico-linhas
          [series]="seriesPeso()"
          [formatoY]="gramas"
          descricao="Peso médio de cada lote por idade em dias"
        />
      </section>

      <section class="cartao">
        <h3>Mortalidade acumulada por idade</h3>
        <crista-grafico-linhas
          [series]="seriesMortalidade()"
          [formatoY]="percentual"
          descricao="Mortalidade acumulada de cada lote por idade em dias"
        />
      </section>
    }
  `,
  styles: `
    .filtros {
      display: grid;
      gap: 1rem;
    }
    fieldset {
      border: 1px solid var(--borda);
      border-radius: 6px;
      display: grid;
      gap: 0.35rem;
    }
    .periodo {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: end;
    }
    .periodo select,
    .periodo input {
      width: auto;
    }
    .chave {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
      margin-right: 0.35rem;
      vertical-align: -1px;
    }
    .periodo-lote {
      font-weight: 400;
      font-size: 0.75rem;
    }
    th[scope='row'] {
      white-space: nowrap;
    }
  `,
})
export class Painel implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly atual = inject(FazendaAtual);

  protected readonly maximo = MAXIMO_LOTES_COMPARACAO;
  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly data = formatarData;
  protected readonly gramas = (v: number) => `${formatarNumero(v)} g`;
  protected readonly percentual = (v: number) => `${formatarNumero(v, 2)}%`;
  protected readonly lotes = signal<LoteResumido[]>([]);
  protected readonly selecionados = signal<string[]>([]);
  /** Lote → slot de cor (1 a 4). O slot fica com o lote enquanto ele estiver selecionado. */
  private readonly slots = signal<Record<string, number>>({});
  protected readonly resultado = signal<RespostaPainel | null>(null);
  protected readonly erro = signal('');
  protected readonly carregando = signal(false);
  protected modo: 'hoje' | 'idade' | 'data' = 'hoje';
  protected idadeDe: number | null = null;
  protected idadeAte: number | null = null;
  protected de = '';
  protected ate = '';

  protected readonly linhas = computed(() =>
    this.resultado()?.financeiroVisivel
      ? [...LINHAS_ZOOTECNICAS, ...LINHAS_FINANCEIRAS]
      : LINHAS_ZOOTECNICAS,
  );

  protected readonly seriesPeso = computed<SerieGrafico[]>(() => {
    const r = this.resultado();
    if (!r) return [];
    // Com uma linhagem só, a curva padrão entra como referência.
    const mesmaLinhagem = new Set(r.lotes.map((l) => l.linhagem)).size === 1;
    const referencia: SerieGrafico[] =
      mesmaLinhagem && r.lotes[0].series.curvaPadrao.length > 0
        ? [
            {
              id: 'padrao',
              nome: `Curva ${NOME_LINHAGEM[r.lotes[0].linhagem]}`,
              cor: '',
              referencia: true,
              pontos: r.lotes[0].series.curvaPadrao.map((p) => ({
                x: p.idadeDias,
                y: p.pesoG,
              })),
            },
          ]
        : [];
    return [
      ...referencia,
      ...r.lotes.map((l) => ({
        id: l.id,
        nome: l.codigo,
        cor: this.cor(l.id) ?? '',
        pontos: l.series.peso.map((p) => ({ x: p.idadeDias, y: p.pesoMedioG })),
      })),
    ];
  });

  protected readonly seriesMortalidade = computed<SerieGrafico[]>(() =>
    (this.resultado()?.lotes ?? []).map((l) => ({
      id: l.id,
      nome: l.codigo,
      cor: this.cor(l.id) ?? '',
      pontos: l.series.mortalidade.map((p) => ({
        x: p.idadeDias,
        y: p.mortalidadePct,
      })),
    })),
  );

  async ngOnInit(): Promise<void> {
    try {
      const lotes = await firstValueFrom(
        this.http.get<LoteResumido[]>(`${this.atual.url()}/lotes`),
      );
      this.lotes.set(lotes.filter((l) => l.situacao !== 'cancelado'));
      // Começa com os lotes em andamento, até o máximo.
      for (const l of lotes
        .filter((x) => x.situacao === 'em_andamento')
        .slice(0, this.maximo))
        this.alternar(l.id);
      if (this.selecionados().length > 0) await this.comparar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  protected cor(id: string): string | null {
    const slot = this.slots()[id];
    return slot ? `var(--serie-${slot})` : null;
  }

  alternar(id: string): void {
    const atuais = this.selecionados();
    if (atuais.includes(id)) {
      this.selecionados.set(atuais.filter((x) => x !== id));
      this.slots.update((s) => {
        const resto = { ...s };
        delete resto[id];
        return resto;
      });
      return;
    }
    if (atuais.length >= this.maximo) return;
    const usados = new Set(Object.values(this.slots()));
    const livre = [1, 2, 3, 4].find((s) => !usados.has(s)) ?? 1;
    this.selecionados.set([...atuais, id]);
    this.slots.update((s) => ({ ...s, [id]: livre }));
  }

  async comparar(): Promise<void> {
    let params = new HttpParams().set('lotes', this.selecionados().join(','));
    if (this.modo === 'idade') {
      if (this.idadeDe !== null) params = params.set('idadeDe', this.idadeDe);
      if (this.idadeAte !== null)
        params = params.set('idadeAte', this.idadeAte);
    }
    if (this.modo === 'data') {
      if (this.de) params = params.set('de', this.de);
      if (this.ate) params = params.set('ate', this.ate);
    }
    this.carregando.set(true);
    this.erro.set('');
    try {
      this.resultado.set(
        await firstValueFrom(
          this.http.get<RespostaPainel>(`${this.atual.url()}/painel`, {
            params,
          }),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.carregando.set(false);
    }
  }
}
