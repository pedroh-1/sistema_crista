import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  NOME_TIPO_OCORRENCIA,
  NOME_VIA,
  ocorrenciaSchema,
  TIPOS_OCORRENCIA,
  VIAS,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { formatarData, hoje } from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { LoteAtual } from './lote-atual';
import { Ocorrencia } from './tipos';

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

const vazio = () => ({
  data: hoje(),
  tipo: 'inspecao' as Ocorrencia['tipo'],
  descricao: '',
  produto: '',
  dose: '',
  via: '' as string,
  loteProduto: '',
  carenciaDias: null as number | null,
});

/** UC08 (registrar ocorrência) e UC09 (histórico sanitário). */
@Component({
  selector: 'crista-aba-sanidade',
  imports: [FormsModule, PrimeiroCampo],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (aviso()) {
      <p class="aviso sucesso" role="status">{{ aviso() }}</p>
    }
    @if (emCarencia().length > 0) {
      <div class="aviso atencao">
        <span
          ><strong>⚠ Produtos em carência:</strong>
          @for (c of emCarencia(); track c.idOcorrencia; let ultimo = $last) {
            {{ c.produto }} até {{ data(c.dataFimCarencia)
            }}{{ ultimo ? '.' : ';' }}
          }
        </span>
      </div>
    }
    @if (podeLancar()) {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        <h3>Registrar ocorrência sanitária</h3>
        <div class="linha-campos">
          <label>
            Tipo
            <select name="tipo" [(ngModel)]="dados.tipo">
              @for (t of tipos; track t) {
                <option [value]="t">{{ nomeTipo[t] }}</option>
              }
            </select>
          </label>
          <label>
            Data
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
          <label class="descricao">
            Descrição
            <input
              cristaPrimeiroCampo
              name="descricao"
              [(ngModel)]="dados.descricao"
            />
            @if (erros()['descricao']) {
              <span class="erro-campo">{{ erros()['descricao'] }}</span>
            }
          </label>
        </div>
        @if (comProduto()) {
          <div class="linha-campos">
            <label>
              Produto
              <input name="produto" [(ngModel)]="dados.produto" />
              @if (erros()['produto']) {
                <span class="erro-campo">{{ erros()['produto'] }}</span>
              }
            </label>
            <label>
              Dose
              <input
                name="dose"
                placeholder="Ex.: 10 mg/kg"
                [(ngModel)]="dados.dose"
              />
              @if (erros()['dose']) {
                <span class="erro-campo">{{ erros()['dose'] }}</span>
              }
            </label>
            <label>
              Via
              <select name="via" [(ngModel)]="dados.via">
                <option value="">Escolha…</option>
                @for (v of vias; track v) {
                  <option [value]="v">{{ nomeVia[v] }}</option>
                }
              </select>
              @if (erros()['via']) {
                <span class="erro-campo">{{ erros()['via'] }}</span>
              }
            </label>
            <label>
              Lote do produto
              <input name="loteProduto" [(ngModel)]="dados.loteProduto" />
              @if (erros()['loteProduto']) {
                <span class="erro-campo">{{ erros()['loteProduto'] }}</span>
              }
            </label>
            <label>
              Carência
              <span class="campo-unidade">
                <input
                  type="number"
                  name="carencia"
                  min="0"
                  [(ngModel)]="dados.carenciaDias"
                />
                <span>dias</span>
              </span>
              @if (erros()['carenciaDias']) {
                <span class="erro-campo">{{ erros()['carenciaDias'] }}</span>
              }
            </label>
          </div>
        }
        <details class="mais">
          <summary>Anexar foto ou laudo</summary>
          <label class="anexo">
            Arquivo (JPG, PNG ou PDF, até 10 MB)
            <input
              #campoArquivo
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              (change)="escolherArquivo($event)"
            />
          </label>
        </details>
        <div>
          <button type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Registrando…' : 'Registrar ocorrência' }}
          </button>
        </div>
      </form>
    }

    <section class="cartao">
      <div class="cabecalho-secao">
        <h3>Histórico sanitário</h3>
        <div class="acoes">
          <select
            class="filtro"
            [(ngModel)]="filtroTipo"
            (ngModelChange)="carregar()"
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos os tipos</option>
            @for (t of tipos; track t) {
              <option [value]="t">{{ nomeTipo[t] }}</option>
            }
          </select>
          <label class="caixa">
            <input
              type="checkbox"
              [(ngModel)]="filtroCarencia"
              (ngModelChange)="carregar()"
            />
            Só carência vigente
          </label>
        </div>
      </div>
      <div class="lista">
        @for (o of ocorrencias(); track o.id) {
          <article class="ocorrencia" [class.estornada]="o.estorno">
            <div class="linha">
              <strong class="riscar"
                ><span class="num">{{ data(o.data) }}</span> ·
                {{ nomeTipo[o.tipo] }}</strong
              >
              @if (o.estorno) {
                <span class="etiqueta">Estornada</span>
              } @else if (o.carenciaVigente) {
                <span class="etiqueta atencao"
                  >⚠ Carência até {{ data(o.dataFimCarencia) }}</span
                >
              }
              @if (podeLancar() && !o.estorno) {
                <button
                  type="button"
                  class="fantasma pequeno estornar"
                  (click)="estornar(o)"
                >
                  Estornar
                </button>
              }
            </div>
            <p class="riscar">{{ o.descricao }}</p>
            @if (o.produto) {
              <p class="suave riscar">
                {{ o.produto }} · {{ o.dose }} ·
                {{ nomeVia[$any(o.via)] ?? o.via }} · lote {{ o.loteProduto }} ·
                carência de {{ o.carenciaDias }} dias
              </p>
            }
            <p class="suave">
              Veterinário: {{ o.veterinario ?? '—' }}
              @for (a of o.anexos; track a.id) {
                ·
                <a
                  href=""
                  (click)="$event.preventDefault(); abrirAnexo(a.id)"
                  >{{ a.nome }}</a
                >
              }
            </p>
            @if (o.estorno) {
              <p class="motivo">Estornada: {{ o.estorno.motivo }}</p>
            }
          </article>
        } @empty {
          <p class="suave">Nenhuma ocorrência registrada.</p>
        }
      </div>
    </section>
  `,
  styles: `
    .descricao {
      grid-column: span 2;
    }
    .anexo {
      max-width: 420px;
    }
    .filtro {
      width: auto;
    }
    .lista {
      margin: 0 calc(-1 * var(--espaco-5)) calc(-1 * var(--espaco-5));
      border-top: 1px solid var(--borda);
    }
    .lista > .suave {
      margin: 0;
      padding: var(--espaco-4) var(--espaco-5);
    }
    .ocorrencia {
      display: grid;
      gap: var(--espaco-1);
      padding: var(--espaco-4) var(--espaco-5);
      border-bottom: 1px solid var(--borda);
    }
    .ocorrencia:last-child {
      border-bottom: 0;
    }
    .ocorrencia p {
      margin: 0;
    }
    .linha {
      display: flex;
      align-items: center;
      gap: var(--espaco-3);
    }
    .estornar {
      margin-left: auto;
    }
    .estornada {
      color: var(--texto-suave);
    }
    .estornada .riscar {
      text-decoration: line-through;
    }
    .motivo {
      font-size: 12px;
      color: var(--critico);
    }
    @media (max-width: 640px) {
      .descricao {
        grid-column: auto;
      }
      .lista {
        margin: 0 calc(-1 * var(--espaco-4)) calc(-1 * var(--espaco-4));
      }
    }
  `,
})
export class AbaSanidade implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fazenda = inject(FazendaAtual);
  protected readonly lote = inject(LoteAtual);

  protected readonly hoje = hoje();
  protected readonly data = formatarData;
  protected readonly tipos = TIPOS_OCORRENCIA;
  protected readonly nomeTipo = NOME_TIPO_OCORRENCIA;
  protected readonly vias = VIAS;
  protected readonly nomeVia: Partial<Record<string, string>> = NOME_VIA;
  protected readonly podeLancar = computed(
    () => this.fazenda.pode('sanidade.registrar') && this.lote.emAndamento(),
  );
  private readonly primeiro = viewChild(PrimeiroCampo);
  private readonly campoArquivo =
    viewChild<ElementRef<HTMLInputElement>>('campoArquivo');
  protected dados = vazio();
  protected filtroTipo = '';
  protected filtroCarencia = false;
  private arquivo: File | null = null;
  protected readonly ocorrencias = signal<Ocorrencia[]>([]);
  protected readonly emCarencia = signal<
    { produto: string; dataFimCarencia: string; idOcorrencia: string }[]
  >([]);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly enviando = signal(false);

  ngOnInit(): Promise<void> {
    return this.carregar();
  }

  protected comProduto(): boolean {
    return this.dados.tipo === 'vacinacao' || this.dados.tipo === 'medicacao';
  }

  protected escolherArquivo(evento: Event): void {
    this.arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
  }

  async enviar(): Promise<void> {
    const comProduto = this.comProduto();
    const v = validar(ocorrenciaSchema, {
      data: this.dados.data,
      tipo: this.dados.tipo,
      descricao: this.dados.descricao,
      ...(comProduto && {
        produto: this.dados.produto,
        dose: this.dados.dose,
        via: this.dados.via || undefined,
        loteProduto: this.dados.loteProduto,
        carenciaDias: this.dados.carenciaDias ?? undefined,
      }),
    });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;
    if (this.arquivo && this.arquivo.size > TAMANHO_MAXIMO) {
      this.erro.set('O anexo pode ter no máximo 10 MB');
      return;
    }

    this.enviando.set(true);
    this.erro.set('');
    this.aviso.set('');
    try {
      const criada = await firstValueFrom(
        this.http.post<{ id: string }>(
          `${this.lote.url()}/ocorrencias`,
          v.dados,
        ),
      );
      if (this.arquivo) {
        const corpo = new FormData();
        corpo.append('entidade', 'ocorrencia');
        corpo.append('idEntidade', criada.id);
        corpo.append('arquivo', this.arquivo);
        try {
          await firstValueFrom(
            this.http.post(`${this.fazenda.url()}/anexos`, corpo),
          );
        } catch (e) {
          this.erro.set(
            `Ocorrência registrada, mas o anexo falhou: ${mensagemErro(e)}`,
          );
        }
      }
      if (!this.erro())
        this.aviso.set(`${NOME_TIPO_OCORRENCIA[v.dados.tipo]} registrada.`);
      // Pronto para o próximo registro: limpa também o arquivo escolhido.
      this.dados = vazio();
      this.arquivo = null;
      const campoArquivo = this.campoArquivo()?.nativeElement;
      if (campoArquivo) campoArquivo.value = '';
      this.primeiro()?.focar();
      await Promise.all([this.carregar(), this.lote.recarregar()]);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  /** O anexo exige o token de acesso, então é baixado e aberto numa nova aba. */
  async abrirAnexo(id: string): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.fazenda.url()}/anexos/${id}`, {
          responseType: 'blob',
        }),
      );
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  async estornar(o: Ocorrencia): Promise<void> {
    this.erro.set('');
    try {
      if (await this.lote.estornar('ocorrencia', o.id)) await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  async carregar(): Promise<void> {
    let params = new HttpParams();
    if (this.filtroTipo) params = params.set('tipo', this.filtroTipo);
    if (this.filtroCarencia) params = params.set('carenciaVigente', 'true');
    try {
      const r = await firstValueFrom(
        this.http.get<{
          ocorrencias: Ocorrencia[];
          emCarencia: {
            produto: string;
            dataFimCarencia: string;
            idOcorrencia: string;
          }[];
        }>(`${this.lote.url()}/ocorrencias`, { params }),
      );
      this.ocorrencias.set(r.ocorrencias);
      this.emCarencia.set(r.emCarencia);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
