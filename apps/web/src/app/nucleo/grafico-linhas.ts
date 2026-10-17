import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

export interface SerieGrafico {
  id: string;
  nome: string;
  /** Cor da linha (token CSS). Ignorada nas séries de referência. */
  cor: string;
  /** `nota` aparece na dica junto do valor (ex.: nível do alerta). */
  pontos: { x: number; y: number; nota?: string }[];
  /** Curva padrão: linha cinza, sem marcadores, atrás das outras. */
  referencia?: boolean;
}

/** Faixa sombreada atrás das linhas (ex.: ±5% da curva padrão). */
export interface FaixaGrafico {
  nome: string;
  pontos: { x: number; min: number; max: number }[];
}

/** Limite de alerta: linha tracejada em degraus, com ícone e nome na ponta. */
export interface LimiteGrafico {
  id: string;
  nome: string;
  nivel: 'atencao' | 'critico';
  pontos: { x: number; y: number }[];
}

const ICONE_LIMITE = { atencao: '⚠', critico: '‼' } as const;

const MARGEM = { topo: 12, direita: 96, base: 34, esquerda: 56 };
const ALTURA = 280;

/** Até 6 marcas "redondas" num eixo de 0 até o máximo. */
function escalaY(maximo: number): number[] {
  if (maximo <= 0) return [0, 1];
  const bruto = maximo / 5;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo =
    [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ??
    bruto;
  const topo = Math.ceil(maximo / passo) * passo;
  return Array.from(
    { length: Math.round(topo / passo) + 1 },
    (_, i) => i * passo,
  );
}

/**
 * Gráfico de linhas em SVG para séries por idade (UC11, UC15, E5). Um eixo só;
 * legenda com 2+ itens e rótulo na ponta de cada linha; faixa da meta e limites
 * de alerta opcionais; ao passar o mouse, linha vertical e valores daquela idade.
 */
@Component({
  selector: 'crista-grafico-linhas',
  template: `
    @if (itensLegenda() > 1) {
      <ul class="legenda">
        @for (s of legenda(); track s.id) {
          <li>
            <span
              class="chave"
              [class.ref]="s.referencia"
              [style.background]="s.referencia ? null : s.cor"
            ></span>
            {{ s.nome }}
          </li>
        }
        @if (faixaVisivel(); as fx) {
          <li><span class="chave faixa"></span>{{ fx.nome }}</li>
        }
        @for (l of limitesVisiveis(); track l.id) {
          <li>
            <span class="chave limite" [class]="l.nivel"></span>
            {{ icone[l.nivel] }} {{ l.nome }}
          </li>
        }
      </ul>
    }
    <div
      class="area"
      (pointermove)="mover($event)"
      (pointerleave)="foco.set(null)"
    >
      <svg
        [attr.width]="largura()"
        [attr.height]="altura"
        role="img"
        [attr.aria-label]="descricao()"
      >
        @for (t of ticksY(); track t) {
          <line
            class="grade"
            [attr.x1]="margem.esquerda"
            [attr.x2]="largura() - margem.direita"
            [attr.y1]="y(t)"
            [attr.y2]="y(t)"
          />
          <text
            class="eixo"
            [attr.x]="margem.esquerda - 8"
            [attr.y]="y(t)"
            text-anchor="end"
            dominant-baseline="middle"
          >
            {{ formatoY()(t) }}
          </text>
        }
        @for (t of ticksX(); track t) {
          <text
            class="eixo"
            [attr.x]="x(t)"
            [attr.y]="altura - margem.base + 18"
            text-anchor="middle"
          >
            {{ t }}
          </text>
        }
        <text
          class="eixo"
          [attr.x]="largura() - margem.direita"
          [attr.y]="altura - 4"
          text-anchor="end"
        >
          {{ rotuloX() }}
        </text>

        @if (faixaVisivel(); as fx) {
          <path class="faixa" [attr.d]="caminhoFaixa(fx)" />
        }
        @for (l of limitesVisiveis(); track l.id) {
          <path class="limite" [class]="l.nivel" [attr.d]="degraus(l.pontos)" />
          @if (l.pontos.at(-1); as p) {
            <text
              class="rotulo"
              [attr.x]="x(p.x) + 8"
              [attr.y]="y(p.y)"
              dominant-baseline="middle"
            >
              {{ icone[l.nivel] }} {{ l.nome }}
            </text>
          }
        }

        @if (foco(); as f) {
          <line
            class="cruz"
            [attr.x1]="x(f)"
            [attr.x2]="x(f)"
            [attr.y1]="margem.topo"
            [attr.y2]="altura - margem.base"
          />
        }

        @for (s of ordenadas(); track s.id) {
          <path
            class="linha"
            [class.ref]="s.referencia"
            [attr.d]="caminho(s)"
            [attr.stroke]="s.referencia ? null : s.cor"
          />
          @if (!s.referencia) {
            @for (p of s.pontos; track p.x) {
              <circle
                class="marca"
                [attr.cx]="x(p.x)"
                [attr.cy]="y(p.y)"
                r="4"
                [attr.fill]="s.cor"
              />
            }
          }
          @if (rotuloFinal(s); as r) {
            <text
              class="rotulo"
              [attr.x]="r.x"
              [attr.y]="r.y"
              dominant-baseline="middle"
            >
              {{ s.nome }}
            </text>
          }
        }
      </svg>
      @if (dica(); as d) {
        <div
          class="dica"
          [style.left.px]="d.esquerda"
          [style.top.px]="margem.topo"
        >
          <strong>{{ rotuloX() }}: {{ d.x }}</strong>
          @for (v of d.valores; track v.nome) {
            <span
              ><i
                [class.ref]="v.referencia"
                [style.background]="v.referencia ? null : v.cor"
              ></i
              >{{ v.nome }}: {{ v.texto }}</span
            >
          }
          @if (d.faixa; as fx) {
            <span><i class="faixa"></i>{{ fx }}</span>
          }
          @for (l of d.limites; track l.nome) {
            <span><i class="limite" [class]="l.nivel"></i>{{ l.texto }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      --grafico-superficie: var(--superficie);
      --grafico-grade: var(--borda);
      --grafico-referencia: #9a998f;
      --grafico-faixa: rgb(154 153 143 / 0.18);
    }
    .legenda {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem 1rem;
      list-style: none;
      padding: 0;
      margin: 0 0 0.5rem;
      font-size: 0.85rem;
      color: var(--texto-suave);
    }
    .chave {
      display: inline-block;
      width: 14px;
      height: 3px;
      border-radius: 2px;
      vertical-align: middle;
      margin-right: 0.3rem;
    }
    .chave.ref,
    .dica i.ref {
      background: var(--grafico-referencia);
    }
    .chave.faixa,
    .dica i.faixa {
      height: 10px;
      border-radius: 2px;
      background: var(--grafico-faixa);
    }
    .chave.limite {
      height: 0;
      border-top: 2px dashed;
      border-radius: 0;
    }
    .dica i.limite {
      height: 0;
      border-radius: 0;
      border-top: 2px dashed;
    }
    .atencao {
      color: var(--atencao);
      stroke: var(--atencao);
    }
    .critico {
      color: var(--critico);
      stroke: var(--critico);
    }
    .area {
      position: relative;
    }
    .faixa {
      fill: var(--grafico-faixa);
    }
    path.limite {
      fill: none;
      stroke-width: 1.5;
      stroke-dasharray: 6 4;
    }
    svg {
      display: block;
      overflow: visible;
    }
    .grade {
      stroke: var(--grafico-grade);
      stroke-width: 1;
    }
    .cruz {
      stroke: var(--texto-suave);
      stroke-width: 1;
    }
    .eixo {
      font-size: 11px;
      fill: var(--texto-suave);
    }
    .linha {
      fill: none;
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .linha.ref {
      stroke: var(--grafico-referencia);
      stroke-width: 1.5;
    }
    .marca {
      stroke: var(--grafico-superficie);
      stroke-width: 2;
    }
    .rotulo {
      font-size: 12px;
      fill: var(--texto);
    }
    .dica {
      position: absolute;
      pointer-events: none;
      transform: translateX(8px);
      background: var(--superficie);
      border: 1px solid var(--borda);
      border-radius: 6px;
      padding: 0.4rem 0.6rem;
      font-size: 0.8rem;
      display: grid;
      gap: 0.15rem;
      box-shadow: 0 2px 8px rgb(0 0 0 / 0.08);
      white-space: nowrap;
    }
    .dica i {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 0.35rem;
    }
  `,
})
export class GraficoLinhas {
  readonly series = input.required<SerieGrafico[]>();
  readonly rotuloX = input('Idade (dias)');
  readonly formatoY = input<(v: number) => string>((v) => String(v));
  readonly descricao = input('Gráfico de linhas');
  readonly faixa = input<FaixaGrafico | null>(null);
  readonly limites = input<LimiteGrafico[]>([]);

  protected readonly icone = ICONE_LIMITE;

  protected readonly margem = MARGEM;
  protected readonly altura = ALTURA;
  protected readonly largura = signal(640);
  protected readonly foco = signal<number | null>(null);

  private readonly elemento = inject(ElementRef<HTMLElement>);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const observador = new ResizeObserver(([e]) =>
        this.largura.set(Math.max(280, Math.floor(e.contentRect.width))),
      );
      observador.observe(this.elemento.nativeElement);
      destroy.onDestroy(() => observador.disconnect());
    });
  }

  protected readonly legenda = computed(() =>
    this.series().filter((s) => s.pontos.length > 0),
  );
  /** Referência primeiro, para as linhas reais ficarem por cima. */
  protected readonly ordenadas = computed(() =>
    [...this.legenda()].sort(
      (a, b) => Number(!!b.referencia) - Number(!!a.referencia),
    ),
  );
  protected readonly faixaVisivel = computed(() => {
    const f = this.faixa();
    return f && f.pontos.length > 1 ? f : null;
  });
  protected readonly limitesVisiveis = computed(() =>
    this.limites().filter((l) => l.pontos.length > 0),
  );
  protected readonly itensLegenda = computed(
    () =>
      this.legenda().length +
      (this.faixaVisivel() ? 1 : 0) +
      this.limitesVisiveis().length,
  );
  /** Pontos das séries: definem o eixo X e onde a dica encaixa. */
  private readonly todos = computed(() =>
    this.legenda().flatMap((s) => s.pontos),
  );
  private readonly dominioX = computed(() => {
    const xs = this.todos().map((p) => p.x);
    return xs.length ? [Math.min(0, ...xs), Math.max(1, ...xs)] : [0, 1];
  });
  /** O eixo Y cobre também a faixa e os limites, para nada ficar cortado. */
  protected readonly ticksY = computed(() =>
    escalaY(
      Math.max(
        0,
        ...this.todos().map((p) => p.y),
        ...(this.faixaVisivel()?.pontos.map((p) => p.max) ?? []),
        ...this.limitesVisiveis().flatMap((l) => l.pontos.map((p) => p.y)),
      ),
    ),
  );
  protected readonly ticksX = computed(() => {
    const [min, max] = this.dominioX();
    const passo = max - min > 35 ? 14 : 7;
    const ticks = [];
    for (let t = Math.ceil(min / passo) * passo; t <= max; t += passo)
      ticks.push(t);
    return ticks;
  });

  protected x(v: number): number {
    const [min, max] = this.dominioX();
    return (
      MARGEM.esquerda +
      ((v - min) / (max - min || 1)) *
        (this.largura() - MARGEM.esquerda - MARGEM.direita)
    );
  }

  protected y(v: number): number {
    const topo = this.ticksY().at(-1) ?? 1;
    return (
      ALTURA - MARGEM.base - (v / topo) * (ALTURA - MARGEM.topo - MARGEM.base)
    );
  }

  protected caminho(s: SerieGrafico): string {
    return s.pontos
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'}${this.x(p.x).toFixed(1)},${this.y(p.y).toFixed(1)}`,
      )
      .join(' ');
  }

  protected caminhoFaixa(f: FaixaGrafico): string {
    const ida = f.pontos.map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${this.x(p.x).toFixed(1)},${this.y(p.max).toFixed(1)}`,
    );
    const volta = [...f.pontos]
      .reverse()
      .map((p) => `L${this.x(p.x).toFixed(1)},${this.y(p.min).toFixed(1)}`);
    return [...ida, ...volta, 'Z'].join(' ');
  }

  /** Limite muda de uma vez (ex.: fim da primeira semana): degrau, não rampa. */
  protected degraus(pontos: { x: number; y: number }[]): string {
    return pontos
      .map((p, i) =>
        i === 0
          ? `M${this.x(p.x).toFixed(1)},${this.y(p.y).toFixed(1)}`
          : `H${this.x(p.x).toFixed(1)} V${this.y(p.y).toFixed(1)}`,
      )
      .join(' ');
  }

  /** Nome da série na ponta da linha, com 2 a 5 séries. */
  protected rotuloFinal(s: SerieGrafico): { x: number; y: number } | null {
    return this.rotulos().get(s.id) ?? null;
  }

  /**
   * Rótulos na ponta das linhas. Se duas pontas ficam a menos de 14 px, os
   * rótulos se sobrepõem: nesse caso nenhum é desenhado e valem a legenda e a
   * dica (deslocar rótulos os separa das linhas).
   */
  private readonly rotulos = computed(() => {
    const pontas = new Map<string, { x: number; y: number }>();
    // Uma série só já é nomeada pelo título; mais de 5 ficam só na legenda
    if (this.legenda().length < 2 || this.legenda().length > 5) return pontas;
    for (const s of this.legenda()) {
      const ultimo = s.pontos.at(-1);
      if (ultimo)
        pontas.set(s.id, { x: this.x(ultimo.x) + 8, y: this.y(ultimo.y) });
    }
    // Os rótulos dos limites ficam sempre; os das séries saem se encostarem
    const fixos = this.limitesVisiveis().map((l) => {
      const p = l.pontos.at(-1) as { x: number; y: number };
      return { x: this.x(p.x) + 8, y: this.y(p.y) };
    });
    const lista = [...pontas.values()];
    const perto = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.abs(a.x - b.x) < 80 && Math.abs(a.y - b.y) < 14;
    const colidem = lista.some(
      (a, i) =>
        lista.slice(i + 1).some((b) => perto(a, b)) ||
        fixos.some((b) => perto(a, b)),
    );
    return colidem ? new Map<string, { x: number; y: number }>() : pontas;
  });

  protected mover(evento: PointerEvent): void {
    const [min, max] = this.dominioX();
    const caixa = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    const fracao =
      (evento.clientX - caixa.left - MARGEM.esquerda) /
      (this.largura() - MARGEM.esquerda - MARGEM.direita);
    if (fracao < 0 || fracao > 1) return this.foco.set(null);
    // Encaixa na idade com dado mais próxima
    const xs = [...new Set(this.todos().map((p) => p.x))];
    const alvo = min + fracao * (max - min);
    this.foco.set(
      xs.reduce(
        (a, b) => (Math.abs(b - alvo) < Math.abs(a - alvo) ? b : a),
        xs[0],
      ),
    );
  }

  protected readonly dica = computed(() => {
    const f = this.foco();
    if (f === null) return null;
    const valores = this.legenda()
      .map((s) => ({ s, p: s.pontos.find((p) => p.x === f) }))
      .filter((v) => v.p)
      .map(({ s, p }) => ({
        nome: s.nome,
        cor: s.cor,
        referencia: !!s.referencia,
        texto:
          this.formatoY()((p as { y: number }).y) +
          (p?.nota ? ` · ${p.nota}` : ''),
      }));
    const fmt = this.formatoY();
    const naFaixa = this.faixaVisivel()?.pontos.find((p) => p.x === f);
    const faixa = naFaixa
      ? `${this.faixaVisivel()?.nome}: ${fmt(naFaixa.min)} a ${fmt(naFaixa.max)}`
      : null;
    const limites = this.limitesVisiveis().flatMap((l) => {
      const p = l.pontos.find((q) => q.x === f);
      return p
        ? [{ nome: l.nome, nivel: l.nivel, texto: `${l.nome}: ${fmt(p.y)}` }]
        : [];
    });
    const esquerda = Math.min(this.x(f), this.largura() - 200);
    return { x: f, valores, faixa, limites, esquerda };
  });
}
