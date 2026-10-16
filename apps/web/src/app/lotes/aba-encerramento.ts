import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  cargaSchema,
  encerramentoSchema,
  NOME_CATEGORIA,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { formatarData, formatarNumero, hoje } from '../nucleo/formato';
import { LoteAtual } from './lote-atual';
import { Carga } from './tipos';

const reais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});
const NOMES: Partial<Record<string, string>> = {
  ...NOME_CATEGORIA,
  pintos: 'Pintos',
};

const cargaVazia = () => ({
  data: hoje(),
  aves: null as number | null,
  pesoTotalKg: null as number | null,
  precoKg: null as number | null,
  destino: '',
  numeroGta: '',
});

/** UC17: cargas de saída, encerramento do lote e relatório. */
@Component({
  selector: 'crista-aba-encerramento',
  imports: [FormsModule],
  template: `
    @if (erro()) {
      <p class="alerta" role="alert">{{ erro() }}</p>
    }

    @if (lote.lote()?.encerramento; as enc) {
      <section class="cartao">
        <div class="cabecalho-secao">
          <h3>Resultado do encerramento</h3>
          <div class="baixar">
            <button type="button" class="secundario" (click)="baixar('pdf')">
              Baixar PDF
            </button>
            <button type="button" class="secundario" (click)="baixar('xlsx')">
              Baixar XLSX
            </button>
          </div>
        </div>
        <p class="suave">
          Encerrado em {{ data(enc.data) }} por {{ enc.encerradoPor ?? '—' }}.
          Os valores abaixo ficaram congelados nessa data.
        </p>
        @if (enc.parcial) {
          <div class="alerta aviso">
            <strong>Relatório parcial.</strong> O lote foi encerrado com
            pendências:
            <ul>
              @for (p of enc.pendencias; track p) {
                <li>{{ p }}</li>
              }
            </ul>
          </div>
        }
        <div class="duas-colunas">
          <table class="tabela">
            <caption>
              Zootécnico
            </caption>
            <tbody>
              <tr>
                <th scope="row">Aves entregues</th>
                <td>{{ num(enc.resultado.zootecnico.avesEntregues) }}</td>
              </tr>
              <tr>
                <th scope="row">Mortalidade</th>
                <td>{{ pct(enc.resultado.zootecnico.mortalidadePct) }}</td>
              </tr>
              <tr>
                <th scope="row">Viabilidade</th>
                <td>{{ pct(enc.resultado.zootecnico.viabilidadePct) }}</td>
              </tr>
              <tr>
                <th scope="row">Idade de abate</th>
                <td>{{ enc.resultado.zootecnico.idadeAbateDias }} dias</td>
              </tr>
              <tr>
                <th scope="row">Peso entregue</th>
                <td>{{ num(enc.resultado.zootecnico.pesoEntregueKg) }} kg</td>
              </tr>
              <tr>
                <th scope="row">Peso médio final</th>
                <td>
                  {{ num(enc.resultado.zootecnico.pesoMedioFinalKg, 3) }} kg
                </td>
              </tr>
              <tr>
                <th scope="row">Conversão alimentar</th>
                <td>
                  {{ num(enc.resultado.zootecnico.conversaoAlimentar, 3) }}
                </td>
              </tr>
              <tr>
                <th scope="row">IEP</th>
                <td>{{ num(enc.resultado.zootecnico.iep) }}</td>
              </tr>
            </tbody>
          </table>
          @if (fazenda.pode('financeiro.ver')) {
            <table class="tabela">
              <caption>
                Financeiro
              </caption>
              <tbody>
                <tr>
                  <th scope="row">Custo total</th>
                  <td>{{ brl(enc.resultado.financeiro.custoTotal) }}</td>
                </tr>
                <tr>
                  <th scope="row">Custo por ave alojada</th>
                  <td>
                    {{ brl(enc.resultado.financeiro.custoPorAveAlojada) }}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Custo por kg entregue</th>
                  <td>
                    {{ brl(enc.resultado.financeiro.custoPorKgEntregue) }}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Receita das cargas</th>
                  <td>{{ brl(enc.resultado.financeiro.receitaRealizada) }}</td>
                </tr>
                <tr>
                  <th scope="row">Margem</th>
                  <td>{{ brl(enc.resultado.financeiro.margem) }}</td>
                </tr>
                @for (
                  c of enc.resultado.financeiro.porCategoria;
                  track c.categoria
                ) {
                  <tr class="sub">
                    <th scope="row">{{ nomes[c.categoria] ?? c.categoria }}</th>
                    <td>{{ brl(c.valor) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </section>
    } @else if (podeEncerrar()) {
      <form class="cartao formulario" (ngSubmit)="registrarCarga()">
        <h3>Registrar carga de saída</h3>
        @if (lote.lote()?.resumo?.carenciaAte; as ate) {
          <p class="alerta">
            Aves em carência até {{ data(ate) }}: a saída para abate fica
            bloqueada até lá.
          </p>
        }
        <div class="grade-2">
          <label>
            Data de saída
            <input
              type="date"
              name="data"
              [max]="hojeISO"
              [(ngModel)]="carga.data"
            />
            @if (erros()['data']) {
              <span class="erro-campo">{{ erros()['data'] }}</span>
            }
          </label>
          <label>
            Aves na carga
            <input type="number" name="aves" min="1" [(ngModel)]="carga.aves" />
            @if (erros()['aves']) {
              <span class="erro-campo">{{ erros()['aves'] }}</span>
            }
          </label>
          <label>
            Peso total (kg)
            <input
              type="number"
              name="peso"
              min="0"
              step="0.1"
              [(ngModel)]="carga.pesoTotalKg"
            />
            @if (erros()['pesoTotalKg']) {
              <span class="erro-campo">{{ erros()['pesoTotalKg'] }}</span>
            }
          </label>
          <label>
            Preço (R$/kg, opcional)
            <input
              type="number"
              name="preco"
              min="0"
              step="0.01"
              [(ngModel)]="carga.precoKg"
            />
          </label>
          <label>
            Destino (opcional)
            <input
              name="destino"
              placeholder="Ex.: frigorífico"
              [(ngModel)]="carga.destino"
            />
          </label>
          <label>
            GTA (opcional)
            <input name="gta" [(ngModel)]="carga.numeroGta" />
          </label>
        </div>
        <p class="suave">
          Saldo atual: {{ num(lote.lote()?.resumo?.saldoAves) }} aves.
        </p>
        <div>
          <button type="submit" [disabled]="enviando()">Registrar carga</button>
        </div>
      </form>
    }

    <section class="cartao">
      <h3>Cargas de saída</h3>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Aves</th>
              <th>Peso</th>
              <th>Peso médio</th>
              @if (fazenda.pode('financeiro.ver')) {
                <th>Preço</th>
              }
              <th>Destino / GTA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (c of cargas(); track c.id) {
              <tr [class.estornado]="c.estorno">
                <td>{{ data(c.data) }}</td>
                <td>{{ num(c.aves) }}</td>
                <td>{{ num(c.pesoTotalKg) }} kg</td>
                <td>{{ num(c.pesoMedioKg, 3) }} kg</td>
                @if (fazenda.pode('financeiro.ver')) {
                  <td>
                    {{ c.precoKg === null ? '—' : brl(c.precoKg) + '/kg' }}
                  </td>
                }
                <td>
                  {{ c.destino ?? '—'
                  }}{{ c.numeroGta ? ' · ' + c.numeroGta : '' }}
                </td>
                <td>
                  @if (c.estorno) {
                    <span class="etiqueta inativo" [title]="c.estorno.motivo"
                      >Estornada</span
                    >
                  } @else if (podeEncerrar()) {
                    <button
                      type="button"
                      class="secundario"
                      (click)="estornar(c)"
                    >
                      Corrigir
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="suave">Nenhuma carga registrada.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>

    @if (podeEncerrar()) {
      <form class="cartao formulario" (ngSubmit)="encerrar()">
        <h3>Encerrar o lote</h3>
        <p class="suave">
          O encerramento congela o resultado, libera o galpão para um novo lote
          e deixa este lote só para consulta. Não pode ser desfeito.
        </p>
        <label class="data-encerramento">
          Data do encerramento
          <input
            type="date"
            name="dataEncerramento"
            [max]="hojeISO"
            [(ngModel)]="dataEncerramento"
          />
        </label>
        <div>
          <button type="submit" class="perigo" [disabled]="enviando()">
            Encerrar lote
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    .baixar {
      display: flex;
      gap: 0.5rem;
    }
    .duas-colunas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
    }
    caption {
      text-align: left;
      font-weight: 600;
      padding-bottom: 0.25rem;
    }
    tr.sub th {
      font-weight: 400;
      padding-left: 1.25rem;
    }
    .data-encerramento {
      justify-self: start;
    }
    .data-encerramento input {
      width: auto;
    }
    .estornado td:not(:last-child) {
      text-decoration: line-through;
      color: var(--texto-suave);
    }
  `,
})
export class AbaEncerramento implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly fazenda = inject(FazendaAtual);
  protected readonly lote = inject(LoteAtual);

  protected readonly hojeISO = hoje();
  protected readonly nomes = NOMES;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly brl = (v: number | null) =>
    v == null ? '—' : reais.format(v);
  protected readonly pct = (v: number | null) =>
    v == null ? '—' : `${formatarNumero(v, 2)}%`;
  protected readonly podeEncerrar = computed(
    () => this.fazenda.pode('lote.encerrar') && this.lote.emAndamento(),
  );
  protected carga = cargaVazia();
  protected dataEncerramento = hoje();
  protected readonly cargas = signal<Carga[]>([]);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  ngOnInit(): Promise<void> {
    return this.carregar();
  }

  async registrarCarga(): Promise<void> {
    const v = validar(cargaSchema, {
      ...this.carga,
      aves: this.carga.aves ?? 0,
      pesoTotalKg: this.carga.pesoTotalKg ?? 0,
      precoKg: this.carga.precoKg ?? undefined,
    });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;
    this.enviando.set(true);
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.lote.url()}/cargas`, v.dados),
      );
      this.carga = cargaVazia();
      await Promise.all([this.carregar(), this.lote.recarregar()]);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async estornar(c: Carga): Promise<void> {
    this.erro.set('');
    try {
      if (await this.lote.estornar('carga', c.id)) await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  async encerrar(confirmarParcial = false): Promise<void> {
    const v = validar(encerramentoSchema, {
      data: this.dataEncerramento,
      confirmarParcial,
    });
    if (!v.ok) return this.erro.set(Object.values(v.erros)[0]);
    if (
      !confirmarParcial &&
      !confirm('Encerrar o lote? Depois disso ele fica só para consulta.')
    )
      return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.lote.url()}/encerrar`, v.dados),
      );
      await Promise.all([
        this.lote.recarregar(),
        this.fazenda.recarregarGalpoes(),
      ]);
    } catch (e) {
      // Com pendências, a API pede confirmação; o relatório sai como parcial.
      const corpo =
        e instanceof HttpErrorResponse
          ? (e.error as { codigo?: string; message?: string })
          : null;
      if (corpo?.codigo === 'PENDENCIAS') {
        if (
          confirm(
            corpo.message ?? 'O lote tem pendências. Encerrar mesmo assim?',
          )
        )
          return this.encerrar(true);
        return;
      }
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  /** O relatório exige o token de acesso, então é baixado como arquivo pelo navegador. */
  async baixar(formato: 'pdf' | 'xlsx'): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.lote.url()}/relatorio`, {
          params: { formato },
          responseType: 'blob',
        }),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `encerramento-${this.lote.lote()?.codigo ?? 'lote'}.${formato}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  private async carregar(): Promise<void> {
    try {
      this.cargas.set(
        await firstValueFrom(
          this.http.get<Carga[]>(`${this.lote.url()}/cargas`),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
