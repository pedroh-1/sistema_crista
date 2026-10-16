import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { alojamentoSchema } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import {
  confirmouAposAviso,
  ErrosCampo,
  mensagemErro,
  validar,
} from '../nucleo/erros';
import { formatarNumero } from '../nucleo/formato';
import { LoteAtual } from './lote-atual';

/** UC06: registro do recebimento das aves. */
@Component({
  selector: 'crista-form-alojamento',
  imports: [FormsModule],
  template: `
    @if (podeRegistrar()) {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        <h3>Registrar alojamento</h3>
        <p class="suave">
          Previsto: {{ num(atual.lote()?.quantidadePrevista) }} aves. Os
          lançamentos do lote começam depois deste registro.
        </p>
        @if (erro()) {
          <p class="alerta" role="alert">{{ erro() }}</p>
        }
        <div class="grade-2">
          <label>
            Data de chegada
            <input type="date" name="data" [(ngModel)]="dados.data" />
            @if (erros()['data']) {
              <span class="erro-campo">{{ erros()['data'] }}</span>
            }
          </label>
          <label>
            Aves recebidas
            <input
              type="number"
              name="recebidas"
              min="1"
              [(ngModel)]="dados.avesRecebidas"
            />
            @if (erros()['avesRecebidas']) {
              <span class="erro-campo">{{ erros()['avesRecebidas'] }}</span>
            }
          </label>
          <label>
            Mortas no transporte
            <input
              type="number"
              name="mortas"
              min="0"
              [(ngModel)]="dados.mortasTransporte"
            />
            @if (erros()['mortasTransporte']) {
              <span class="erro-campo">{{ erros()['mortasTransporte'] }}</span>
            }
          </label>
        </div>
        @if (divergente()) {
          <label>
            Justificativa da diferença em relação ao previsto
            <input
              name="justificativa"
              [(ngModel)]="dados.justificativaDivergencia"
            />
            @if (erros()['justificativaDivergencia']) {
              <span class="erro-campo">{{
                erros()['justificativaDivergencia']
              }}</span>
            }
          </label>
        }
        <div>
          <button type="submit" [disabled]="enviando()">
            Registrar alojamento
          </button>
        </div>
      </form>
    } @else {
      <p class="cartao suave">O alojamento ainda não foi registrado.</p>
    }
  `,
})
export class FormAlojamento {
  private readonly http = inject(HttpClient);
  protected readonly atual = inject(LoteAtual);
  private readonly fazenda = inject(FazendaAtual);

  protected readonly num = formatarNumero;
  protected readonly podeRegistrar = computed(() =>
    this.fazenda.pode('alojamento.registrar'),
  );
  protected dados = {
    data: this.atual.lote()?.dataAlojamento ?? '',
    avesRecebidas: this.atual.lote()?.quantidadePrevista ?? null,
    mortasTransporte: 0,
    justificativaDivergencia: '',
  };
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  protected divergente(): boolean {
    return (
      this.dados.avesRecebidas !== null &&
      this.dados.avesRecebidas !== this.atual.lote()?.quantidadePrevista
    );
  }

  async enviar(confirmarDensidade = false): Promise<void> {
    const v = validar(alojamentoSchema, { ...this.dados, confirmarDensidade });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      await firstValueFrom(
        this.http.post(`${this.atual.url()}/alojamento`, v.dados),
      );
      await this.atual.recarregar();
    } catch (e) {
      if (confirmouAposAviso(e)) return this.enviar(true);
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
