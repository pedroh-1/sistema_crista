import { TestBed } from '@angular/core/testing';
import { Dialogos, DialogosHost } from './dialogos';

describe('Dialogos', () => {
  let dialogos: Dialogos;
  let html: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<DialogosHost>>;

  beforeEach(async () => {
    // O jsdom não implementa showModal/close do <dialog>.
    HTMLDialogElement.prototype.showModal ??= function (
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
    await TestBed.configureTestingModule({
      imports: [DialogosHost],
    }).compileComponents();
    fixture = TestBed.createComponent(DialogosHost);
    dialogos = TestBed.inject(Dialogos);
    html = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const botao = (texto: string) =>
    [...html.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(texto),
    ) as HTMLButtonElement;

  it('confirmação devolve true no botão da ação e false em "Voltar e corrigir"', async () => {
    const sim = dialogos.confirmar({
      titulo: 'Alojar acima da capacidade?',
      mensagem: 'O galpão comporta 18.000 aves.',
      acao: 'Alojar mesmo assim',
    });
    await fixture.whenStable();
    expect(html.querySelector('dialog')?.open).toBe(true);
    expect(html.textContent).toContain('O galpão comporta 18.000 aves.');
    botao('Alojar mesmo assim').click();
    expect(await sim).toBe(true);

    const nao = dialogos.confirmar({
      titulo: 'Encerrar o lote?',
      mensagem: '',
      acao: 'Encerrar lote',
    });
    await fixture.whenStable();
    botao('Voltar e corrigir').click();
    expect(await nao).toBe(false);
    await fixture.whenStable();
    expect(html.querySelector('dialog')?.open).toBe(false);
  });

  it('motivo do estorno exige 3 caracteres e devolve o texto sem espaços', async () => {
    const motivo = dialogos.pedirMotivo(
      'Estornar baixa',
      'Continua no histórico.',
    );
    await fixture.whenStable();
    const campo = html.querySelector('textarea') as HTMLTextAreaElement;

    campo.value = ' ab ';
    campo.dispatchEvent(new Event('input'));
    botao('Estornar').click();
    await fixture.whenStable();
    expect(html.querySelector('.erro-campo')?.textContent).toContain(
      'pelo menos 3',
    );

    campo.value = '  digitei 90 no lugar de 9 ';
    campo.dispatchEvent(new Event('input'));
    botao('Estornar').click();
    expect(await motivo).toBe('digitei 90 no lugar de 9');
  });
});
