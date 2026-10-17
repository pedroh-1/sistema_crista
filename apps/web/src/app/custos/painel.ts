import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FiltrosVisao,
  Indicador,
  MAXIMO_LOTES_COMPARACAO,
  NOME_LINHAGEM,
  visaoSalvaSchema,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Dialogos } from '../nucleo/dialogos';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import {
  FinanceiroLote,
  LoteResumido,
  MetaLote,
  PontoPesagem,
  ResumoLote,
} from '../lotes/tipos';
import { mensagemErro, validar } from '../nucleo/erros';
import {
  formatarData,
  formatarIndicador,
  formatarNumero,
  formatarReais,
} from '../nucleo/formato';
import { GraficoLinhas, SerieGrafico } from '../nucleo/grafico-linhas';

interface VisaoSalva {
  id: string;
  nome: string;
  filtros: FiltrosVisao;
}

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

const brl = (i: Indicador) => (i.disponivel ? formatarReais(i.valor) : '—');
const motivo = (i: Indicador) => (i.disponivel ? '' : i.motivo);

const LINHAS_ZOOTECNICAS: Linha[] = [
  { rotulo: 'Idade', valor: (l) => `${l.resumo.idadeDias} dias` },
  { rotulo: 'Saldo de aves', valor: (l) => formatarNumero(l.resumo.saldoAves) },
  {
    rotulo: 'Mortalidade',
    valor: (l) => formatarIndicador(l.resumo.mortalidade, 2, ' %'),
    titulo: (l) => motivo(l.resumo.mortalidade),
  },
  {
    rotulo: 'Viabilidade',
    valor: (l) => formatarIndicador(l.resumo.viabilidade, 2, ' %'),
  },
  {
    rotulo: 'Peso médio',
    valor: (l) => formatarIndicador(l.resumo.pesoMedioG, 0, ' g'),
    titulo: (l) => motivo(l.resumo.pesoMedioG),
  },
  {
    rotulo: 'Peso × curva',
    valor: (l) => formatarIndicador(l.meta.desvioCurva, 1, ' %'),
    titulo: (l) => motivo(l.meta.desvioCurva),
  },
  {
    rotulo: 'Uniformidade',
    valor: (l) => formatarIndicador(l.resumo.uniformidade, 1, ' %'),
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
    valor: (l) => formatarReais(l.financeiro?.custoTotal),
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
    <header class="cabecalho-secao">
      <h1>Painel</h1>
      <div class="acoes visoes">
        <select
          name="visao"
          aria-label="Visões salvas"
          [ngModel]="visaoEscolhida()"
          (ngModelChange)="aplicarVisao($event)"
        >
          <option value="">
            {{ visoes().length ? 'Abrir visão salva…' : 'Nenhuma visão salva' }}
          </option>
          @for (v of visoes(); track v.id) {
            <option [value]="v.id">{{ v.nome }}</option>
          }
        </select>
        @if (visaoEscolhida()) {
          <button
            type="button"
            class="fantasma pequeno"
            (click)="excluirVisao()"
          >
            Excluir visão
          </button>
        }
        <button
          type="button"
          class="secundario pequeno"
          (click)="salvarVisao()"
          [disabled]="selecionados().length === 0"
        >
          Salvar esta visão
        </button>
      </div>
    </header>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (avisoVisao()) {
      <p class="aviso atencao" role="status">⚠ {{ avisoVisao() }}</p>
    }
    <section class="cartao formulario">
      <fieldset>
        <legend>Lotes para comparar (até {{ maximo }})</legend>
        <div class="opcoes">
          @for (l of lotes(); track l.id) {
            <label class="opcao">
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
                >{{ l.galpao }} · {{ nomeLinhagem[l.linhagem] }}</span
              >
            </label>
          } @empty {
            <span class="suave">Nenhum lote cadastrado.</span>
          }
        </div>
      </fieldset>
      <div class="acoes periodo">
        <label>
          Período
          <select [(ngModel)]="modo" name="modo">
            <option value="hoje">Do alojamento até hoje</option>
            <option value="idade">Por idade</option>
            <option value="data">Por data</option>
          </select>
        </label>
        @if (modo === 'idade') {
          <label
            >De
            <span class="campo-unidade curto">
              <input
                type="number"
                min="0"
                name="idadeDe"
                [(ngModel)]="idadeDe"
              />
              <span>dias</span>
            </span>
          </label>
          <label
            >Até
            <span class="campo-unidade curto">
              <input
                type="number"
                min="0"
                name="idadeAte"
                [(ngModel)]="idadeAte"
              />
              <span>dias</span>
            </span>
          </label>
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
          {{ carregando() ? 'Comparando…' : 'Comparar lotes' }}
        </button>
      </div>
    </section>

    @if (resultado(); as r) {
      @for (a of r.avisos; track a) {
        <p class="aviso atencao">⚠ {{ a }}</p>
      }

      <section class="cartao">
        <h3>Indicadores</h3>
        <div class="rolagem">
          <table class="tabela comparacao">
            <thead>
              <tr>
                <th><span class="visivel-leitor">Indicador</span></th>
                @for (l of r.lotes; track l.id) {
                  <th class="num">
                    <span class="lote-coluna">
                      <span class="chave" [style.background]="cor(l.id)"></span
                      >{{ l.codigo }}
                    </span>
                    <span class="periodo-lote">
                      {{ data(l.periodo.inicio) }} a {{ data(l.periodo.fim) }}
                    </span>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (linha of linhas(); track linha.rotulo) {
                <tr>
                  <th scope="row">{{ linha.rotulo }}</th>
                  @for (l of r.lotes; track l.id) {
                    <td
                      class="num"
                      [title]="linha.titulo ? linha.titulo(l) : ''"
                    >
                      {{ linha.valor(l) }}
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="graficos">
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
      </div>
    } @else if (!carregando()) {
      <p class="suave">
        Escolha de 1 a {{ maximo }} lotes e o período, e clique em Comparar
        lotes.
      </p>
    }
  `,
  styles: `
    .visoes select {
      width: auto;
      min-height: 32px;
      font-size: 14px;
    }
    .periodo {
      align-items: end;
    }
    .periodo select,
    .periodo input[type='date'] {
      width: auto;
    }
    .curto {
      display: block;
      width: 120px;
    }
    .chave {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 3px;
      margin-right: var(--espaco-1);
    }
    .lote-coluna {
      display: block;
      color: var(--texto);
      font-weight: 600;
    }
    .periodo-lote {
      display: block;
      font-size: 12px;
      font-weight: 400;
    }
    .comparacao th[scope='row'] {
      white-space: nowrap;
      font-weight: 500;
      color: var(--texto-suave);
      background: none;
    }
    .graficos {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(480px, 1fr));
      gap: var(--espaco-4);
    }
    .graficos .cartao {
      margin: 0;
    }
    @media (max-width: 640px) {
      .graficos {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class Painel implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(Dialogos);
  private readonly atual = inject(FazendaAtual);

  protected readonly maximo = MAXIMO_LOTES_COMPARACAO;
  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly data = formatarData;
  protected readonly gramas = (v: number) => `${formatarNumero(v)} g`;
  protected readonly percentual = (v: number) => `${formatarNumero(v, 2)} %`;
  protected readonly lotes = signal<LoteResumido[]>([]);
  protected readonly selecionados = signal<string[]>([]);
  /** Lote → slot de cor (1 a 4). O slot fica com o lote enquanto ele estiver selecionado. */
  private readonly slots = signal<Record<string, number>>({});
  protected readonly resultado = signal<RespostaPainel | null>(null);
  protected readonly erro = signal('');
  protected readonly carregando = signal(false);
  protected readonly visoes = signal<VisaoSalva[]>([]);
  protected readonly visaoEscolhida = signal('');
  protected readonly avisoVisao = signal('');
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
      await this.carregarVisoes();
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

  /** Reaplica os filtros guardados; lote que não existe mais fica de fora, com aviso. */
  async aplicarVisao(id: string): Promise<void> {
    this.visaoEscolhida.set(id);
    this.avisoVisao.set('');
    const visao = this.visoes().find((v) => v.id === id);
    if (!visao) return;
    const f = visao.filtros;
    const existentes = new Set(this.lotes().map((l) => l.id));
    this.selecionados.set([]);
    this.slots.set({});
    for (const lote of f.lotes.filter((l) => existentes.has(l)))
      this.alternar(lote);
    const fora = f.lotes.length - this.selecionados().length;
    if (fora > 0)
      this.avisoVisao.set(
        `${fora} lote(s) desta visão não estão mais disponíveis e ficaram de fora.`,
      );
    this.modo = f.modo;
    this.idadeDe = f.idadeDe ?? null;
    this.idadeAte = f.idadeAte ?? null;
    this.de = f.de ?? '';
    this.ate = f.ate ?? '';
    if (this.selecionados().length > 0) await this.comparar();
  }

  async salvarVisao(): Promise<void> {
    const atual = this.visoes().find((v) => v.id === this.visaoEscolhida());
    const nome = await this.dialogos.pedirTexto({
      titulo: 'Salvar visão',
      mensagem: 'Um nome que já existe é substituído.',
      rotulo: 'Nome da visão',
      acao: 'Salvar visão',
      valor: atual?.nome ?? '',
      minimo: 2,
      maximo: 60,
    });
    if (!nome) return;
    const v = validar(visaoSalvaSchema, {
      nome,
      filtros: {
        lotes: this.selecionados(),
        modo: this.modo,
        idadeDe: this.idadeDe ?? undefined,
        idadeAte: this.idadeAte ?? undefined,
        de: this.de || undefined,
        ate: this.ate || undefined,
      },
    });
    if (!v.ok) {
      this.erro.set(Object.values(v.erros)[0]);
      return;
    }
    this.erro.set('');
    try {
      const salva = await firstValueFrom(
        this.http.post<VisaoSalva>(`${this.atual.url()}/visoes`, v.dados),
      );
      await this.carregarVisoes();
      this.visaoEscolhida.set(salva.id);
      this.avisoVisao.set('');
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  async excluirVisao(): Promise<void> {
    const visao = this.visoes().find((v) => v.id === this.visaoEscolhida());
    if (
      !visao ||
      !(await this.dialogos.confirmar({
        titulo: `Excluir a visão "${visao.nome}"?`,
        mensagem:
          'Os lotes e o período salvos nela deixam de aparecer na lista.',
        acao: 'Excluir visão',
        perigo: true,
      }))
    )
      return;
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.delete(`${this.atual.url()}/visoes/${visao.id}`),
      );
      this.visaoEscolhida.set('');
      await this.carregarVisoes();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  private async carregarVisoes(): Promise<void> {
    this.visoes.set(
      await firstValueFrom(
        this.http.get<VisaoSalva[]>(`${this.atual.url()}/visoes`),
      ),
    );
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
