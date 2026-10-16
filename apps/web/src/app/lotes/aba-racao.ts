import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { movimentoRacaoSchema } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { formatarData, formatarNumero, hoje } from '../nucleo/formato';
import { LoteAtual } from './lote-atual';
import { MovimentoRacao } from './tipos';

const vazio = () => ({
  data: hoje(),
  tipo: 'entrada' as MovimentoRacao['tipo'],
  quantidadeKg: null as number | null,
  fornecedor: '',
  notaFiscal: '',
  valorTotal: null as number | null,
});

/** Entradas de ração e estoque restante: base da conversão alimentar (inconsistência #9). */
@Component({
  selector: 'crista-aba-racao',
  imports: [FormsModule],
  template: `
    @if (erro()) {
      <p class="alerta" role="alert">{{ erro() }}</p>
    }
    @if (podeLancar()) {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        <h3>Registrar ração</h3>
        <p class="suave">
          Lance cada entrega de ração. Quando medir o que sobrou no silo, lance
          o estoque restante: o consumo é a soma das entregas menos o último
          estoque informado.
        </p>
        <div class="grade-2">
          <label>
            Tipo
            <select name="tipo" [(ngModel)]="dados.tipo">
              <option value="entrada">Entrega de ração</option>
              <option value="estoque_restante">Estoque restante no silo</option>
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
          <label>
            Quantidade (kg)
            <input
              type="number"
              name="kg"
              min="0"
              step="0.001"
              [(ngModel)]="dados.quantidadeKg"
            />
            @if (erros()['quantidadeKg']) {
              <span class="erro-campo">{{ erros()['quantidadeKg'] }}</span>
            }
          </label>
          @if (dados.tipo === 'entrada') {
            <label>
              Fornecedor (opcional)
              <input name="fornecedor" [(ngModel)]="dados.fornecedor" />
            </label>
            <label>
              Nota fiscal (opcional)
              <input name="nota" [(ngModel)]="dados.notaFiscal" />
            </label>
            @if (podeLancarDespesa()) {
              <label>
                Valor da entrega (R$, opcional)
                <input
                  type="number"
                  name="valor"
                  min="0"
                  step="0.01"
                  [(ngModel)]="dados.valorTotal"
                />
                <span class="suave"
                  >Com valor, a despesa de ração do lote é lançada junto.</span
                >
              </label>
            }
          }
        </div>
        <div>
          <button type="submit" [disabled]="enviando()">Registrar</button>
        </div>
      </form>
    }

    <section class="cartao">
      <h3>Movimentos de ração</h3>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Quantidade</th>
              <th>Fornecedor</th>
              <th>Nota</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (m of movimentos(); track m.id) {
              <tr [class.estornado]="m.estorno">
                <td>{{ data(m.data) }}</td>
                <td>
                  {{ m.tipo === 'entrada' ? 'Entrega' : 'Estoque restante' }}
                </td>
                <td>{{ num(m.quantidadeKg) }} kg</td>
                <td>{{ m.fornecedor ?? '—' }}</td>
                <td>{{ m.notaFiscal ?? '—' }}</td>
                <td>
                  @if (m.estorno) {
                    <span class="etiqueta inativo" [title]="m.estorno.motivo"
                      >Estornado</span
                    >
                  } @else if (podeLancar()) {
                    <button
                      type="button"
                      class="secundario"
                      (click)="estornar(m)"
                    >
                      Corrigir
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="suave">Nenhum movimento de ração.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: `
    .estornado td:not(:last-child) {
      text-decoration: line-through;
      color: var(--texto-suave);
    }
  `,
})
export class AbaRacao implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fazenda = inject(FazendaAtual);
  protected readonly lote = inject(LoteAtual);

  protected readonly hoje = hoje();
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly podeLancar = computed(
    () => this.fazenda.pode('racao.registrar') && this.lote.emAndamento(),
  );
  protected readonly podeLancarDespesa = computed(() =>
    this.fazenda.pode('despesa.registrar'),
  );
  protected dados = vazio();
  protected readonly movimentos = signal<MovimentoRacao[]>([]);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  ngOnInit(): Promise<void> {
    return this.carregar();
  }

  async enviar(): Promise<void> {
    const v = validar(movimentoRacaoSchema, {
      ...this.dados,
      quantidadeKg: this.dados.quantidadeKg ?? -1,
      valorTotal:
        this.dados.tipo === 'entrada' && this.dados.valorTotal
          ? this.dados.valorTotal
          : undefined,
    });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      await firstValueFrom(this.http.post(`${this.lote.url()}/racao`, v.dados));
      this.dados = vazio();
      await Promise.all([this.carregar(), this.lote.recarregar()]);
    } catch (e) {
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async estornar(m: MovimentoRacao): Promise<void> {
    this.erro.set('');
    try {
      if (await this.lote.estornar('racao', m.id)) await this.carregar();
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  private async carregar(): Promise<void> {
    try {
      this.movimentos.set(
        await firstValueFrom(
          this.http.get<MovimentoRacao[]>(`${this.lote.url()}/racao`),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }
}
