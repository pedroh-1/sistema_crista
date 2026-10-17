import { HttpClient } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { baixaSchema, NivelAlerta } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { formatarData, formatarNumero, hoje } from '../nucleo/formato';
import { LoteAtual } from './lote-atual';
import { Baixa } from './tipos';

const vazio = () => ({
  data: hoje(),
  mortes: null as number | null,
  descartes: 0,
  causaProvavel: '',
});

/** UC07: mortalidade e baixa diária. */
@Component({
  selector: 'crista-aba-mortalidade',
  imports: [FormsModule],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (aviso(); as a) {
      <p
        class="aviso"
        [class.sucesso]="a.nivel === 'normal'"
        [class.atencao]="a.nivel === 'atencao'"
        role="status"
      >
        {{ a.texto }}
      </p>
    }
    @if (podeLancar()) {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        <div class="cabecalho-secao">
          <h3>Lançar baixa</h3>
          <span class="suave"
            >Vários lançamentos no mesmo dia são somados.</span
          >
        </div>
        <div class="linha-campos">
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
            Mortes
            <input
              #primeiro
              type="number"
              name="mortes"
              inputmode="numeric"
              min="0"
              [(ngModel)]="dados.mortes"
            />
            @if (erros()['mortes']) {
              <span class="erro-campo">{{ erros()['mortes'] }}</span>
            }
          </label>
          <label>
            Descartes
            <input
              type="number"
              name="descartes"
              inputmode="numeric"
              min="0"
              [(ngModel)]="dados.descartes"
            />
          </label>
          <label class="causa">
            Causa provável (opcional)
            <input name="causa" [(ngModel)]="dados.causaProvavel" />
          </label>
          <button type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Lançando…' : 'Lançar baixa' }}
          </button>
        </div>
      </form>
    }

    <section class="cartao">
      <h3>Lançamentos</h3>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th class="num">Data</th>
              <th class="num">Mortes</th>
              <th class="num">Descartes</th>
              <th>Causa provável</th>
              <th>Lançado por</th>
              <th class="acao"><span class="visivel-leitor">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (b of baixas(); track b.id) {
              <tr [class.estornada]="b.estorno">
                <td class="num riscar">{{ data(b.data) }}</td>
                <td class="num riscar">{{ num(b.mortes) }}</td>
                <td class="num riscar">{{ num(b.descartes) }}</td>
                <td>
                  <span class="riscar">{{ b.causaProvavel ?? '—' }}</span>
                  @if (b.estorno) {
                    <span class="motivo-estorno"
                      >Estornado: {{ b.estorno.motivo }}</span
                    >
                  }
                </td>
                <td>{{ b.registradoPor ?? '—' }}</td>
                <td class="acao">
                  @if (!b.estorno && podeLancar()) {
                    <button
                      type="button"
                      class="fantasma pequeno"
                      (click)="estornar(b)"
                    >
                      Estornar
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="suave">Nenhuma baixa lançada.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .linha-campos {
      grid-template-columns: 160px 120px 120px minmax(160px, 1fr) auto;
    }
    @media (max-width: 640px) {
      .linha-campos {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AbaMortalidade implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fazenda = inject(FazendaAtual);
  protected readonly lote = inject(LoteAtual);

  protected readonly hoje = hoje();
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly podeLancar = computed(
    () =>
      this.fazenda.pode('baixa.registrar') &&
      this.lote.emAndamento() &&
      !!this.lote.lote()?.alojamento,
  );
  private readonly primeiro =
    viewChild<ElementRef<HTMLInputElement>>('primeiro');
  protected dados = vazio();
  protected readonly baixas = signal<Baixa[]>([]);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly aviso = signal<{
    texto: string;
    nivel: NivelAlerta;
  } | null>(null);
  protected readonly enviando = signal(false);

  constructor() {
    // Quem abre a aba quer lançar: o foco já vai para Mortes.
    afterNextRender(() =>
      this.primeiro()?.nativeElement.focus({ preventScroll: true }),
    );
  }

  ngOnInit(): Promise<void> {
    return this.carregar();
  }

  async enviar(): Promise<void> {
    const v = validar(baixaSchema, {
      ...this.dados,
      mortes: this.dados.mortes ?? 0,
    });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    this.aviso.set(null);
    try {
      const r = await firstValueFrom(
        this.http.post<{
          totalDoDia: number;
          mortalidadeDoDia: number;
          nivel: NivelAlerta;
        }>(`${this.lote.url()}/baixas`, v.dados),
      );
      const pct = formatarNumero(r.mortalidadeDoDia, 2);
      const nivel =
        r.nivel === 'critico'
          ? ' Nível crítico: avise o Gestor e o Veterinário.'
          : r.nivel === 'atencao'
            ? ' Nível de atenção.'
            : '';
      this.aviso.set({
        texto: `Baixa lançada. Total do dia ${formatarData(v.dados.data)}: ${r.totalDoDia} aves (${pct}%).${nivel}`,
        nivel: r.nivel,
      });
      // Pronto para o próximo lançamento: limpa e volta o foco ao primeiro campo.
      this.dados = vazio();
      this.primeiro()?.nativeElement.focus();
      await Promise.all([this.carregar(), this.lote.recarregar()]);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async estornar(b: Baixa): Promise<void> {
    this.erro.set('');
    try {
      if (await this.lote.estornar('baixa', b.id)) await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  private async carregar(): Promise<void> {
    try {
      this.baixas.set(
        await firstValueFrom(
          this.http.get<Baixa[]>(`${this.lote.url()}/baixas`),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
