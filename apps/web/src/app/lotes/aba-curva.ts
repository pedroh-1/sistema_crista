import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NOME_LINHAGEM } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { mensagemErro } from '../nucleo/erros';
import { formatarData, formatarNumero } from '../nucleo/formato';
import { GraficoLinhas, SerieGrafico } from '../nucleo/grafico-linhas';
import { LoteAtual } from './lote-atual';
import { CurvaLote, SituacaoMeta } from './tipos';

export const NOME_SITUACAO_META: Record<SituacaoMeta, string> = {
  abaixo: 'Abaixo da meta',
  dentro: 'Dentro da meta',
  acima: 'Acima da meta',
};

/** Tom da etiqueta: abaixo da meta é crítico, acima pede atenção. */
export const CLASSE_SITUACAO_META: Record<SituacaoMeta, string> = {
  abaixo: 'critico',
  dentro: 'sucesso',
  acima: 'atencao',
};

/** Situação nunca só por cor: o glifo vai junto do texto. */
export const ICONE_SITUACAO_META: Record<SituacaoMeta, string> = {
  abaixo: '‼',
  dentro: '✓',
  acima: '⚠',
};

/** UC11: evolução do peso médio contra a curva padrão da linhagem. */
@Component({
  selector: 'crista-aba-curva',
  imports: [GraficoLinhas],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (curva(); as c) {
      @if (c.fonteCurva === 'sintetico') {
        <p class="aviso atencao">
          Curva de teste: os valores padrão ainda não são os do manual da
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
            [formatoY]="gramas"
            descricao="Peso médio das pesagens comparado com a curva padrão da linhagem, por idade em dias"
          />
        }
      </section>

      <section class="cartao">
        <h3>Pesagens contra a meta</h3>
        <div class="rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Idade</th>
                <th>Peso médio</th>
                <th>Padrão</th>
                <th>Desvio</th>
                <th>Ganho no período</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              @for (p of c.pesagens; track p.data + p.idadeDias) {
                <tr>
                  <td>{{ data(p.data) }}</td>
                  <td>{{ p.idadeDias }} d</td>
                  <td>{{ num(p.pesoMedioG) }} g</td>
                  <td>
                    {{
                      p.pesoPadraoG === null ? '—' : num(p.pesoPadraoG) + ' g'
                    }}
                  </td>
                  <td>
                    {{ p.desvioPct === null ? '—' : num(p.desvioPct, 1) + '%' }}
                  </td>
                  <td>
                    {{
                      p.gpdPeriodoG === null
                        ? '—'
                        : num(p.gpdPeriodoG, 1) + ' g/dia'
                    }}
                  </td>
                  <td>
                    @if (p.situacao) {
                      <span class="situacao-meta" [class]="p.situacao">{{
                        nomeSituacao[p.situacao]
                      }}</span>
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
        <p class="suave">
          "Dentro da meta" = até 5% acima ou abaixo da curva padrão na mesma
          idade.
        </p>
      </section>
    }
  `,
})
export class AbaCurva implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly lote = inject(LoteAtual);

  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly nomeSituacao = NOME_SITUACAO_META;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly gramas = (v: number) => `${formatarNumero(v)} g`;
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
        pontos: c.pesagens.map((p) => ({ x: p.idadeDias, y: p.pesoMedioG })),
      },
    ];
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
