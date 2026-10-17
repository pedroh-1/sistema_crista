import { HttpClient } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { pesagemSchema } from '@crista/domain';
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
  formatarIndicador,
  formatarNumero,
  hoje,
} from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { LoteAtual } from './lote-atual';
import { PesagemLinha } from './tipos';

const vazio = () => ({
  data: hoje(),
  modo: 'individual' as 'individual' | 'total',
  pesosTexto: '',
  avesPesadas: null as number | null,
  pesoTotalKg: null as number | null,
  pontoColeta: '',
});

/** Lê "1020 980; 1.100" como [1020, 980, 1100] (gramas). */
function lerPesos(texto: string): number[] {
  return texto
    .split(/[\s;,]+/)
    .map((p) => p.replace(/\./g, ''))
    .filter(Boolean)
    .map(Number);
}

/** UC10: pesagem amostral. */
@Component({
  selector: 'crista-aba-pesagens',
  imports: [FormsModule, PrimeiroCampo],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (aviso()) {
      <p
        class="aviso"
        [class.sucesso]="!avisoRuim()"
        [class.atencao]="avisoRuim()"
        role="status"
      >
        {{ aviso() }}
      </p>
    }
    @if (podeLancar()) {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        <h3>Registrar pesagem</h3>
        <div class="linha-campos topo">
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
          <label>
            Como informar
            <select name="modo" [(ngModel)]="dados.modo">
              <option value="individual">
                Peso de cada ave (calcula uniformidade)
              </option>
              <option value="total">Total de aves e peso total</option>
            </select>
          </label>
        </div>
        @if (dados.modo === 'individual') {
          <label>
            Pesos individuais
            <textarea
              cristaPrimeiroCampo
              name="pesos"
              inputmode="decimal"
              rows="3"
              [(ngModel)]="dados.pesosTexto"
              (keydown.control.enter)="enviar()"
              placeholder="1020, 980, 1100, 1045 …"
            ></textarea>
            <span class="ajuda"
              >Em gramas, separados por espaço, vírgula ou linha.
              <kbd>Ctrl</kbd> + <kbd>Enter</kbd> registra.
              @if (contagem()) {
                <strong>{{ contagem() }}</strong>
              }
            </span>
          </label>
        } @else {
          <div class="linha-campos topo">
            <label>
              Aves pesadas
              <input
                cristaPrimeiroCampo
                type="number"
                name="aves"
                inputmode="numeric"
                min="1"
                [(ngModel)]="dados.avesPesadas"
              />
            </label>
            <label>
              Peso total
              <span class="campo-unidade">
                <input
                  type="number"
                  name="total"
                  inputmode="decimal"
                  min="0"
                  step="0.001"
                  [(ngModel)]="dados.pesoTotalKg"
                />
                <span>kg</span>
              </span>
            </label>
          </div>
        }
        @if (erros()['pesosIndividuaisG']) {
          <span class="erro-campo">{{ erros()['pesosIndividuaisG'] }}</span>
        }
        <details class="mais">
          <summary>Mais detalhes</summary>
          <label class="ponto">
            Ponto de coleta (opcional)
            <input
              name="ponto"
              placeholder="Ex.: meio do galpão"
              [(ngModel)]="dados.pontoColeta"
            />
          </label>
        </details>
        <div>
          <button type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Registrando…' : 'Registrar pesagem' }}
          </button>
        </div>
      </form>
    }

    <section class="cartao">
      <h3>Pesagens</h3>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th class="num">Data</th>
              <th class="num">Idade</th>
              <th class="num">Aves pesadas</th>
              <th class="num">Peso médio</th>
              <th class="num">Uniformidade</th>
              <th>Ponto de coleta</th>
              <th class="acao"><span class="visivel-leitor">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (p of pesagens(); track p.id) {
              <tr [class.estornada]="p.estorno">
                <td class="num riscar">{{ data(p.data) }}</td>
                <td class="num riscar">{{ p.idadeDias }} d</td>
                <td class="num riscar">{{ num(p.avesPesadas) }}</td>
                <td class="num riscar">{{ num(p.pesoMedioG) }} g</td>
                <td
                  class="num riscar"
                  [title]="
                    p.uniformidade.disponivel ? '' : p.uniformidade.motivo
                  "
                >
                  {{ ind(p.uniformidade, 1, ' %') }}
                </td>
                <td>
                  <span class="riscar">{{ p.pontoColeta ?? '—' }}</span>
                  @if (p.estorno) {
                    <span class="motivo-estorno"
                      >Estornada: {{ p.estorno.motivo }}</span
                    >
                  }
                </td>
                <td class="acao">
                  @if (!p.estorno && podeLancar()) {
                    <button
                      type="button"
                      class="fantasma pequeno"
                      (click)="estornar(p)"
                    >
                      Estornar
                    </button>
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
    </section>
  `,
  styles: `
    .topo {
      grid-template-columns: 180px minmax(220px, 360px);
      justify-content: start;
    }
    .ponto {
      max-width: 360px;
    }
    kbd {
      font: inherit;
      font-weight: 600;
    }
    @media (max-width: 640px) {
      .topo {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AbaPesagens implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(Dialogos);
  private readonly fazenda = inject(FazendaAtual);
  protected readonly lote = inject(LoteAtual);

  protected readonly hoje = hoje();
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly ind = formatarIndicador;
  protected readonly podeLancar = computed(
    () => this.fazenda.pode('pesagem.registrar') && this.lote.emAndamento(),
  );
  private readonly primeiro = viewChild(PrimeiroCampo);
  protected dados = vazio();
  protected readonly pesagens = signal<PesagemLinha[]>([]);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
  protected readonly avisoRuim = signal(false);
  protected readonly enviando = signal(false);

  ngOnInit(): Promise<void> {
    return this.carregar();
  }

  protected contagem(): string {
    const n = lerPesos(this.dados.pesosTexto).length;
    return n === 0 ? '' : `${n} ${n === 1 ? 'ave' : 'aves'}`;
  }

  async enviar(confirmarRevisao = false): Promise<void> {
    const individual = this.dados.modo === 'individual';
    const v = validar(pesagemSchema, {
      data: this.dados.data,
      pontoColeta: this.dados.pontoColeta,
      pesosIndividuaisG: individual
        ? lerPesos(this.dados.pesosTexto)
        : undefined,
      avesPesadas: individual
        ? undefined
        : (this.dados.avesPesadas ?? undefined),
      pesoTotalG:
        individual || this.dados.pesoTotalKg == null
          ? undefined
          : this.dados.pesoTotalKg * 1000,
      confirmarRevisao,
    });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    this.aviso.set('');
    try {
      const r = await firstValueFrom(
        this.http.post<{
          pesoMedioG: number;
          amostraMinima: number | null;
          baixaRepresentatividade: boolean;
        }>(`${this.lote.url()}/pesagens`, v.dados),
      );
      const representatividade = r.baixaRepresentatividade
        ? ` Atenção: amostra abaixo do mínimo recomendado (${r.amostraMinima} aves).`
        : '';
      this.avisoRuim.set(r.baixaRepresentatividade);
      this.aviso.set(
        `Pesagem registrada: peso médio de ${formatarNumero(r.pesoMedioG)} g.${representatividade}`,
      );
      // Pronto para a próxima pesagem, no mesmo modo de informar.
      this.dados = { ...vazio(), modo: this.dados.modo };
      this.primeiro()?.focar();
      await Promise.all([this.carregar(), this.lote.recarregar()]);
    } catch (e) {
      if (await confirmouAposAviso(e, this.dialogos)) return this.enviar(true);
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async estornar(p: PesagemLinha): Promise<void> {
    this.erro.set('');
    try {
      if (await this.lote.estornar('pesagem', p.id)) await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  private async carregar(): Promise<void> {
    try {
      this.pesagens.set(
        await firstValueFrom(
          this.http.get<PesagemLinha[]>(`${this.lote.url()}/pesagens`),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
