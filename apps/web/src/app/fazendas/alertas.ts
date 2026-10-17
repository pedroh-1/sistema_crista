import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { fecharAlertaSchema, regraAlertaSchema } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Alerta, ROTULO_CRITICIDADE } from '../nucleo/alertas';
import { mensagemErro, validar } from '../nucleo/erros';
import { formatarData, formatarNumero } from '../nucleo/formato';
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
  imports: [FormsModule, RouterLink],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    <section class="cartao">
      <h2>Alertas abertos</h2>
      @for (a of atual.alertasAbertos(); track a.id) {
        <article class="item" [class.critico]="a.criticidade === 'critico'">
          <div class="cabecalho-secao">
            <strong class="criticidade" [class]="a.criticidade">{{
              rotulo[a.criticidade]
            }}</strong>
            <span class="suave">
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
              {{ data(a.dataReferencia) }}
            </span>
          </div>
          <p>{{ a.mensagem }}.</p>
          @if (atual.pode('alerta.fechar')) {
            @if (fechando() === a.id) {
              <form class="formulario" (ngSubmit)="fechar(a)">
                <label>
                  Providência adotada
                  <input
                    name="providencia"
                    [(ngModel)]="providencia"
                    placeholder="Ex.: ajustada a ventilação; necropsia enviada ao laboratório"
                  />
                </label>
                @if (erroProvidencia()) {
                  <span class="erro-campo">{{ erroProvidencia() }}</span>
                }
                <div>
                  <button type="submit">Fechar alerta</button>
                  &nbsp;
                  <button
                    type="button"
                    class="secundario"
                    (click)="fechando.set(null)"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            } @else {
              <button
                type="button"
                class="secundario"
                (click)="abrirFechamento(a.id)"
              >
                Registrar providência e fechar
              </button>
            }
          }
        </article>
      } @empty {
        <p class="suave">Nenhum alerta aberto.</p>
      }
    </section>

    <section class="cartao">
      <h2>Limites dos alertas</h2>
      <p class="suave">
        Sem configuração, valem os limites padrão. Eles são provisórios até a
        validação com o veterinário (doc 06), e a mortalidade do dia usa o dobro
        na primeira semana. Alertas críticos são enviados por e-mail ao Gestor e
        ao Veterinário.
      </p>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Alerta quando</th>
              <th>Atenção</th>
              <th>Crítico</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (r of regras(); track r.indicador) {
              <tr>
                <td>
                  {{ r.nome }}
                  @if (!r.configurado) {
                    <br /><span class="etiqueta">padrão</span>
                  }
                </td>
                <td>
                  {{ r.direcao === 'acima' ? 'passa de' : 'fica abaixo de' }}
                </td>
                @if (editando() === r.indicador) {
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      [(ngModel)]="limites.atencao"
                      aria-label="Limite de atenção"
                    />{{ r.unidade }}
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      [(ngModel)]="limites.critico"
                      aria-label="Limite crítico"
                    />{{ r.unidade }}
                  </td>
                  <td>
                    <button type="button" (click)="salvar(r)">Salvar</button>
                    <button
                      type="button"
                      class="secundario"
                      (click)="editando.set(null)"
                    >
                      Cancelar
                    </button>
                  </td>
                } @else {
                  <td>
                    {{ num((r.configurado ?? r.padrao).atencao)
                    }}{{ r.unidade }}
                  </td>
                  <td>
                    {{ num((r.configurado ?? r.padrao).critico)
                    }}{{ r.unidade }}
                  </td>
                  <td>
                    @if (atual.pode('alerta.configurar')) {
                      <button
                        type="button"
                        class="secundario"
                        (click)="editar(r)"
                      >
                        Alterar
                      </button>
                      @if (r.configurado) {
                        <button
                          type="button"
                          class="secundario"
                          (click)="restaurar(r)"
                        >
                          Usar padrão
                        </button>
                      }
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (erroRegra()) {
        <span class="erro-campo">{{ erroRegra() }}</span>
      }
    </section>

    <section class="cartao">
      <h2>Alertas fechados</h2>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Alerta</th>
              <th>Providência</th>
              <th>Fechado por</th>
            </tr>
          </thead>
          <tbody>
            @for (a of fechados(); track a.id) {
              <tr>
                <td>{{ data(a.dataReferencia) }}</td>
                <td>{{ rotulo[a.criticidade] }} · {{ a.mensagem }}</td>
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
    .item {
      border-left: 4px solid #eda100;
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.75rem;
      background: var(--fundo);
      border-radius: 4px;
    }
    .item.critico {
      border-left-color: var(--perigo);
    }
    .item p {
      margin: 0.25rem 0 0.5rem;
    }
    .criticidade.atencao {
      color: #6b4b00;
    }
    .criticidade.critico {
      color: var(--perigo);
    }
    td input {
      width: 5.5rem;
    }
    td button {
      margin: 0.15rem;
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
