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
import {
  formatarData,
  formatarNumero,
  formatarReais,
  hoje,
} from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { FormEquipamento } from './form-equipamento';
import {
  agoraLocal,
  CLASSE_PREVENTIVA,
  dataHoraParaISO,
  Equipamento,
  formatarDataHora,
  ICONE_PREVENTIVA,
  Manutencao,
} from './tipos';

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
  imports: [FormsModule, RouterLink, FormEquipamento, PrimeiroCampo],
  template: `
    <nav class="trilha" aria-label="Caminho">
      <a [routerLink]="atual.link('equipamentos')">Equipamentos</a>
      @if (equipamento(); as e) {
        <span aria-hidden="true">/</span><span>{{ e.nome }}</span>
      }
    </nav>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (equipamento(); as e) {
      <header class="cabecalho-secao">
        <div>
          <h1>{{ e.nome }}</h1>
          <div class="acoes">
            @if (e.situacao === 'inativo') {
              <span class="etiqueta">Inativo</span>
            } @else if (e.paradoDesde) {
              <span class="etiqueta critico">‼ Parado</span>
            } @else {
              <span class="etiqueta sucesso">✓ Em operação</span>
            }
            <span
              class="etiqueta"
              [class]="classePreventiva[e.situacaoPreventiva]"
              >{{ iconePreventiva[e.situacaoPreventiva] }} Preventiva:
              {{ nomePreventiva[e.situacaoPreventiva] }}</span
            >
            <span class="suave"
              >{{ nomeTipo[e.tipo] }} ·
              {{ e.galpao ? e.galpao : 'Fazenda inteira' }}
              {{ e.critico ? '· crítico' : '' }}</span
            >
          </div>
        </div>
        @if (atual.pode('equipamento.cadastrar') && !editando()) {
          <button type="button" class="secundario" (click)="editando.set(true)">
            Editar cadastro
          </button>
        }
      </header>

      @if (e.paradoDesde) {
        <p class="aviso" role="status">
          ‼ Parado desde {{ dataHora(e.paradoDesde) }}.
          @if (e.critico) {
            Equipamento crítico: há um alerta aberto até o retorno.
          }
        </p>
      }

      @if (editando()) {
        <section class="cartao">
          <h3>Editar cadastro</h3>
          <crista-form-equipamento
            [equipamento]="e"
            (salvo)="aoEditar($event)"
            (cancelado)="editando.set(false)"
          />
        </section>
      } @else {
        <dl class="ficha cartao">
          <div>
            <dt>Próxima preventiva</dt>
            <dd class="num">
              {{ data(e.proximaPreventiva) }}
              @if (e.periodicidadeDias) {
                <span class="suave">
                  (a cada {{ e.periodicidadeDias }} dias)</span
                >
              }
            </dd>
          </div>
          <div>
            <dt>Última manutenção</dt>
            <dd class="num">{{ data(e.ultimaManutencao) }}</dd>
          </div>
          @if (e.custoTotal !== null) {
            <div>
              <dt>Custo de manutenção</dt>
              <dd class="num">{{ brl(e.custoTotal) }}</dd>
            </div>
          }
          <div>
            <dt>Fabricante / modelo</dt>
            <dd>
              {{ e.fabricante ?? '—' }}{{ e.modelo ? ' · ' + e.modelo : '' }}
            </dd>
          </div>
          <div>
            <dt>Número de série</dt>
            <dd>{{ e.numeroSerie ?? '—' }}</dd>
          </div>
          <div>
            <dt>Aquisição</dt>
            <dd class="num">{{ data(e.dataAquisicao) }}</dd>
          </div>
        </dl>
      }

      @if (atual.pode('manutencao.registrar') && e.situacao === 'ativo') {
        <form class="cartao formulario" (ngSubmit)="registrar()">
          <h3>Registrar manutenção</h3>
          <div class="linha-campos servico">
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
                cristaPrimeiroCampo
                name="descricao"
                placeholder="Ex.: troca da correia do exaustor"
                [(ngModel)]="dados.descricao"
              />
              @if (erros()['descricao']) {
                <span class="erro-campo">{{ erros()['descricao'] }}</span>
              }
            </label>
          </div>
          <div class="linha-campos custos">
            <label>
              Custo das peças
              <span class="campo-unidade prefixo">
                <input
                  type="number"
                  name="pecas"
                  min="0"
                  step="0.01"
                  [(ngModel)]="dados.custoPecas"
                />
                <span>R$</span>
              </span>
              @if (erros()['custoPecas']) {
                <span class="erro-campo">{{ erros()['custoPecas'] }}</span>
              }
            </label>
            <label>
              Custo da mão de obra
              <span class="campo-unidade prefixo">
                <input
                  type="number"
                  name="maoObra"
                  min="0"
                  step="0.01"
                  [(ngModel)]="dados.custoMaoObra"
                />
                <span>R$</span>
              </span>
              @if (erros()['custoMaoObra']) {
                <span class="erro-campo">{{ erros()['custoMaoObra'] }}</span>
              }
            </label>
          </div>
          <span class="ajuda">
            Com custo, a manutenção gera a despesa:
            {{
              e.galpao
                ? 'vai para o lote em andamento de ' + e.galpao
                : 'é rateada entre os lotes em andamento, pelas aves alojadas'
            }}; sem lote, fica como despesa da fazenda.
          </span>

          <label class="caixa">
            <input type="checkbox" name="parou" [(ngModel)]="dados.parou" />
            O equipamento ficou parado
          </label>
          @if (dados.parou) {
            <div class="linha-campos">
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
          <details class="mais">
            <summary>Ordem de serviço e fornecedor</summary>
            <div class="linha-campos">
              <label>
                Ordem de serviço (opcional)
                <input name="os" [(ngModel)]="dados.ordemServico" />
              </label>
              <label>
                Fornecedor ou técnico (opcional)
                <input name="fornecedor" [(ngModel)]="dados.fornecedor" />
              </label>
            </div>
          </details>
          <div>
            <button type="submit" [disabled]="enviando()">
              {{ enviando() ? 'Registrando…' : 'Registrar manutenção' }}
            </button>
          </div>
        </form>
      }

      <section class="cartao">
        <h3>Histórico de manutenções</h3>
        <div class="rolagem">
          <table class="tabela">
            <thead>
              <tr>
                <th class="num">Data</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Parada</th>
                @if (e.custoTotal !== null) {
                  <th class="num">Custo</th>
                }
                <th>Registrada por</th>
                <th class="acao"><span class="visivel-leitor">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (m of manutencoes(); track m.id) {
                <tr [class.estornada]="m.estorno">
                  <td class="num riscar">{{ data(m.data) }}</td>
                  <td class="riscar">{{ nomeTipoManutencao[m.tipo] }}</td>
                  <td>
                    <span class="riscar">{{ m.descricao }}</span>
                    @if (m.ordemServico) {
                      <span class="suave"> · OS {{ m.ordemServico }}</span>
                    }
                    @if (m.estorno) {
                      <span class="motivo-estorno"
                        >Estornada: {{ m.estorno.motivo }}</span
                      >
                    }
                  </td>
                  <td class="riscar">
                    @if (m.paradaInicio) {
                      <span class="num">{{ dataHora(m.paradaInicio) }}</span> →
                      @if (m.retornoOperacao) {
                        <span class="num">{{
                          dataHora(m.retornoOperacao)
                        }}</span>
                      } @else {
                        <span class="etiqueta critico">‼ Sem retorno</span>
                      }
                      <span class="suave num">
                        ({{ num(m.horasParado) }} h)</span
                      >
                    } @else {
                      <span class="suave">—</span>
                    }
                  </td>
                  @if (e.custoTotal !== null) {
                    <td class="num riscar">
                      {{ m.custoTotal ? brl(m.custoTotal) : '—' }}
                    </td>
                  }
                  <td>{{ m.registradoPor ?? '—' }}</td>
                  <td class="acao">
                    @if (!m.estorno && atual.pode('manutencao.registrar')) {
                      @if (retornando() === m.id) {
                        <form class="acoes" (ngSubmit)="registrarRetorno(m)">
                          <input
                            cristaPrimeiroCampo
                            type="datetime-local"
                            name="retorno"
                            aria-label="Voltou a operar em"
                            [(ngModel)]="retorno"
                          />
                          <button type="submit" class="pequeno">Salvar</button>
                          <button
                            type="button"
                            class="fantasma pequeno"
                            (click)="retornando.set(null)"
                          >
                            Cancelar
                          </button>
                        </form>
                      } @else {
                        <div class="acoes">
                          @if (m.paradaInicio && !m.retornoOperacao) {
                            <button
                              type="button"
                              class="secundario pequeno"
                              (click)="abrirRetorno(m.id)"
                            >
                              Registrar retorno
                            </button>
                          }
                          <button
                            type="button"
                            class="fantasma pequeno"
                            (click)="estornar(m)"
                          >
                            Estornar
                          </button>
                        </div>
                      }
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
    h1 {
      margin-bottom: var(--espaco-2);
    }
    .ficha {
      display: flex;
      flex-wrap: wrap;
      gap: var(--espaco-3) var(--espaco-6);
      padding: var(--espaco-4) var(--espaco-5);
    }
    .ficha dt {
      font-size: 13px;
      color: var(--texto-suave);
    }
    .ficha dd {
      margin: 0;
      font-weight: 600;
    }
    .servico {
      grid-template-columns: 200px 170px minmax(240px, 1fr);
    }
    .custos {
      grid-template-columns: repeat(2, 220px);
    }
    .acao .acoes {
      justify-content: flex-end;
      flex-wrap: nowrap;
    }
    .acao input {
      min-height: 32px;
      width: auto;
    }
    @media (max-width: 900px) {
      .servico,
      .custos {
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      }
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
  protected readonly iconePreventiva = ICONE_PREVENTIVA;
  protected readonly tiposManutencao = TIPOS_MANUTENCAO;
  protected readonly nomeTipoManutencao = NOME_TIPO_MANUTENCAO;
  protected readonly data = formatarData;
  protected readonly dataHora = formatarDataHora;
  protected readonly num = formatarNumero;
  protected readonly brl = formatarReais;

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
