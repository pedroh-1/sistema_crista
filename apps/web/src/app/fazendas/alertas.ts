import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { fecharAlertaSchema, regraAlertaSchema } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Alerta, ROTULO_CRITICIDADE } from '../nucleo/alertas';
import { mensagemErro, validar } from '../nucleo/erros';
import { formatarData, formatarNumero } from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { FazendaAtual } from './fazenda-atual';

interface Regra {
  indicador: 'mortalidade_dia' | 'desvio_peso' | 'uniformidade';
  nome: string;
  unidade: string;
  direcao: 'acima' | 'abaixo';
  padrao: { atencao: number; critico: number };
  configurado: { atencao: number; critico: number } | null;
}

/** UC16: alertas de desvio da fazenda e configuração dos limites. */
@Component({
  selector: 'crista-alertas',
  imports: [FormsModule, RouterLink, PrimeiroCampo],
  template: `
    <h1>Alertas</h1>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    <section class="cartao">
      <div class="cabecalho-secao">
        <h3>Abertos</h3>
        <span class="suave"
          >Alertas críticos vão por e-mail ao Gestor e ao Veterinário.</span
        >
      </div>
      <div class="lista">
        @for (a of atual.alertasAbertos(); track a.id) {
          <article class="item">
            <span class="etiqueta" [class]="a.criticidade">{{
              rotulo[a.criticidade]
            }}</span>
            <div class="texto">
              <p>{{ a.mensagem }}.</p>
              <p class="suave">
                @if (a.loteId) {
                  <a [routerLink]="atual.link('lotes', a.loteId)"
                    >Lote {{ a.lote }}</a
                  >
                  ·
                }
                @if (a.equipamentoId) {
                  <a [routerLink]="atual.link('equipamentos', a.equipamentoId)"
                    >Ver equipamento</a
                  >
                  ·
                }
                <span class="num">{{ data(a.dataReferencia) }}</span>
              </p>
            </div>
            @if (atual.pode('alerta.fechar') && fechando() !== a.id) {
              <button
                type="button"
                class="secundario pequeno"
                (click)="abrirFechamento(a.id)"
              >
                Fechar alerta
              </button>
            }
            @if (fechando() === a.id) {
              <form class="fechamento" (ngSubmit)="fechar(a)">
                <label>
                  Providência adotada
                  <input
                    cristaPrimeiroCampo
                    name="providencia"
                    [(ngModel)]="providencia"
                    placeholder="Ex.: ajustada a ventilação; necropsia enviada ao laboratório"
                  />
                  @if (erroProvidencia()) {
                    <span class="erro-campo">{{ erroProvidencia() }}</span>
                  }
                </label>
                <div class="acoes">
                  <button type="submit">Fechar alerta</button>
                  <button
                    type="button"
                    class="fantasma"
                    (click)="fechando.set(null)"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            }
          </article>
        } @empty {
          <p class="vazio suave">✓ Nenhum alerta aberto.</p>
        }
      </div>
    </section>

    <section class="cartao">
      <h3>Limites dos alertas</h3>
      <p class="suave">
        Sem configuração, valem os limites padrão. Eles são provisórios até a
        validação com o veterinário (doc 06), e a mortalidade do dia usa o dobro
        na primeira semana.
      </p>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Alerta quando</th>
              <th class="num">Atenção</th>
              <th class="num">Crítico</th>
              <th class="acao"><span class="visivel-leitor">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (r of regras(); track r.indicador) {
              <tr>
                <td>
                  {{ r.nome }}
                  @if (!r.configurado) {
                    <span class="etiqueta">Padrão</span>
                  }
                </td>
                <td>
                  {{ r.direcao === 'acima' ? 'passa de' : 'fica abaixo de' }}
                </td>
                @if (editando() === r.indicador) {
                  <td class="num">
                    <span class="campo-unidade limite">
                      <input
                        type="number"
                        step="0.01"
                        [(ngModel)]="limites.atencao"
                        aria-label="Limite de atenção"
                      />
                      <span>{{ r.unidade }}</span>
                    </span>
                  </td>
                  <td class="num">
                    <span class="campo-unidade limite">
                      <input
                        type="number"
                        step="0.01"
                        [(ngModel)]="limites.critico"
                        aria-label="Limite crítico"
                      />
                      <span>{{ r.unidade }}</span>
                    </span>
                  </td>
                  <td class="acao">
                    <div class="acoes">
                      <button type="button" class="pequeno" (click)="salvar(r)">
                        Salvar
                      </button>
                      <button
                        type="button"
                        class="fantasma pequeno"
                        (click)="editando.set(null)"
                      >
                        Cancelar
                      </button>
                    </div>
                  </td>
                } @else {
                  <td class="num">
                    {{ num((r.configurado ?? r.padrao).atencao) }}
                    {{ r.unidade }}
                  </td>
                  <td class="num">
                    {{ num((r.configurado ?? r.padrao).critico) }}
                    {{ r.unidade }}
                  </td>
                  <td class="acao">
                    @if (atual.pode('alerta.configurar')) {
                      <div class="acoes">
                        @if (r.configurado) {
                          <button
                            type="button"
                            class="fantasma pequeno"
                            (click)="restaurar(r)"
                          >
                            Usar padrão
                          </button>
                        }
                        <button
                          type="button"
                          class="fantasma pequeno"
                          (click)="editar(r)"
                        >
                          Alterar
                        </button>
                      </div>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (erroRegra()) {
        <p class="aviso" role="alert">{{ erroRegra() }}</p>
      }
    </section>

    <section class="cartao">
      <h3>Fechados</h3>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th class="num">Data</th>
              <th>Alerta</th>
              <th>Providência</th>
              <th>Fechado por</th>
            </tr>
          </thead>
          <tbody>
            @for (a of fechados(); track a.id) {
              <tr>
                <td class="num">{{ data(a.dataReferencia) }}</td>
                <td>
                  <span class="etiqueta" [class]="a.criticidade">{{
                    rotulo[a.criticidade]
                  }}</span>
                  {{ a.mensagem }}
                </td>
                <td>{{ a.providencia }}</td>
                <td>{{ a.fechadoPor ?? '—' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="suave">Nenhum alerta fechado.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .lista {
      margin: 0 calc(-1 * var(--espaco-5)) calc(-1 * var(--espaco-5));
      border-top: 1px solid var(--borda);
    }
    .item {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr) auto;
      gap: var(--espaco-2) var(--espaco-4);
      align-items: start;
      padding: var(--espaco-4) var(--espaco-5);
      border-bottom: 1px solid var(--borda);
    }
    .item:last-child {
      border-bottom: 0;
    }
    .item .etiqueta {
      justify-self: start;
    }
    .texto p {
      margin: 0;
    }
    .fechamento {
      grid-column: 2 / -1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--espaco-3);
      align-items: start;
    }
    .fechamento .acoes {
      padding-top: 22px;
    }
    .vazio {
      margin: 0;
      padding: var(--espaco-4) var(--espaco-5);
    }
    .limite {
      display: inline-block;
      width: 120px;
    }
    .acao .acoes {
      justify-content: flex-end;
      flex-wrap: nowrap;
    }
    @media (max-width: 640px) {
      .item,
      .fechamento {
        grid-template-columns: 1fr;
      }
      .fechamento {
        grid-column: auto;
      }
      .lista {
        margin: 0 calc(-1 * var(--espaco-4)) calc(-1 * var(--espaco-4));
      }
    }
  `,
})
export class Alertas implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly atual = inject(FazendaAtual);

  protected readonly rotulo = ROTULO_CRITICIDADE;
  protected readonly data = formatarData;
  protected readonly num = (v: number) => formatarNumero(v, 2);
  protected readonly fechados = signal<Alerta[]>([]);
  protected readonly regras = signal<Regra[]>([]);
  protected readonly fechando = signal<string | null>(null);
  protected readonly editando = signal<string | null>(null);
  protected readonly erro = signal('');
  protected readonly erroProvidencia = signal('');
  protected readonly erroRegra = signal('');
  protected providencia = '';
  protected limites = { atencao: 0, critico: 0 };

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([
        this.atual.recarregarAlertas(),
        this.carregarFechados(),
        this.carregarRegras(),
      ]);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  abrirFechamento(id: string): void {
    this.providencia = '';
    this.erroProvidencia.set('');
    this.fechando.set(id);
  }

  async fechar(a: Alerta): Promise<void> {
    const v = validar(fecharAlertaSchema, { providencia: this.providencia });
    this.erroProvidencia.set(
      v.ok ? '' : (v.erros['providencia'] ?? 'Descreva a providência'),
    );
    if (!v.ok) return;
    try {
      await firstValueFrom(
        this.http.post(`${this.atual.url()}/alertas/${a.id}/fechar`, v.dados),
      );
      this.fechando.set(null);
      await Promise.all([
        this.atual.recarregarAlertas(),
        this.carregarFechados(),
      ]);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  editar(r: Regra): void {
    this.limites = { ...(r.configurado ?? r.padrao) };
    this.erroRegra.set('');
    this.editando.set(r.indicador);
  }

  async salvar(r: Regra): Promise<void> {
    const v = validar(regraAlertaSchema, {
      indicador: r.indicador,
      limiteAtencao: this.limites.atencao,
      limiteCritico: this.limites.critico,
    });
    this.erroRegra.set(v.ok ? '' : Object.values(v.erros)[0]);
    if (!v.ok) return;
    try {
      this.regras.set(
        await firstValueFrom(
          this.http.put<Regra[]>(`${this.atual.url()}/regras-alerta`, v.dados),
        ),
      );
      this.editando.set(null);
    } catch (e) {
      this.erroRegra.set(mensagemErro(e));
    }
  }

  async restaurar(r: Regra): Promise<void> {
    try {
      this.regras.set(
        await firstValueFrom(
          this.http.delete<Regra[]>(
            `${this.atual.url()}/regras-alerta/${r.indicador}`,
          ),
        ),
      );
    } catch (e) {
      this.erroRegra.set(mensagemErro(e));
    }
  }

  private async carregarFechados(): Promise<void> {
    this.fechados.set(
      await firstValueFrom(
        this.http.get<Alerta[]>(`${this.atual.url()}/alertas`, {
          params: { status: 'fechado' },
        }),
      ),
    );
  }

  private async carregarRegras(): Promise<void> {
    this.regras.set(
      await firstValueFrom(
        this.http.get<Regra[]>(`${this.atual.url()}/regras-alerta`),
      ),
    );
  }
}
