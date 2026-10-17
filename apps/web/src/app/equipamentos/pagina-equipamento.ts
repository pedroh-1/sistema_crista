import { HttpClient } from '@angular/common/http';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  manutencaoSchema,
  NOME_SITUACAO_PREVENTIVA,
  NOME_TIPO_EQUIPAMENTO,
  NOME_TIPO_MANUTENCAO,
  retornoOperacaoSchema,
  TipoManutencao,
  TIPOS_MANUTENCAO,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Dialogos } from '../nucleo/dialogos';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { formatarData, formatarNumero, hoje } from '../nucleo/formato';
import { FormEquipamento } from './form-equipamento';
import {
  agoraLocal,
  CLASSE_PREVENTIVA,
  dataHoraParaISO,
  Equipamento,
  formatarDataHora,
  Manutencao,
} from './tipos';

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const vazio = () => ({
  tipo: 'corretiva' as TipoManutencao,
  data: hoje(),
  descricao: '',
  custoPecas: null as number | null,
  custoMaoObra: null as number | null,
  fornecedor: '',
  ordemServico: '',
  parou: false,
  paradaInicio: '',
  retornoOperacao: '',
});

/** UC18 e UC19: ficha do equipamento e histórico de manutenções. */
@Component({
  selector: 'crista-pagina-equipamento',
  imports: [FormsModule, RouterLink, FormEquipamento],
  template: `
    <p><a [routerLink]="atual.link('equipamentos')">← Equipamentos</a></p>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (equipamento(); as e) {
      <section class="cartao">
        <div class="cabecalho-secao">
          <h2>{{ e.nome }}</h2>
          @if (atual.pode('equipamento.cadastrar') && !editando()) {
            <button
              type="button"
              class="secundario"
              (click)="editando.set(true)"
            >
              Editar cadastro
            </button>
          }
        </div>
        @if (editando()) {
          <crista-form-equipamento
            [equipamento]="e"
            (salvo)="aoEditar($event)"
            (cancelado)="editando.set(false)"
          />
        } @else {
          @if (e.paradoDesde) {
            <p class="aviso" role="status">
              ⛔ Parado desde {{ dataHora(e.paradoDesde) }}.
              @if (e.critico) {
                Equipamento crítico: há um alerta aberto até o retorno.
              }
            </p>
          }
          <dl class="ficha">
            <div>
              <dt>Tipo</dt>
              <dd>{{ nomeTipo[e.tipo] }}</dd>
            </div>
            <div>
              <dt>Local</dt>
              <dd>{{ e.galpao ? 'Galpão ' + e.galpao : 'Fazenda inteira' }}</dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>
                {{ e.situacao === 'inativo' ? 'Inativo' : 'Ativo' }}
                {{ e.critico ? '· crítico' : '' }}
              </dd>
            </div>
            <div>
              <dt>Número de série</dt>
              <dd>{{ e.numeroSerie ?? '—' }}</dd>
            </div>
            <div>
              <dt>Fabricante / modelo</dt>
              <dd>
                {{ e.fabricante ?? '—' }}{{ e.modelo ? ' · ' + e.modelo : '' }}
              </dd>
            </div>
            <div>
              <dt>Aquisição</dt>
              <dd>{{ data(e.dataAquisicao) }}</dd>
            </div>
            <div>
              <dt>Preventiva</dt>
              <dd>
                <span
                  class="etiqueta"
                  [class]="classePreventiva[e.situacaoPreventiva]"
                  >{{ nomePreventiva[e.situacaoPreventiva] }}</span
                >
                @if (e.proximaPreventiva) {
                  {{ data(e.proximaPreventiva) }}
                }
                @if (e.periodicidadeDias) {
                  <span class="suave">
                    (a cada {{ e.periodicidadeDias }} dias)</span
                  >
                }
              </dd>
            </div>
            @if (e.custoTotal !== null) {
              <div>
                <dt>Custo de manutenção</dt>
                <dd>{{ brl(e.custoTotal) }}</dd>
              </div>
            }
          </dl>
        }
      </section>

      @if (atual.pode('manutencao.registrar') && e.situacao === 'ativo') {
        <form class="cartao formulario" (ngSubmit)="registrar()">
          <h2>Registrar manutenção</h2>
          <div class="grade-2">
            <label>
              Tipo
              <select name="tipo" [(ngModel)]="dados.tipo">
                @for (t of tiposManutencao; track t) {
                  <option [value]="t">{{ nomeTipoManutencao[t] }}</option>
                }
              </select>
            </label>
            <label>
              Data do serviço
              <input
                type="date"
                name="data"
                [max]="hoje"
                [(ngModel)]="dados.data"
              />
              @if (erros()['data']) {
                <span class="erro-campo">{{ erros()['data'] }}</span>
              }
            </label>
            <label>
              O que foi feito
              <input
                name="descricao"
                placeholder="Ex.: troca da correia do exaustor"
                [(ngModel)]="dados.descricao"
              />
              @if (erros()['descricao']) {
                <span class="erro-campo">{{ erros()['descricao'] }}</span>
              }
            </label>
            <label>
              Ordem de serviço (opcional)
              <input name="os" [(ngModel)]="dados.ordemServico" />
            </label>
            <label>
              Custo das peças (R$)
              <input
                type="number"
                name="pecas"
                min="0"
                step="0.01"
                [(ngModel)]="dados.custoPecas"
              />
              @if (erros()['custoPecas']) {
                <span class="erro-campo">{{ erros()['custoPecas'] }}</span>
              }
            </label>
            <label>
              Custo da mão de obra (R$)
              <input
                type="number"
                name="maoObra"
                min="0"
                step="0.01"
                [(ngModel)]="dados.custoMaoObra"
              />
              @if (erros()['custoMaoObra']) {
                <span class="erro-campo">{{ erros()['custoMaoObra'] }}</span>
              }
            </label>
            <label>
              Fornecedor ou técnico (opcional)
              <input name="fornecedor" [(ngModel)]="dados.fornecedor" />
            </label>
          </div>
          <p class="suave">
            Com custo, a manutenção gera a despesa:
            {{
              e.galpao
                ? 'vai para o lote em andamento do galpão ' + e.galpao
                : 'é rateada entre os lotes em andamento, pelas aves alojadas'
            }}; sem lote, fica como despesa da fazenda.
          </p>

          <label class="caixa">
            <input type="checkbox" name="parou" [(ngModel)]="dados.parou" />
            O equipamento ficou parado
          </label>
          @if (dados.parou) {
            <div class="grade-2">
              <label>
                Parou em
                <input
                  type="datetime-local"
                  name="paradaInicio"
                  [(ngModel)]="dados.paradaInicio"
                />
                @if (erros()['paradaInicio']) {
                  <span class="erro-campo">{{ erros()['paradaInicio'] }}</span>
                }
              </label>
              <label>
                Voltou a operar em (vazio se ainda parado)
                <input
                  type="datetime-local"
                  name="retornoOperacao"
                  [(ngModel)]="dados.retornoOperacao"
                />
                @if (erros()['retornoOperacao']) {
                  <span class="erro-campo">{{
                    erros()['retornoOperacao']
                  }}</span>
                }
              </label>
            </div>
          }
          <div>
            <button type="submit" [disabled]="enviando()">
              Registrar manutenção
            </button>
          </div>
        </form>
      }

      <section class="cartao">
        <h2>Histórico de manutenções</h2>
        <div class="rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Parada</th>
                @if (e.custoTotal !== null) {
                  <th>Custo</th>
                }
                <th>Registrada por</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (m of manutencoes(); track m.id) {
                <tr [class.estornado]="m.estorno">
                  <td>{{ data(m.data) }}</td>
                  <td>{{ nomeTipoManutencao[m.tipo] }}</td>
                  <td>
                    {{ m.descricao }}
                    @if (m.ordemServico) {
                      <span class="suave">· OS {{ m.ordemServico }}</span>
                    }
                  </td>
                  <td>
                    @if (m.paradaInicio) {
                      {{ dataHora(m.paradaInicio) }} →
                      @if (m.retornoOperacao) {
                        {{ dataHora(m.retornoOperacao) }}
                      } @else {
                        <strong>sem retorno</strong>
                      }
                      <span class="suave">({{ num(m.horasParado) }} h)</span>
                    } @else {
                      <span class="suave">—</span>
                    }
                  </td>
                  @if (e.custoTotal !== null) {
                    <td>{{ m.custoTotal ? brl(m.custoTotal) : '—' }}</td>
                  }
                  <td>{{ m.registradoPor ?? '—' }}</td>
                  <td class="acoes">
                    @if (m.estorno) {
                      <span class="etiqueta inativo" [title]="m.estorno.motivo"
                        >Estornada</span
                      >
                    } @else if (atual.pode('manutencao.registrar')) {
                      @if (m.paradaInicio && !m.retornoOperacao) {
                        @if (retornando() === m.id) {
                          <form (ngSubmit)="registrarRetorno(m)">
                            <input
                              type="datetime-local"
                              name="retorno"
                              aria-label="Voltou a operar em"
                              [(ngModel)]="retorno"
                            />
                            <button type="submit">Salvar</button>
                            <button
                              type="button"
                              class="secundario"
                              (click)="retornando.set(null)"
                            >
                              Cancelar
                            </button>
                          </form>
                        } @else {
                          <button type="button" (click)="abrirRetorno(m.id)">
                            Registrar retorno
                          </button>
                        }
                      }
                      <button
                        type="button"
                        class="secundario"
                        (click)="estornar(m)"
                      >
                        Corrigir
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="suave">
                    Nenhuma manutenção registrada.
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
    .ficha {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.75rem 1.5rem;
      margin: 0;
    }
    .ficha dt {
      font-size: 0.8rem;
      color: var(--texto-suave);
    }
    .ficha dd {
      margin: 0.1rem 0 0;
    }
    .acoes {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .acoes form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
    }
    .estornado td:not(:last-child) {
      text-decoration: line-through;
      color: var(--texto-suave);
    }
  `,
})
export class PaginaEquipamento {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(Dialogos);
  protected readonly atual = inject(FazendaAtual);

  readonly idEquipamento = input.required<string>();

  protected readonly hoje = hoje();
  protected readonly nomeTipo = NOME_TIPO_EQUIPAMENTO;
  protected readonly nomePreventiva = NOME_SITUACAO_PREVENTIVA;
  protected readonly classePreventiva = CLASSE_PREVENTIVA;
  protected readonly tiposManutencao = TIPOS_MANUTENCAO;
  protected readonly nomeTipoManutencao = NOME_TIPO_MANUTENCAO;
  protected readonly data = formatarData;
  protected readonly dataHora = formatarDataHora;
  protected readonly num = formatarNumero;
  protected readonly brl = (v: number) => reais.format(v);

  protected readonly equipamento = signal<Equipamento | null>(null);
  protected readonly manutencoes = signal<Manutencao[]>([]);
  protected readonly editando = signal(false);
  protected readonly retornando = signal<string | null>(null);
  protected retorno = '';
  protected dados = vazio();
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  constructor() {
    effect(() => {
      const id = this.idEquipamento();
      this.erro.set('');
      this.carregar(id).catch((e) => this.erro.set(mensagemErro(e)));
    });
  }

  aoEditar(e: Equipamento): void {
    this.equipamento.set(e);
    this.editando.set(false);
  }

  async registrar(): Promise<void> {
    const { parou, ...dados } = this.dados;
    const v = validar(manutencaoSchema, {
      ...dados,
      custoPecas: dados.custoPecas ?? undefined,
      custoMaoObra: dados.custoMaoObra ?? undefined,
      paradaInicio: parou ? dataHoraParaISO(dados.paradaInicio) : undefined,
      retornoOperacao: parou
        ? dataHoraParaISO(dados.retornoOperacao)
        : undefined,
    });
    const erros = v.ok ? {} : v.erros;
    if (parou && !dados.paradaInicio)
      erros['paradaInicio'] = 'Informe quando o equipamento parou';
    this.erros.set(erros);
    if (!v.ok || Object.keys(erros).length > 0) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.url()}/manutencoes`, v.dados),
      );
      this.dados = vazio();
      await this.carregar(this.idEquipamento());
      await this.atual.recarregarAlertas();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  abrirRetorno(id: string): void {
    this.retorno = agoraLocal();
    this.retornando.set(id);
  }

  async registrarRetorno(m: Manutencao): Promise<void> {
    const v = validar(retornoOperacaoSchema, {
      retornoOperacao: dataHoraParaISO(this.retorno),
    });
    if (!v.ok) {
      this.erro.set('Informe quando o equipamento voltou a operar');
      return;
    }
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.url()}/manutencoes/${m.id}/retorno`, v.dados),
      );
      this.retornando.set(null);
      await this.carregar(this.idEquipamento());
      await this.atual.recarregarAlertas();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  async estornar(m: Manutencao): Promise<void> {
    const motivo = await this.dialogos.pedirMotivo(
      'Estornar manutenção',
      'A manutenção e a despesa gerada continuam no histórico, riscadas, com o motivo.',
    );
    if (!motivo) return;
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.url()}/manutencoes/${m.id}/estornar`, {
          motivo,
        }),
      );
      await this.carregar(this.idEquipamento());
      await this.atual.recarregarAlertas();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  private url(): string {
    return `${this.atual.url()}/equipamentos/${this.idEquipamento()}`;
  }

  private async carregar(id: string): Promise<void> {
    const base = `${this.atual.url()}/equipamentos/${id}`;
    const [equipamento, manutencoes] = await Promise.all([
      firstValueFrom(this.http.get<Equipamento>(base)),
      firstValueFrom(this.http.get<Manutencao[]>(`${base}/manutencoes`)),
    ]);
    this.equipamento.set(equipamento);
    this.manutencoes.set(manutencoes);
  }
}
