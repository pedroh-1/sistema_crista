import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FAIXA_META_PCT, NOME_LINHAGEM, tomDaMeta } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { mensagemErro } from '../nucleo/erros';
import { formatarData, formatarNumero } from '../nucleo/formato';
import {
  FaixaGrafico,
  GraficoLinhas,
  SerieGrafico,
} from '../nucleo/grafico-linhas';
import { LoteAtual } from './lote-atual';
import { Estado, ROTULO_TOM } from '../nucleo/estado';
import { NOME_SITUACAO_META } from './situacao-meta';
import { CurvaLote } from './tipos';

/** UC11: evolução do peso médio contra a curva padrão da linhagem. */
@Component({
  selector: 'crista-aba-curva',
  imports: [GraficoLinhas, Estado],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (curva(); as c) {
      @if (c.fonteCurva === 'sintetico') {
        <p class="aviso atencao">
          ⚠ Curva de teste: os valores padrão ainda não são os do manual da
          linhagem.
        </p>
      }
      <section class="cartao">
        <h3>
          Peso médio × curva {{ c.fonteCurva ? nomeLinhagem[c.linhagem] : '' }}
        </h3>
        @if (c.curvaPadrao.length === 0) {
          <p class="suave">
            Esta linhagem não tem curva de referência cadastrada; o gráfico
            mostra só as pesagens.
          </p>
        }
        @if (c.pesagens.length === 0 && c.curvaPadrao.length === 0) {
          <p class="suave">Nenhuma pesagem registrada.</p>
        } @else {
          <crista-grafico-linhas
            [series]="series()"
            [faixa]="faixa()"
            [formatoY]="gramas"
            descricao="Peso médio das pesagens comparado com a curva padrão da linhagem e a faixa da meta, por idade em dias"
          />
        }
      </section>

      <section class="cartao">
        <h3>Pesagens contra a meta</h3>
        <div class="rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th class="num">Data</th>
                <th class="num">Idade</th>
                <th class="num">Peso médio</th>
                <th class="num">Padrão</th>
                <th class="num">Desvio</th>
                <th class="num">Ganho no período</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              @for (p of c.pesagens; track p.data + p.idadeDias) {
                <tr>
                  <td class="num">{{ data(p.data) }}</td>
                  <td class="num">{{ p.idadeDias }} d</td>
                  <td class="num">{{ num(p.pesoMedioG) }} g</td>
                  <td class="num">
                    {{
                      p.pesoPadraoG === null ? '—' : num(p.pesoPadraoG) + ' g'
                    }}
                  </td>
                  <td class="num">
                    {{
                      p.desvioPct === null ? '—' : num(p.desvioPct, 1) + ' %'
                    }}
                  </td>
                  <td class="num">
                    {{
                      p.gpdPeriodoG === null
                        ? '—'
                        : num(p.gpdPeriodoG, 1) + ' g/dia'
                    }}
                  </td>
                  <td>
                    @if (p.situacao) {
                      <crista-estado
                        [tom]="tomDaMeta(p.nivel, p.situacao)"
                        [texto]="nomeSituacao[p.situacao]"
                      />
                    } @else {
                      —
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="suave">Nenhuma pesagem registrada.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
      <p class="suave">
        "Dentro da meta" = até {{ faixaMeta }} % acima ou abaixo da curva padrão
        na mesma idade (faixa sombreada no gráfico).
      </p>
    }
  `,
})
export class AbaCurva implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly lote = inject(LoteAtual);

  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly nomeSituacao = NOME_SITUACAO_META;
  protected readonly tomDaMeta = tomDaMeta;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly gramas = (v: number) => `${formatarNumero(v)} g`;
  protected readonly faixaMeta = FAIXA_META_PCT;
  protected readonly curva = signal<CurvaLote | null>(null);
  protected readonly erro = signal('');

  protected readonly series = computed<SerieGrafico[]>(() => {
    const c = this.curva();
    if (!c) return [];
    return [
      {
        id: 'padrao',
        nome: 'Curva padrão',
        cor: '',
        referencia: true,
        pontos: c.curvaPadrao.map((p) => ({ x: p.idadeDias, y: p.pesoG })),
      },
      {
        id: 'real',
        nome: 'Peso médio',
        cor: 'var(--serie-1)',
        pontos: c.pesagens.map((p) => {
          const tom = tomDaMeta(p.nivel, p.situacao);
          return {
            x: p.idadeDias,
            y: p.pesoMedioG,
            nota: p.situacao
              ? `${NOME_SITUACAO_META[p.situacao]}` +
                (tom === 'atencao' || tom === 'critico'
                  ? ` (${ROTULO_TOM[tom].toLowerCase()})`
                  : '')
              : undefined,
            tom: tom === 'atencao' || tom === 'critico' ? tom : undefined,
          };
        }),
      },
    ];
  });

  protected readonly faixa = computed<FaixaGrafico | null>(() => {
    const c = this.curva();
    if (!c || c.curvaPadrao.length === 0) return null;
    const f = FAIXA_META_PCT / 100;
    return {
      nome: `Meta (±${FAIXA_META_PCT} %)`,
      pontos: c.curvaPadrao.map((p) => ({
        x: p.idadeDias,
        min: p.pesoG * (1 - f),
        max: p.pesoG * (1 + f),
      })),
    };
  });

  async ngOnInit(): Promise<void> {
    try {
      this.curva.set(
        await firstValueFrom(
          this.http.get<CurvaLote>(`${this.lote.url()}/curva`),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
