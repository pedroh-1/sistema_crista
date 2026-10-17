import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  cargaSchema,
  encerramentoSchema,
  NOME_CATEGORIA,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Dialogos } from '../nucleo/dialogos';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import {
  confirmouAposAviso,
  ErrosCampo,
  mensagemErro,
  validar,
} from '../nucleo/erros';
import {
  formatarData,
  formatarNumero,
  formatarReais,
  hoje,
} from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { LoteAtual } from './lote-atual';
import { Carga } from './tipos';

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
  imports: [FormsModule, PrimeiroCampo],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }

    @if (lote.lote()?.encerramento; as enc) {
      <section class="cartao">
        <div class="cabecalho-secao">
          <div>
            <h3>Resultado do encerramento</h3>
            <span class="suave"
              >Encerrado em {{ data(enc.data) }} por
              {{ enc.encerradoPor ?? '—' }}. Os valores ficaram congelados nessa
              data.</span
            >
          </div>
          <div class="acoes">
            <button
              type="button"
              class="secundario pequeno"
              (click)="baixar('pdf')"
            >
              Baixar PDF
            </button>
            <button
              type="button"
              class="secundario pequeno"
              (click)="baixar('xlsx')"
            >
              Baixar planilha
            </button>
          </div>
        </div>
        @if (enc.parcial) {
          <div class="aviso info">
            <span
              ><strong>ℹ Relatório parcial.</strong> O lote foi encerrado com
              pendências:
              <ul>
                @for (p of enc.pendencias; track p) {
                  <li>{{ p }}</li>
                }
              </ul>
            </span>
          </div>
        }
        <div class="duas-colunas">
          <dl class="resultado">
            <dt class="grupo">Zootécnico</dt>
            <dd></dd>
            <dt>Aves entregues</dt>
            <dd>{{ num(enc.resultado.zootecnico.avesEntregues) }}</dd>
            <dt>Mortalidade</dt>
            <dd>{{ pct(enc.resultado.zootecnico.mortalidadePct) }}</dd>
            <dt>Viabilidade</dt>
            <dd>{{ pct(enc.resultado.zootecnico.viabilidadePct) }}</dd>
            <dt>Idade de abate</dt>
            <dd>{{ enc.resultado.zootecnico.idadeAbateDias }} dias</dd>
            <dt>Peso entregue</dt>
            <dd>{{ num(enc.resultado.zootecnico.pesoEntregueKg) }} kg</dd>
            <dt>Peso médio final</dt>
            <dd>{{ num(enc.resultado.zootecnico.pesoMedioFinalKg, 3) }} kg</dd>
            <dt>Conversão alimentar</dt>
            <dd>{{ num(enc.resultado.zootecnico.conversaoAlimentar, 3) }}</dd>
            <dt>IEP</dt>
            <dd>{{ num(enc.resultado.zootecnico.iep) }}</dd>
          </dl>
          @if (fazenda.pode('financeiro.ver')) {
            <dl class="resultado">
              <dt class="grupo">Financeiro</dt>
              <dd></dd>
              <dt>Custo total</dt>
              <dd>{{ brl(enc.resultado.financeiro.custoTotal) }}</dd>
              <dt>Custo por ave alojada</dt>
              <dd>{{ brl(enc.resultado.financeiro.custoPorAveAlojada) }}</dd>
              <dt>Custo por kg entregue</dt>
              <dd>{{ brl(enc.resultado.financeiro.custoPorKgEntregue) }}</dd>
              <dt>Receita das cargas</dt>
              <dd>{{ brl(enc.resultado.financeiro.receitaRealizada) }}</dd>
              <dt>Margem</dt>
              <dd [class.negativa]="enc.resultado.financeiro.margem < 0">
                {{ brl(enc.resultado.financeiro.margem) }}
              </dd>
              @for (
                c of enc.resultado.financeiro.porCategoria;
                track c.categoria
              ) {
                <dt class="sub">{{ nomes[c.categoria] ?? c.categoria }}</dt>
                <dd class="sub">{{ brl(c.valor) }}</dd>
              }
            </dl>
          }
        </div>
      </section>
    } @else if (podeEncerrar()) {
      @if (lote.lote()?.resumo?.carenciaAte; as ate) {
        <p class="aviso atencao">
          ⚠ Aves em carência até {{ data(ate) }}: a saída para abate fica
          bloqueada até lá.
        </p>
      }
      <form class="cartao formulario" (ngSubmit)="registrarCarga()">
        <div class="cabecalho-secao">
          <h3>Registrar carga de saída</h3>
          <span class="suave num"
            >Saldo atual: {{ num(lote.lote()?.resumo?.saldoAves) }} aves</span
          >
        </div>
        <div class="linha-campos">
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
            <input
              cristaPrimeiroCampo
              type="number"
              name="aves"
              min="1"
              [(ngModel)]="carga.aves"
            />
            @if (erros()['aves']) {
              <span class="erro-campo">{{ erros()['aves'] }}</span>
            }
          </label>
          <label>
            Peso total
            <span class="campo-unidade">
              <input
                type="number"
                name="peso"
                min="0"
                step="0.1"
                [(ngModel)]="carga.pesoTotalKg"
              />
              <span>kg</span>
            </span>
            @if (erros()['pesoTotalKg']) {
              <span class="erro-campo">{{ erros()['pesoTotalKg'] }}</span>
            }
          </label>
          @if (fazenda.pode('financeiro.ver')) {
            <label>
              Preço por kg (opcional)
              <span class="campo-unidade prefixo">
                <input
                  type="number"
                  name="preco"
                  min="0"
                  step="0.01"
                  [(ngModel)]="carga.precoKg"
                />
                <span>R$</span>
              </span>
            </label>
          }
        </div>
        <div class="linha-campos">
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
        <div>
          <button type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Registrando…' : 'Registrar carga' }}
          </button>
        </div>
      </form>
    }

    <section class="cartao">
      <h3>Cargas de saída</h3>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th class="num">Data</th>
              <th class="num">Aves</th>
              <th class="num">Peso</th>
              <th class="num">Peso médio</th>
              @if (fazenda.pode('financeiro.ver')) {
                <th class="num">Preço</th>
              }
              <th>Destino / GTA</th>
              <th class="acao"><span class="visivel-leitor">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (c of cargas(); track c.id) {
              <tr [class.estornada]="c.estorno">
                <td class="num riscar">{{ data(c.data) }}</td>
                <td class="num riscar">{{ num(c.aves) }}</td>
                <td class="num riscar">{{ num(c.pesoTotalKg) }} kg</td>
                <td class="num riscar">{{ num(c.pesoMedioKg, 3) }} kg</td>
                @if (fazenda.pode('financeiro.ver')) {
                  <td class="num riscar">
                    {{ c.precoKg === null ? '—' : brl(c.precoKg) + '/kg' }}
                  </td>
                }
                <td>
                  <span class="riscar"
                    >{{ c.destino ?? '—'
                    }}{{ c.numeroGta ? ' · GTA ' + c.numeroGta : '' }}</span
                  >
                  @if (c.estorno) {
                    <span class="motivo-estorno"
                      >Estornada: {{ c.estorno.motivo }}</span
                    >
                  }
                </td>
                <td class="acao">
                  @if (!c.estorno && podeEncerrar()) {
                    <button
                      type="button"
                      class="fantasma pequeno"
                      (click)="estornar(c)"
                    >
                      Estornar
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
      <form class="cartao formulario encerrar" (ngSubmit)="encerrar()">
        <h3>Encerrar o lote</h3>
        <p class="suave">
          O encerramento congela o resultado, libera o galpão para um novo lote
          e deixa este lote só para consulta. Não pode ser desfeito. Com
          pendências, o relatório sai como parcial.
        </p>
        <div class="acoes linha-encerrar">
          <label>
            Data do encerramento
            <input
              type="date"
              name="dataEncerramento"
              [max]="hojeISO"
              [(ngModel)]="dataEncerramento"
            />
          </label>
          <button type="submit" class="perigo" [disabled]="enviando()">
            Encerrar lote
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    .duas-colunas {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--espaco-4) var(--espaco-6);
    }
    .resultado {
      display: grid;
      grid-template-columns: 1fr auto;
      margin: 0;
    }
    .resultado dt,
    .resultado dd {
      padding: var(--espaco-2) 0;
      border-bottom: 1px solid var(--borda);
    }
    .resultado dt {
      color: var(--texto-suave);
    }
    .resultado dd {
      margin: 0;
      text-align: right;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .resultado .grupo {
      color: var(--texto);
      font-weight: 600;
    }
    .resultado .sub {
      font-size: 13px;
      font-weight: 400;
    }
    .resultado dt.sub {
      padding-left: var(--espaco-4);
    }
    .negativa {
      color: var(--critico);
    }
    .aviso ul {
      margin: var(--espaco-1) 0 0;
      padding-left: var(--espaco-5);
    }
    .linha-encerrar {
      align-items: end;
    }
    .linha-encerrar input {
      width: auto;
    }
  `,
})
export class AbaEncerramento implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(Dialogos);
  protected readonly fazenda = inject(FazendaAtual);
  protected readonly lote = inject(LoteAtual);

  protected readonly hojeISO = hoje();
  protected readonly nomes = NOMES;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly brl = formatarReais;
  protected readonly pct = (v: number | null) =>
    v == null ? '—' : `${formatarNumero(v, 2)} %`;
  protected readonly podeEncerrar = computed(
    () => this.fazenda.pode('lote.encerrar') && this.lote.emAndamento(),
  );
  private readonly primeiro = viewChild(PrimeiroCampo);
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
      this.primeiro()?.focar();
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
      !(await this.dialogos.confirmar({
        titulo: 'Encerrar o lote?',
        mensagem: 'Depois disso ele fica só para consulta.',
        acao: 'Encerrar lote',
      }))
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
        if (await confirmouAposAviso(e, this.dialogos))
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
