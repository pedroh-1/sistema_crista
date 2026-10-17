import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Indicador,
  NOME_CATEGORIA,
  NOME_SECAO_RELATORIO,
  NOME_SITUACAO_FILTRO,
  PERIODO_PADRAO_DIAS,
  SECOES_RELATORIO,
  SecaoRelatorio,
  SITUACOES_FILTRO,
  SituacaoFiltro,
  Tom,
  tomDaMeta,
  tomDoNivel,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { LoteResumido } from '../lotes/tipos';
import { salvarArquivo } from '../nucleo/arquivo';
import { CartaoIndicador } from '../nucleo/cartao-indicador';
import { Estado } from '../nucleo/estado';
import { mensagemErro } from '../nucleo/erros';
import {
  formatarData,
  formatarIndicador,
  formatarNumero,
  formatarReais,
  hoje,
} from '../nucleo/formato';
import { BarraGrafico, GraficoBarras } from '../nucleo/grafico-barras';
import { GraficoLinhas, SerieGrafico } from '../nucleo/grafico-linhas';
import { Icone, NomeIcone } from '../nucleo/icone';
import { LoteNaVisao, PontoAtencao, VisaoGeral } from '../nucleo/tipos';
import { FazendaAtual } from './fazenda-atual';

/** Atalhos de período, em dias até hoje. */
const PERIODOS = [
  { valor: '30', rotulo: 'Últimos 30 dias' },
  { valor: '90', rotulo: 'Últimos 90 dias' },
  { valor: '180', rotulo: 'Últimos 6 meses' },
  { valor: '365', rotulo: 'Últimos 12 meses' },
  { valor: 'personalizado', rotulo: 'Escolher datas' },
] as const;

/** Medidas da comparação de lotes; o tom só existe onde há regra (limites, meta). */
const MEDIDAS = [
  { id: 'mortalidade', rotulo: 'Mortalidade' },
  { id: 'peso', rotulo: 'Peso × curva' },
  { id: 'uniformidade', rotulo: 'Uniformidade' },
  { id: 'conversao', rotulo: 'Conversão' },
  { id: 'iep', rotulo: 'IEP' },
] as const;
type Medida = (typeof MEDIDAS)[number]['id'];

const ICONE_ATENCAO: Record<PontoAtencao['tom'], NomeIcone> = {
  critico: 'critico',
  atencao: 'atencao',
  info: 'info',
  sucesso: 'ok',
};

const NOME_SITUACAO_LOTE: Record<LoteNaVisao['situacao'], string> = {
  em_andamento: 'Em andamento',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
};

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(ate) - Date.parse(de)) / 864e5);

/**
 * Visão geral da fazenda (entrada da fazenda): indicadores do período, mortalidade
 * diária, pontos de atenção, comparação dos lotes e custos, com filtros na URL e o
 * relatório gerado com os mesmos filtros.
 */
@Component({
  selector: 'crista-visao-geral',
  imports: [
    FormsModule,
    RouterLink,
    CartaoIndicador,
    Estado,
    GraficoBarras,
    GraficoLinhas,
    Icone,
  ],
  template: `
    <header class="cabecalho-secao">
      <div>
        <h1>Visão geral</h1>
        @if (visao(); as v) {
          <span class="suave"
            >{{ data(v.periodo.de) }} a {{ data(v.periodo.ate) }} ·
            {{ resumoFiltros() }}</span
          >
        }
      </div>
      <button
        type="button"
        [class.secundario]="relatorioAberto()"
        (click)="relatorioAberto.set(!relatorioAberto())"
        [attr.aria-expanded]="relatorioAberto()"
        aria-controls="painel-relatorio"
      >
        <crista-icone nome="relatorio" /> Gerar relatório
      </button>
    </header>

    @if (relatorioAberto()) {
      <form
        id="painel-relatorio"
        class="cartao formulario relatorio"
        (ngSubmit)="baixarRelatorio()"
      >
        <h2>Relatório da fazenda</h2>
        <p class="suave">
          Usa os mesmos filtros desta tela: {{ resumoPeriodo() }} ·
          {{ resumoFiltros() }}. Os indicadores principais sempre entram.
        </p>
        <fieldset>
          <legend>Formato</legend>
          <div class="opcoes">
            <label class="opcao"
              ><input
                type="radio"
                name="formato"
                value="pdf"
                [(ngModel)]="formato"
              />
              PDF, para ler e compartilhar</label
            >
            <label class="opcao"
              ><input
                type="radio"
                name="formato"
                value="xlsx"
                [(ngModel)]="formato"
              />
              Planilha (XLSX), para analisar</label
            >
          </div>
        </fieldset>
        <fieldset>
          <legend>Incluir</legend>
          <div class="opcoes">
            @for (s of secoesDisponiveis(); track s) {
              <label class="opcao"
                ><input
                  type="checkbox"
                  [name]="'secao-' + s"
                  [ngModel]="secoes().includes(s)"
                  (ngModelChange)="alternarSecao(s, $event)"
                />
                {{ nomeSecao[s] }}</label
              >
            }
          </div>
        </fieldset>
        @if (erroRelatorio()) {
          <p class="aviso" role="alert">{{ erroRelatorio() }}</p>
        }
        <div class="acoes">
          <button type="submit" [disabled]="gerando() || !visao()">
            <crista-icone nome="baixar" />
            {{ gerando() ? 'Gerando…' : 'Baixar relatório' }}
          </button>
          <button
            type="button"
            class="fantasma"
            (click)="relatorioAberto.set(false)"
          >
            Cancelar
          </button>
        </div>
      </form>
    }

    <form class="filtros" (ngSubmit)="aplicarDatas()" aria-label="Filtros">
      <label>
        Período
        <select
          name="periodo"
          [ngModel]="periodo()"
          (ngModelChange)="mudarPeriodo($event)"
        >
          @for (p of periodos; track p.valor) {
            <option [value]="p.valor">{{ p.rotulo }}</option>
          }
        </select>
      </label>
      @if (periodo() === 'personalizado') {
        <label>
          De
          <input type="date" name="de" [(ngModel)]="de" [max]="hojeISO" />
        </label>
        <label>
          Até
          <input type="date" name="ate" [(ngModel)]="ate" [max]="hojeISO" />
        </label>
        <button type="submit" class="secundario">Aplicar</button>
      }
      <label>
        Galpão
        <select
          name="galpao"
          [ngModel]="filtro().galpao"
          (ngModelChange)="filtrar({ galpao: $event, lote: null })"
        >
          <option value="">Todos</option>
          @for (g of atual.galpoes(); track g.id) {
            <option [value]="g.id">{{ g.identificacao }}</option>
          }
        </select>
      </label>
      <label>
        Situação
        <select
          name="situacao"
          [ngModel]="filtro().situacao"
          (ngModelChange)="filtrar({ situacao: $event, lote: null })"
        >
          @for (s of situacoes; track s) {
            <option [value]="s">{{ nomeSituacaoFiltro[s] }}</option>
          }
        </select>
      </label>
      <label>
        Lote
        <select
          name="lote"
          [ngModel]="filtro().lote"
          (ngModelChange)="filtrar({ lote: $event })"
        >
          <option value="">Todos</option>
          @for (l of lotesDoFiltro(); track l.id) {
            <option [value]="l.id">{{ l.codigo }} · {{ l.galpao }}</option>
          }
        </select>
      </label>
      @if (temFiltro()) {
        <button type="button" class="fantasma" (click)="limparFiltros()">
          Limpar filtros
        </button>
      }
    </form>

    @if (erro()) {
      <p class="aviso" role="alert">
        <span>{{ erro() }}</span>
        <button
          type="button"
          class="pequeno secundario acoes"
          (click)="carregar()"
        >
          Tentar de novo
        </button>
      </p>
    }

    @if (visao(); as v) {
      <div
        class="conteudo-visao"
        [class.recarregando]="carregando()"
        [attr.aria-busy]="carregando()"
      >
        <section
          class="indicadores"
          aria-label="Indicadores da fazenda no período"
        >
          <crista-cartao-indicador
            nome="Plantel atual"
            [valor]="v.indicadores.plantelAtual"
          >
            aves em {{ v.indicadores.lotes.emAndamento }}
            {{ v.indicadores.lotes.emAndamento === 1 ? 'lote' : 'lotes' }}
            em andamento
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Mortalidade"
            [valor]="v.indicadores.mortalidade"
            [casas]="2"
            unidade="%"
          >
            {{ num(v.indicadores.baixas) }} baixas de
            {{ num(v.indicadores.avesAlojadas) }} aves
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Viabilidade"
            [valor]="v.indicadores.viabilidade"
            [casas]="2"
            unidade="%"
          >
            ponderada pelas aves de cada lote
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Meta de peso"
            [valor]="lotesNaMeta().dentro"
            [tom]="lotesNaMeta().tom"
            [estado]="lotesNaMeta().estado"
          >
            de {{ lotesNaMeta().comPesagem }} com pesagem
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Conversão alimentar"
            [valor]="v.indicadores.conversaoAlimentar"
            [casas]="3"
          >
            ração ÷ peso produzido
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="IEP médio"
            [valor]="v.indicadores.iepMedio"
          >
            média dos lotes
          </crista-cartao-indicador>
          <crista-cartao-indicador
            nome="Alertas abertos"
            [valor]="v.alertas.abertos"
            [tom]="tomAlertas()"
            [estado]="estadoAlertas()"
          >
            <a [routerLink]="atual.link('alertas')">Ver alertas</a>
          </crista-cartao-indicador>
          @if (v.financeiroVisivel) {
            <crista-cartao-indicador
              class="compacto"
              nome="Custo dos lotes"
              [valor]="v.indicadores.custoTotal"
              [formato]="brl"
              semValor="Sem custo lançado"
            >
              acumulado até o fim do período
            </crista-cartao-indicador>
            <crista-cartao-indicador
              class="compacto"
              nome="Margem prevista"
              [valor]="v.indicadores.margem"
              [formato]="brl"
              semValor="Sem preço de referência"
              [tom]="tomMargem()"
              [estado]="
                tomMargem() === 'critico'
                  ? 'Prejuízo previsto'
                  : 'Lucro previsto'
              "
            />
          }
        </section>

        <div class="grade-principal">
          <section class="cartao">
            <div class="cabecalho-secao">
              <h2>Mortalidade diária da fazenda</h2>
              <span class="suave">% das aves no início do dia</span>
            </div>
            @if (v.mortalidadeDiaria.length === 0) {
              <p class="suave">Nenhuma baixa lançada no período.</p>
            } @else {
              <crista-grafico-linhas
                [series]="serieMortalidade()"
                [dominio]="dominioPeriodo()"
                [formatoX]="formatoDia()"
                [formatoY]="percentual"
                rotuloX="Data"
                descricao="Mortalidade diária da fazenda no período"
              />
              <p class="suave nota">
                Cada ponto soma os lotes que lançaram baixa no dia. Ponto
                <span class="tom-atencao">âmbar</span> ou
                <span class="tom-critico">vermelho</span>: algum lote passou do
                limite de atenção ou crítico da idade dele (limites em Alertas).
              </p>
            }
          </section>

          <section class="cartao atencao" aria-labelledby="titulo-atencao">
            <h2 id="titulo-atencao">Pontos de atenção</h2>
            <ul class="pontos">
              @for (p of v.atencao; track $index) {
                <li [class]="'tom-' + p.tom">
                  <crista-icone [nome]="iconeAtencao[p.tom]" />
                  <span>{{ p.texto }}</span>
                  @if (linkAtencao(p); as link) {
                    <a
                      [routerLink]="link"
                      class="abrir"
                      [attr.aria-label]="'Abrir: ' + p.texto"
                      ><crista-icone nome="seta"
                    /></a>
                  }
                </li>
              }
            </ul>
          </section>
        </div>

        <section class="cartao">
          <div class="cabecalho-secao">
            <h2>Comparação dos lotes</h2>
            <div class="segmentos" role="group" aria-label="Medida">
              @for (m of medidas; track m.id) {
                <button
                  type="button"
                  class="pequeno"
                  [class.secundario]="medida() !== m.id"
                  [attr.aria-pressed]="medida() === m.id"
                  (click)="medida.set(m.id)"
                >
                  {{ m.rotulo }}
                </button>
              }
            </div>
          </div>
          <crista-grafico-barras
            [barras]="barrasLotes()"
            [selecionavel]="true"
            (selecionar)="abrirLote($event)"
            [descricao]="'Comparação dos lotes: ' + nomeMedida()"
            vazio="Nenhum lote no período com estes filtros."
          />
          @if (v.lotes.length > 0) {
            <details class="mais tabela-lotes">
              <summary>Ver todos os indicadores em tabela</summary>
              <div class="rolagem">
                <table class="tabela">
                  <thead>
                    <tr>
                      <th>Lote</th>
                      <th>Situação</th>
                      <th class="num">Idade</th>
                      <th class="num">Alojadas</th>
                      <th class="num">Saldo</th>
                      <th class="num">Mortalidade</th>
                      <th class="num">Peso médio</th>
                      <th>Peso × curva</th>
                      <th class="num">Uniformidade</th>
                      <th class="num">CA</th>
                      <th class="num">IEP</th>
                      @if (v.financeiroVisivel) {
                        <th class="num">Custo</th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (l of v.lotes; track l.id) {
                      <tr>
                        <td>
                          <a [routerLink]="atual.link('lotes', l.id)">{{
                            l.codigo
                          }}</a>
                          <span class="suave detalhe">{{ l.galpao }}</span>
                        </td>
                        <td>{{ nomeSituacaoLote[l.situacao] }}</td>
                        <td class="num">{{ l.idadeDias }} dias</td>
                        <td class="num">{{ num(l.avesAlojadas) }}</td>
                        <td class="num">{{ num(l.saldoAves) }}</td>
                        <td class="num">{{ ind(l.mortalidade, 2, ' %') }}</td>
                        <td class="num">{{ ind(l.pesoMedioG, 0, ' g') }}</td>
                        <td>
                          <crista-estado
                            [tom]="tomDaMeta(l.nivelMeta, l.situacaoMeta)"
                            [texto]="ind(l.desvioCurva, 1, ' %')"
                          />
                          @if (!l.situacaoMeta) {
                            <span class="suave">—</span>
                          }
                        </td>
                        <td class="num">{{ ind(l.uniformidade, 1, ' %') }}</td>
                        <td class="num">{{ ind(l.conversaoAlimentar, 3) }}</td>
                        <td class="num">{{ ind(l.iep) }}</td>
                        @if (v.financeiroVisivel) {
                          <td class="num">
                            {{ brl(l.financeiro?.custoTotal) }}
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </details>
          }
        </section>

        @if (v.custos; as c) {
          <div class="grade-custos">
            <section class="cartao">
              <h2>Custo por categoria</h2>
              <p class="suave nota">
                Acumulado dos lotes até o fim do período.
              </p>
              <crista-grafico-barras
                [barras]="barrasCategorias()"
                descricao="Custo por categoria"
                vazio="Nenhum custo lançado nos lotes."
              />
            </section>
            <section class="cartao">
              <h2>Despesas por mês</h2>
              <p class="suave nota">Rateio dos lotes, pela data da despesa.</p>
              <crista-grafico-barras
                [barras]="barrasMeses()"
                descricao="Despesas lançadas por mês"
                vazio="Nenhuma despesa lançada no período."
              />
            </section>
          </div>
        }
      </div>
    } @else if (carregando()) {
      <div class="indicadores">
        @for (i of [1, 2, 3, 4, 5, 6, 7]; track i) {
          <span class="esqueleto" style="height: 118px"></span>
        }
      </div>
      <div class="grade-principal">
        <span class="esqueleto" style="height: 360px"></span>
        <span class="esqueleto" style="height: 360px"></span>
      </div>
    }
  `,
  styles: `
    .filtros {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: var(--espaco-3);
      margin-bottom: var(--espaco-5);
    }
    .filtros label {
      min-width: 150px;
    }
    .relatorio {
      max-width: 720px;
    }
    .relatorio h2 {
      margin: 0;
    }
    .conteudo-visao {
      transition: opacity 0.15s;
    }
    .recarregando {
      opacity: 0.6;
    }
    .grade-principal {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
      gap: var(--espaco-4);
      align-items: start;
    }
    .grade-custos {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
      gap: var(--espaco-4);
    }
    .cartao h2 {
      font-family: var(--font-texto);
      font-size: 16px;
      line-height: 24px;
      margin: 0;
    }
    .cartao > h2 {
      margin-bottom: var(--espaco-3);
    }
    .nota {
      margin: var(--espaco-2) 0 0;
      font-size: 13px;
    }
    .cartao > .nota {
      margin: calc(-1 * var(--espaco-2)) 0 var(--espaco-3);
    }
    .tom-atencao {
      color: var(--atencao);
      font-weight: 600;
    }
    .tom-critico {
      color: var(--critico);
      font-weight: 600;
    }
    .pontos {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: var(--espaco-2);
    }
    .pontos li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--espaco-2);
      align-items: start;
      padding: var(--espaco-2) var(--espaco-3);
      border-radius: var(--raio-sm);
      font-size: 14px;
      line-height: 20px;
      background: var(--superficie-2);
    }
    .pontos li crista-icone {
      margin-top: 2px;
    }
    .pontos li.tom-critico {
      background: var(--critico-fundo);
      color: var(--critico);
      font-weight: 400;
    }
    .pontos li.tom-atencao {
      background: var(--atencao-fundo);
      color: var(--atencao);
      font-weight: 400;
    }
    .pontos li.tom-info {
      background: var(--info-fundo);
      color: var(--info);
    }
    .pontos li.tom-sucesso {
      background: var(--sucesso-fundo);
      color: var(--sucesso);
    }
    .abrir {
      color: inherit;
      display: inline-flex;
      padding: 2px;
      border-radius: var(--raio-sm);
    }
    .segmentos {
      display: flex;
      flex-wrap: wrap;
      gap: var(--espaco-1);
    }
    .tabela-lotes {
      margin-top: var(--espaco-4);
    }
    .detalhe {
      display: block;
      font-size: 12px;
    }
    /* minmax(0, ...): o gráfico mede a largura da coluna; com 1fr ela não encolhe abaixo do SVG. */
    @media (max-width: 1100px) {
      .grade-principal {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (max-width: 640px) {
      .filtros label {
        min-width: 0;
        flex: 1 1 140px;
      }
      .grade-custos {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class VisaoGeralPagina {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  protected readonly atual = inject(FazendaAtual);

  protected readonly periodos = PERIODOS;
  protected readonly situacoes = SITUACOES_FILTRO;
  protected readonly nomeSituacaoFiltro = NOME_SITUACAO_FILTRO;
  protected readonly nomeSituacaoLote = NOME_SITUACAO_LOTE;
  protected readonly nomeSecao = NOME_SECAO_RELATORIO;
  protected readonly medidas = MEDIDAS;
  protected readonly iconeAtencao = ICONE_ATENCAO;
  protected readonly tomDaMeta = tomDaMeta;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly ind = formatarIndicador;
  protected readonly brl = formatarReais;
  protected readonly percentual = (v: number) => `${formatarNumero(v, 2)} %`;
  protected readonly hojeISO = hoje();

  protected readonly visao = signal<VisaoGeral | null>(null);
  protected readonly carregando = signal(true);
  protected readonly erro = signal('');
  protected readonly lotes = signal<LoteResumido[]>([]);
  protected readonly medida = signal<Medida>('mortalidade');

  protected readonly relatorioAberto = signal(false);
  protected readonly gerando = signal(false);
  protected readonly erroRelatorio = signal('');
  protected formato: 'pdf' | 'xlsx' = 'pdf';
  protected readonly secoes = signal<SecaoRelatorio[]>([...SECOES_RELATORIO]);

  /** Datas do período personalizado, antes de aplicar. */
  protected de = '';
  protected ate = '';

  /** Os filtros vivem na URL: dá para voltar, recarregar e mandar o link. */
  private readonly consulta = toSignal(this.rota.queryParamMap, {
    requireSync: true,
  });
  protected readonly periodo = computed(() => {
    const q = this.consulta();
    if (q.get('de') || q.get('ate')) return 'personalizado';
    return q.get('periodo') ?? String(PERIODO_PADRAO_DIAS);
  });
  protected readonly filtro = computed(() => {
    const q = this.consulta();
    const situacao = q.get('situacao') as SituacaoFiltro | null;
    return {
      galpao: q.get('galpao') ?? '',
      lote: q.get('lote') ?? '',
      situacao:
        situacao && SITUACOES_FILTRO.includes(situacao) ? situacao : 'todos',
      de: q.get('de') ?? '',
      ate: q.get('ate') ?? '',
    };
  });
  /** Parâmetros da API: os mesmos para a visão e para o relatório. */
  private readonly parametros = computed(() => {
    const f = this.filtro();
    const p: Record<string, string> = { situacao: f.situacao };
    if (this.periodo() === 'personalizado') {
      if (f.de) p['de'] = f.de;
      if (f.ate) p['ate'] = f.ate;
    } else {
      p['de'] = somarDias(hoje(), -Number(this.periodo()));
    }
    if (f.galpao) p['galpao'] = f.galpao;
    if (f.lote) p['lote'] = f.lote;
    return p;
  });

  protected readonly temFiltro = computed(() => {
    const f = this.filtro();
    return (
      !!(f.galpao || f.lote || f.de || f.ate) ||
      f.situacao !== 'todos' ||
      this.periodo() !== String(PERIODO_PADRAO_DIAS)
    );
  });

  protected readonly lotesDoFiltro = computed(() => {
    const f = this.filtro();
    const galpao = this.atual.galpoes().find((g) => g.id === f.galpao);
    return this.lotes().filter(
      (l) =>
        l.situacao !== 'cancelado' &&
        (f.situacao === 'todos' || l.situacao === f.situacao) &&
        (!galpao || l.galpao === galpao.identificacao),
    );
  });

  protected readonly resumoPeriodo = computed(() => {
    const v = this.visao();
    return v
      ? `${formatarData(v.periodo.de)} a ${formatarData(v.periodo.ate)}`
      : '';
  });
  protected readonly resumoFiltros = computed(() => {
    const f = this.filtro();
    const partes: string[] = [NOME_SITUACAO_FILTRO[f.situacao]];
    const galpao = this.atual.galpoes().find((g) => g.id === f.galpao);
    if (galpao) partes.push(`galpão ${galpao.identificacao}`);
    const lote = this.lotes().find((l) => l.id === f.lote);
    if (lote) partes.push(`lote ${lote.codigo}`);
    return partes.join(' · ');
  });

  protected readonly secoesDisponiveis = computed(() =>
    SECOES_RELATORIO.filter(
      (s) => s !== 'custos' || this.atual.pode('financeiro.ver'),
    ),
  );

  constructor() {
    effect(() => {
      this.parametros();
      void this.carregar();
    });
    effect(() => {
      // Datas do formulário acompanham a URL (voltar do navegador, link recebido).
      const f = this.filtro();
      const v = this.visao();
      this.de = f.de || v?.periodo.de || '';
      this.ate = f.ate || v?.periodo.ate || '';
    });
    void this.carregarLotes();
  }

  async carregar(): Promise<void> {
    const parametros = this.parametros();
    this.carregando.set(true);
    this.erro.set('');
    try {
      const v = await firstValueFrom(
        this.http.get<VisaoGeral>(`${this.atual.url()}/visao-geral`, {
          params: parametros,
        }),
      );
      // Uma resposta antiga não sobrescreve a do filtro atual.
      if (parametros === this.parametros()) this.visao.set(v);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.carregando.set(false);
    }
  }

  private async carregarLotes(): Promise<void> {
    try {
      this.lotes.set(
        await firstValueFrom(
          this.http.get<LoteResumido[]>(`${this.atual.url()}/lotes`),
        ),
      );
    } catch {
      // Sem a lista, o filtro de lote fica só com "Todos"; a visão continua.
    }
  }

  protected filtrar(mudanca: Record<string, string | null>): void {
    const limpa = Object.fromEntries(
      Object.entries(mudanca).map(([k, v]) => [k, v || null]),
    );
    void this.router.navigate([], {
      relativeTo: this.rota,
      queryParams: limpa,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected mudarPeriodo(valor: string): void {
    if (valor === 'personalizado') {
      const v = this.visao();
      this.filtrar({
        periodo: null,
        de: v?.periodo.de ?? null,
        ate: v?.periodo.ate ?? null,
      });
    } else {
      this.filtrar({ periodo: valor, de: null, ate: null });
    }
  }

  protected aplicarDatas(): void {
    if (this.de && this.ate && this.de > this.ate) {
      this.erro.set('A data inicial precisa ser antes da final.');
      return;
    }
    this.filtrar({ periodo: null, de: this.de, ate: this.ate });
  }

  protected limparFiltros(): void {
    void this.router.navigate([], { relativeTo: this.rota, replaceUrl: true });
  }

  protected abrirLote(id: string): void {
    void this.router.navigate(this.atual.link('lotes', id));
  }

  protected linkAtencao(p: PontoAtencao): string[] | null {
    if (!p.link) return null;
    if (p.link.tipo === 'lote') return this.atual.link('lotes', p.link.id);
    return this.atual.link(p.link.tipo);
  }

  // ---------- Indicadores com tom (só onde há regra) ----------

  /** Lotes na meta de peso pela última pesagem; o tom é o pior entre eles. */
  protected readonly lotesNaMeta = computed(() => {
    const lotes = this.visao()?.lotes ?? [];
    const comPesagem = lotes.filter((l) => l.situacaoMeta);
    const tons = comPesagem.map((l) => tomDaMeta(l.nivelMeta, l.situacaoMeta));
    const fora = comPesagem.length - tons.filter((t) => t === 'sucesso').length;
    const tom: Tom = tons.includes('critico')
      ? 'critico'
      : tons.includes('atencao')
        ? 'atencao'
        : tons.length
          ? 'sucesso'
          : 'neutro';
    return {
      dentro: comPesagem.length
        ? tons.filter((t) => t === 'sucesso').length
        : null,
      comPesagem: comPesagem.length,
      tom,
      estado:
        tom === 'sucesso'
          ? 'Todos dentro da meta'
          : fora > 0
            ? `${fora} fora da meta`
            : '',
    };
  });

  protected readonly tomAlertas = computed<Tom>(() => {
    const a = this.visao()?.alertas;
    if (!a) return 'neutro';
    return a.criticos > 0 ? 'critico' : a.abertos > 0 ? 'atencao' : 'sucesso';
  });
  protected readonly estadoAlertas = computed(() => {
    const a = this.visao()?.alertas;
    if (!a) return '';
    if (a.abertos === 0) return 'Nenhum aberto';
    return a.criticos > 0
      ? `${a.criticos} ${a.criticos === 1 ? 'crítico' : 'críticos'}`
      : 'Só de atenção';
  });

  /** Margem: negativa é prejuízo (crítico), positiva é favorável. */
  protected readonly tomMargem = computed<Tom | null>(() => {
    const m = this.visao()?.indicadores.margem;
    if (m == null) return null;
    return m < 0 ? 'critico' : 'sucesso';
  });

  // ---------- Gráficos ----------

  protected readonly dominioPeriodo = computed<[number, number]>(() => {
    const v = this.visao();
    return v
      ? [0, Math.max(1, diasEntre(v.periodo.de, v.periodo.ate))]
      : [0, 1];
  });
  protected readonly formatoDia = computed(() => {
    const de = this.visao()?.periodo.de ?? hoje();
    return (x: number) => formatarData(somarDias(de, x)).slice(0, 5);
  });

  protected readonly serieMortalidade = computed<SerieGrafico[]>(() => {
    const v = this.visao();
    if (!v) return [];
    return [
      {
        id: 'mortalidade',
        nome: 'Mortalidade do dia',
        cor: 'var(--serie-1)',
        pontos: v.mortalidadeDiaria.map((p) => ({
          x: diasEntre(v.periodo.de, p.data),
          y: p.percentual,
          nota:
            `${formatarNumero(p.baixas)} baixas em ${p.lotes} ${p.lotes === 1 ? 'lote' : 'lotes'}` +
            (p.nivel === 'critico'
              ? ' · crítico'
              : p.nivel === 'atencao'
                ? ' · atenção'
                : ''),
          tom:
            p.nivel === 'critico' || p.nivel === 'atencao'
              ? p.nivel
              : undefined,
        })),
      },
    ];
  });

  protected readonly nomeMedida = computed(
    () => MEDIDAS.find((m) => m.id === this.medida())?.rotulo ?? '',
  );

  protected readonly barrasLotes = computed<BarraGrafico[]>(() => {
    const lotes = this.visao()?.lotes ?? [];
    const medida = this.medida();
    const barra = (
      l: LoteNaVisao,
      i: Indicador,
      texto: string,
      tom: Tom | null = null,
      estado = '',
    ): BarraGrafico => ({
      id: l.id,
      rotulo: l.codigo,
      detalhe: `${l.galpao} · ${NOME_SITUACAO_LOTE[l.situacao].toLowerCase()}`,
      valor: i.disponivel ? i.valor : null,
      texto,
      motivo: i.disponivel ? undefined : i.motivo,
      tom,
      estado,
    });
    return lotes.map((l) => {
      switch (medida) {
        case 'mortalidade':
          return barra(
            l,
            l.mortalidade,
            formatarIndicador(l.mortalidade, 2, ' %'),
          );
        case 'peso':
          return barra(
            l,
            l.desvioCurva,
            formatarIndicador(l.desvioCurva, 1, ' %'),
            tomDaMeta(l.nivelMeta, l.situacaoMeta),
          );
        case 'uniformidade':
          return barra(
            l,
            l.uniformidade,
            formatarIndicador(l.uniformidade, 1, ' %'),
            tomDoNivel(l.uniformidadeNivel),
          );
        case 'conversao':
          return barra(
            l,
            l.conversaoAlimentar,
            formatarIndicador(l.conversaoAlimentar, 3),
          );
        case 'iep':
          return barra(l, l.iep, formatarIndicador(l.iep));
      }
    });
  });

  protected readonly barrasCategorias = computed<BarraGrafico[]>(() =>
    (this.visao()?.custos?.porCategoria ?? []).map((c) => ({
      id: c.categoria,
      rotulo: NOME_CATEGORIA_CUSTO[c.categoria] ?? c.categoria,
      valor: c.valor,
      texto: `${formatarReais(c.valor)} · ${formatarNumero(c.percentual, 1)} %`,
    })),
  );

  protected readonly barrasMeses = computed<BarraGrafico[]>(() =>
    (this.visao()?.custos?.porMes ?? []).map((m) => {
      const [ano, mes] = m.mes.split('-');
      return {
        id: m.mes,
        rotulo: `${MESES[Number(mes) - 1]}/${ano}`,
        valor: m.valor,
        texto: formatarReais(m.valor),
      };
    }),
  );

  // ---------- Relatório ----------

  protected alternarSecao(secao: SecaoRelatorio, incluir: boolean): void {
    this.secoes.update((atual) =>
      incluir ? [...atual, secao] : atual.filter((s) => s !== secao),
    );
  }

  protected async baixarRelatorio(): Promise<void> {
    const v = this.visao();
    if (!v) return;
    this.gerando.set(true);
    this.erroRelatorio.set('');
    try {
      const secoes = this.secoes().filter((s) =>
        this.secoesDisponiveis().includes(s),
      );
      const blob = await firstValueFrom(
        this.http.get(`${this.atual.url()}/visao-geral/relatorio`, {
          params: {
            ...this.parametros(),
            formato: this.formato,
            secoes: secoes.join(','),
          },
          responseType: 'blob',
        }),
      );
      salvarArquivo(
        blob,
        `relatorio-${v.fazenda.nome}-${v.periodo.de}-a-${v.periodo.ate}.${this.formato}`,
      );
      this.relatorioAberto.set(false);
    } catch (e) {
      this.erroRelatorio.set(mensagemErro(e));
    } finally {
      this.gerando.set(false);
    }
  }
}

const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** Categorias de custo; "pintos" vem do cadastro do lote, as outras das despesas. */
const NOME_CATEGORIA_CUSTO: Record<string, string> = {
  ...NOME_CATEGORIA,
  pintos: 'Pintos',
};
