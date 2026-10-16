import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
  imports: [FormsModule],
  template: `
    @if (erro()) {
      <p class="alerta" role="alert">{{ erro() }}</p>
    }
    @if (podeLancar()) {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        <h3>Registrar ocorrência sanitária</h3>
        <div class="grade-2">
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
        </div>
        <label>
          Descrição
          <input name="descricao" [(ngModel)]="dados.descricao" />
          @if (erros()['descricao']) {
            <span class="erro-campo">{{ erros()['descricao'] }}</span>
          }
        </label>
        @if (comProduto()) {
          <div class="grade-2">
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
              Carência (dias)
              <input
                type="number"
                name="carencia"
                min="0"
                [(ngModel)]="dados.carenciaDias"
              />
              @if (erros()['carenciaDias']) {
                <span class="erro-campo">{{ erros()['carenciaDias'] }}</span>
              }
            </label>
          </div>
        }
        <label>
          Anexo (opcional: foto ou laudo em JPG, PNG ou PDF, até 10 MB)
          <input
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            (change)="escolherArquivo($event)"
          />
        </label>
        <div>
          <button type="submit" [disabled]="enviando()">Registrar</button>
        </div>
      </form>
    }

    @if (emCarencia().length > 0) {
      <section class="cartao">
        <h3>Produtos em carência</h3>
        <ul>
          @for (c of emCarencia(); track c.idOcorrencia) {
            <li>{{ c.produto }}: até {{ data(c.dataFimCarencia) }}</li>
          }
        </ul>
      </section>
    }

    <section class="cartao">
      <div class="cabecalho-secao">
        <h3>Histórico sanitário</h3>
        <div class="filtros">
          <select
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
      @for (o of ocorrencias(); track o.id) {
        <article class="ocorrencia" [class.estornado]="o.estorno">
          <div class="cabecalho-secao">
            <strong>{{ data(o.data) }} · {{ nomeTipo[o.tipo] }}</strong>
            @if (o.estorno) {
              <span class="etiqueta inativo" [title]="o.estorno.motivo"
                >Estornada</span
              >
            } @else if (o.carenciaVigente) {
              <span class="etiqueta pendente"
                >Carência até {{ data(o.dataFimCarencia) }}</span
              >
            }
          </div>
          <p>{{ o.descricao }}</p>
          @if (o.produto) {
            <p class="suave">
              {{ o.produto }} · {{ o.dose }} ·
              {{ nomeVia[$any(o.via)] ?? o.via }} · lote {{ o.loteProduto }} ·
              carência de {{ o.carenciaDias }} dias
            </p>
          }
          <p class="suave">
            Veterinário: {{ o.veterinario ?? '—' }}
            @for (a of o.anexos; track a.id) {
              ·
              <a href="" (click)="$event.preventDefault(); abrirAnexo(a.id)">{{
                a.nome
              }}</a>
            }
          </p>
          @if (podeLancar() && !o.estorno) {
            <button type="button" class="secundario" (click)="estornar(o)">
              Corrigir
            </button>
          }
        </article>
      } @empty {
        <p class="suave">Nenhuma ocorrência registrada.</p>
      }
    </section>
  `,
  styles: `
    .filtros {
      display: flex;
      gap: 1rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .filtros select {
      width: auto;
    }
    .ocorrencia {
      border-bottom: 1px solid var(--borda);
      padding: 0.75rem 0;
    }
    .ocorrencia p {
      margin: 0.25rem 0;
    }
    .estornado > p {
      text-decoration: line-through;
      color: var(--texto-suave);
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
      this.dados = vazio();
      this.arquivo = null;
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
