import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Indicador, NOME_LINHAGEM, NOME_PERFIL } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import {
  CLASSE_SITUACAO_META,
  ICONE_SITUACAO_META,
  NOME_SITUACAO_META,
} from '../lotes/situacao-meta';
import { mensagemErro } from '../nucleo/erros';
import {
  formatarData,
  formatarIndicador,
  formatarNumero,
} from '../nucleo/formato';
import { LoteNoResumo, ResumoFazenda } from '../nucleo/tipos';
import { Sessao } from '../nucleo/sessao';

/** Página inicial: cada fazenda com os lotes em andamento e o que pede atenção hoje. */
@Component({
  selector: 'crista-lista-fazendas',
  imports: [RouterLink],
  template: `
    <main class="pagina">
      <header class="cabecalho-secao">
        <h1>Minhas fazendas</h1>
        <a class="botao" routerLink="/fazendas/nova">Cadastrar fazenda</a>
      </header>

      @for (fazenda of sessao.fazendas(); track fazenda.id) {
        <article class="cartao fazenda">
          <header class="topo">
            <div>
              <h2>
                <a class="nome" [routerLink]="['/fazendas', fazenda.id]">{{
                  fazenda.nome
                }}</a>
              </h2>
              <span class="suave"
                >Seu perfil: {{ nomePerfil[fazenda.perfil] }}</span
              >
            </div>
            <a class="botao secundario" [routerLink]="['/fazendas', fazenda.id]"
              >Abrir fazenda</a
            >
          </header>

          @if (erros()[fazenda.id]; as erro) {
            <p class="aviso" role="alert">{{ erro }}</p>
          } @else if (resumos()[fazenda.id]; as r) {
            <dl class="numeros">
              <div>
                <dt>Lotes em andamento</dt>
                <dd>{{ r.lotes.length }}</dd>
              </div>
              <div>
                <dt>Aves no plantel</dt>
                <dd>{{ numero(r.saldoAves) }}</dd>
              </div>
              <div>
                <dt>Galpões ocupados</dt>
                <dd>
                  {{ r.galpoes.ocupados }}
                  <small>de {{ r.galpoes.total }}</small>
                </dd>
              </div>
              <div
                [class.critico]="r.alertas.criticos > 0"
                [class.atencao]="r.alertas.abertos > 0 && !r.alertas.criticos"
              >
                <dt>Alertas abertos</dt>
                <dd>
                  @if (r.alertas.abertos > 0) {
                    <a [routerLink]="['/fazendas', fazenda.id, 'alertas']"
                      >{{ r.alertas.criticos > 0 ? '‼' : '⚠' }}
                      {{ r.alertas.abertos }}</a
                    >
                    @if (r.alertas.criticos > 0) {
                      <small
                        >{{ r.alertas.criticos }}
                        {{
                          r.alertas.criticos === 1 ? 'crítico' : 'críticos'
                        }}</small
                      >
                    }
                  } @else {
                    <span class="ok">✓ 0</span>
                  }
                </dd>
              </div>
              <div
                [class.critico]="r.equipamentosParados.criticos > 0"
                [class.atencao]="
                  r.equipamentosParados.total > 0 &&
                  !r.equipamentosParados.criticos
                "
              >
                <dt>Equipamentos parados</dt>
                <dd>
                  @if (r.equipamentosParados.total > 0) {
                    <a [routerLink]="['/fazendas', fazenda.id, 'equipamentos']"
                      >{{ r.equipamentosParados.criticos > 0 ? '‼' : '⚠' }}
                      {{ r.equipamentosParados.total }}</a
                    >
                    @if (r.equipamentosParados.criticos > 0) {
                      <small
                        >{{ r.equipamentosParados.criticos }}
                        {{
                          r.equipamentosParados.criticos === 1
                            ? 'crítico'
                            : 'críticos'
                        }}</small
                      >
                    }
                  } @else {
                    <span class="ok">✓ 0</span>
                  }
                </dd>
              </div>
            </dl>

            @if (r.lotes.length > 0) {
              <div class="rolagem">
                <table class="tabela">
                  <thead>
                    <tr>
                      <th>Lote</th>
                      <th>Galpão</th>
                      <th class="num">Idade</th>
                      <th class="num">Aves</th>
                      <th class="num">Mortalidade</th>
                      <th class="num">Mortalidade hoje</th>
                      <th class="num">Peso médio</th>
                      <th>Meta de peso</th>
                      <th>Alertas</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (lote of r.lotes; track lote.id) {
                      <tr>
                        <td>
                          <a
                            class="codigo"
                            [routerLink]="[
                              '/fazendas',
                              fazenda.id,
                              'lotes',
                              lote.id,
                            ]"
                            >{{ lote.codigo }}</a
                          >
                          <span class="suave detalhe">{{
                            nomeLinhagem[lote.linhagem]
                          }}</span>
                          @if (lote.carenciaAte) {
                            <span
                              class="etiqueta info"
                              title="Carência de medicamento ou vacina"
                              >Carência até {{ data(lote.carenciaAte) }}</span
                            >
                          }
                        </td>
                        <td>{{ lote.galpao }}</td>
                        <td class="num">{{ lote.idadeDias }} dias</td>
                        <td class="num">{{ numero(lote.saldoAves) }}</td>
                        <td class="num" [attr.title]="motivo(lote.mortalidade)">
                          {{ indicador(lote.mortalidade, 2, '%') }}
                        </td>
                        <td
                          class="num"
                          [attr.title]="motivo(lote.mortalidadeHoje.percentual)"
                        >
                          @if (tomMortalidadeHoje(lote); as tom) {
                            <span class="etiqueta" [class]="tom"
                              >{{ tom === 'critico' ? '‼' : '⚠' }}
                              {{
                                indicador(
                                  lote.mortalidadeHoje.percentual,
                                  2,
                                  '%'
                                )
                              }}</span
                            >
                          } @else {
                            {{
                              indicador(lote.mortalidadeHoje.percentual, 2, '%')
                            }}
                          }
                        </td>
                        <td class="num" [attr.title]="motivo(lote.pesoMedioG)">
                          {{ indicador(lote.pesoMedioG, 0, ' g') }}
                          @if (lote.ultimaPesagem) {
                            <span class="suave detalhe"
                              >em {{ data(lote.ultimaPesagem) }}</span
                            >
                          }
                        </td>
                        <td>
                          @if (lote.situacaoMeta; as s) {
                            <span
                              class="etiqueta"
                              [class]="classeSituacaoMeta[s]"
                              >{{ iconeSituacaoMeta[s] }}
                              {{ nomeSituacaoMeta[s] }}</span
                            >
                          } @else {
                            <span class="suave">Sem pesagem</span>
                          }
                        </td>
                        <td>
                          @if (lote.alertas.abertos > 0) {
                            <a
                              class="etiqueta"
                              [class.critico]="lote.alertas.criticos > 0"
                              [class.atencao]="!lote.alertas.criticos"
                              [routerLink]="[
                                '/fazendas',
                                fazenda.id,
                                'alertas',
                              ]"
                              >{{ lote.alertas.criticos > 0 ? '‼' : '⚠' }}
                              {{ lote.alertas.abertos }}</a
                            >
                          } @else {
                            <span class="suave">—</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="suave sem-lotes">
                Nenhum lote em andamento.
                <a [routerLink]="['/fazendas', fazenda.id, 'lotes']"
                  >Ver lotes anteriores</a
                >
              </p>
            }
          } @else {
            <div class="numeros" aria-busy="true">
              @for (i of [1, 2, 3, 4, 5]; track i) {
                <span class="esqueleto" style="height: 52px"></span>
              }
            </div>
          }
        </article>
      } @empty {
        <div class="cartao">
          <h3>Você ainda não tem acesso a nenhuma fazenda</h3>
          <p class="suave">
            Cadastre a sua fazenda ou peça ao Gestor de uma fazenda que envie um
            convite para {{ sessao.usuario()?.email }}.
          </p>
        </div>
      }
    </main>
  `,
  styles: `
    .topo {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--espaco-4);
      margin-bottom: var(--espaco-4);
    }
    .topo h2 {
      margin: 0;
    }
    .nome {
      color: var(--texto);
      text-decoration: none;
    }
    .nome:hover {
      color: var(--primaria);
      text-decoration: underline;
    }
    .numeros {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: var(--espaco-3);
      margin: 0 0 var(--espaco-4);
    }
    .numeros > div {
      padding: var(--espaco-2) var(--espaco-3);
      border-radius: var(--raio-sm);
      background: var(--superficie-2);
      box-shadow: inset 3px 0 0 transparent;
    }
    .numeros > div.critico {
      background: var(--critico-fundo);
      box-shadow: inset 3px 0 0 var(--critico);
    }
    .numeros > div.atencao {
      background: var(--atencao-fundo);
      box-shadow: inset 3px 0 0 var(--atencao);
    }
    dt {
      font-size: 12px;
      line-height: 16px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--texto-suave);
    }
    dd {
      margin: 0;
      font-family: var(--font-titulo);
      font-size: 22px;
      line-height: 30px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    dd small {
      font-family: var(--font-texto);
      font-size: 13px;
      font-weight: 500;
      color: var(--texto-suave);
    }
    .critico dd a,
    .critico dd small {
      color: var(--critico);
    }
    .atencao dd a,
    .atencao dd small {
      color: var(--atencao);
    }
    .ok {
      color: var(--sucesso);
    }
    .codigo {
      font-weight: 600;
    }
    .detalhe {
      display: block;
      font-size: 12px;
      line-height: 16px;
    }
    td .etiqueta {
      text-decoration: none;
    }
    td:first-child .etiqueta {
      margin-top: var(--espaco-1);
    }
    .sem-lotes {
      margin: 0;
    }
    .cartao > .rolagem {
      margin: 0 calc(-1 * var(--espaco-5)) calc(-1 * var(--espaco-5));
      border-top: 1px solid var(--borda);
    }
    @media (max-width: 640px) {
      .numeros {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .topo .botao {
        display: none;
      }
    }
  `,
})
export class ListaFazendas implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly sessao = inject(Sessao);
  protected readonly nomePerfil = NOME_PERFIL;
  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly nomeSituacaoMeta = NOME_SITUACAO_META;
  protected readonly classeSituacaoMeta = CLASSE_SITUACAO_META;
  protected readonly iconeSituacaoMeta = ICONE_SITUACAO_META;
  protected readonly resumos = signal<Partial<Record<string, ResumoFazenda>>>(
    {},
  );
  protected readonly erros = signal<Partial<Record<string, string>>>({});
  protected readonly numero = formatarNumero;
  protected readonly data = formatarData;
  protected readonly indicador = formatarIndicador;

  ngOnInit(): void {
    // Uma chamada por fazenda: a lenta não segura as outras.
    for (const fazenda of this.sessao.fazendas()) {
      void this.carregar(fazenda.id);
    }
  }

  protected motivo(i: Indicador): string | null {
    return i.disponivel ? null : i.motivo;
  }

  protected tomMortalidadeHoje(
    lote: LoteNoResumo,
  ): 'critico' | 'atencao' | null {
    const nivel = lote.mortalidadeHoje.nivel;
    return nivel === 'critico' || nivel === 'atencao' ? nivel : null;
  }

  private async carregar(id: string): Promise<void> {
    try {
      const resumo = await firstValueFrom(
        this.http.get<ResumoFazenda>(`/api/fazendas/${id}/resumo`),
      );
      this.resumos.update((atual) => ({ ...atual, [id]: resumo }));
    } catch (e) {
      this.erros.update((atual) => ({ ...atual, [id]: mensagemErro(e) }));
    }
  }
}
