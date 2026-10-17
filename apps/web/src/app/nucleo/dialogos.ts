import {
  afterRenderEffect,
  Component,
  ElementRef,
  inject,
  Injectable,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

interface Confirmacao {
  tipo: 'confirmar';
  titulo: string;
  mensagem: string;
  /** Texto do botão que confirma, com verbo ("Alojar mesmo assim"). */
  acao: string;
  /** Ação que não se desfaz por edição (revogar, excluir): botão vermelho. */
  perigo?: boolean;
}

interface PedidoTexto {
  tipo: 'texto';
  titulo: string;
  mensagem?: string;
  rotulo: string;
  acao: string;
  valor?: string;
  minimo?: number;
  maximo?: number;
  perigo?: boolean;
  /** Campo de várias linhas (motivo) ou de uma linha (nome). */
  linhas?: boolean;
}

type Pedido = (Confirmacao | PedidoTexto) & {
  responder: (resposta: string | null) => void;
};

/**
 * Diálogos da aplicação (Design System, componente Dialogo): confirmação de regra branda
 * (409 com `codigo`), motivo do estorno e nomes curtos. Substitui `confirm()` e `prompt()`.
 * Um diálogo por vez; o componente `crista-dialogos` fica no `App`.
 */
@Injectable({ providedIn: 'root' })
export class Dialogos {
  readonly atual = signal<Pedido | null>(null);

  confirmar(opcoes: Omit<Confirmacao, 'tipo'>): Promise<boolean> {
    return this.abrir({ tipo: 'confirmar', ...opcoes }).then((r) => r !== null);
  }

  pedirTexto(opcoes: Omit<PedidoTexto, 'tipo'>): Promise<string | null> {
    return this.abrir({ tipo: 'texto', ...opcoes });
  }

  /** Motivo do estorno: obrigatório, de 3 a 500 caracteres (`estornoSchema`). */
  pedirMotivo(titulo: string, mensagem: string): Promise<string | null> {
    return this.pedirTexto({
      titulo,
      mensagem,
      rotulo: 'Motivo',
      acao: 'Estornar',
      minimo: 3,
      maximo: 500,
      perigo: true,
      linhas: true,
    });
  }

  private abrir(pedido: Confirmacao | PedidoTexto): Promise<string | null> {
    this.atual()?.responder(null);
    return new Promise((resolve) =>
      this.atual.set({
        ...pedido,
        responder: (resposta) => {
          this.atual.set(null);
          resolve(resposta);
        },
      }),
    );
  }
}

@Component({
  selector: 'crista-dialogos',
  imports: [FormsModule],
  template: `
    <dialog
      #janela
      class="dialogo"
      aria-labelledby="dialogo-titulo"
      (cancel)="$event.preventDefault(); responder(null)"
    >
      @if (dialogos.atual(); as p) {
        <form class="formulario" (ngSubmit)="confirmar(p)">
          <h2 id="dialogo-titulo">{{ p.titulo }}</h2>
          @if (p.mensagem) {
            <p class="mensagem">{{ p.mensagem }}</p>
          }
          @if (p.tipo === 'texto') {
            <div class="campo">
              <label for="dialogo-texto">{{ p.rotulo }}</label>
              @if (p.linhas) {
                <textarea
                  id="dialogo-texto"
                  name="texto"
                  autofocus
                  [maxlength]="p.maximo ?? null"
                  [(ngModel)]="texto"
                ></textarea>
              } @else {
                <input
                  id="dialogo-texto"
                  name="texto"
                  autofocus
                  [maxlength]="p.maximo ?? null"
                  [(ngModel)]="texto"
                />
              }
              @if (erro()) {
                <span class="erro-campo">{{ erro() }}</span>
              }
            </div>
          }
          <div class="acoes">
            <button type="button" class="fantasma" (click)="responder(null)">
              {{ p.tipo === 'confirmar' ? 'Voltar e corrigir' : 'Cancelar' }}
            </button>
            <button
              type="submit"
              [class.perigo]="p.perigo"
              [class.cheio]="p.perigo"
              [attr.autofocus]="p.tipo === 'confirmar' ? '' : null"
            >
              {{ p.acao }}
            </button>
          </div>
        </form>
      }
    </dialog>
  `,
  styles: `
    .dialogo {
      width: min(480px, calc(100% - 32px));
      border: 0;
      border-radius: var(--raio-lg);
      box-shadow: var(--sombra-dialogo);
      padding: var(--espaco-5);
      color: var(--texto);
      background: var(--superficie);
    }
    .dialogo::backdrop {
      background: rgba(24, 36, 27, 0.4);
    }
    h2 {
      margin: 0;
      font-family: var(--font-texto);
      font-size: 16px;
      line-height: 24px;
    }
    .mensagem {
      margin: 0;
      color: var(--texto-suave);
      font-size: 14px;
      line-height: 20px;
    }
    .acoes {
      justify-content: flex-end;
      margin-top: var(--espaco-2);
    }
  `,
})
export class DialogosHost {
  protected readonly dialogos = inject(Dialogos);
  private readonly janela =
    viewChild.required<ElementRef<HTMLDialogElement>>('janela');

  protected readonly texto = signal('');
  protected readonly erro = signal('');

  constructor() {
    afterRenderEffect(() => {
      const pedido = this.dialogos.atual();
      const janela = this.janela().nativeElement;
      if (pedido && !janela.open) {
        this.texto.set(pedido.tipo === 'texto' ? (pedido.valor ?? '') : '');
        this.erro.set('');
        janela.showModal();
      } else if (!pedido && janela.open) {
        janela.close();
      }
    });
  }

  protected confirmar(pedido: Pedido): void {
    if (pedido.tipo === 'confirmar') return pedido.responder('');
    const texto = this.texto().trim();
    const minimo = pedido.minimo ?? 1;
    if (texto.length < minimo) {
      this.erro.set(
        minimo > 1
          ? `Escreva pelo menos ${minimo} caracteres.`
          : 'Preencha este campo.',
      );
      return;
    }
    pedido.responder(texto);
  }

  protected responder(resposta: string | null): void {
    this.dialogos.atual()?.responder(resposta);
  }
}
