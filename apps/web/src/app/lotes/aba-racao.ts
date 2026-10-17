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
import { movimentoRacaoSchema } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { formatarData, formatarNumero, hoje } from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
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
  imports: [FormsModule, PrimeiroCampo],
  template: `
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }
    @if (aviso()) {
      <p class="aviso sucesso" role="status">{{ aviso() }}</p>
    }
    @if (podeLancar()) {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        <div class="cabecalho-secao">
          <h3>Registrar ração</h3>
          <span class="suave"
            >Consumo = entregas menos o último estoque restante medido.</span
          >
        </div>
        <div class="linha-campos">
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
            Quantidade
            <span class="campo-unidade">
              <input
                cristaPrimeiroCampo
                type="number"
                name="kg"
                inputmode="decimal"
                min="0"
                step="0.001"
                [(ngModel)]="dados.quantidadeKg"
              />
              <span>kg</span>
            </span>
            @if (erros()['quantidadeKg']) {
              <span class="erro-campo">{{ erros()['quantidadeKg'] }}</span>
            }
          </label>
          @if (dados.tipo === 'entrada' && podeLancarDespesa()) {
            <label>
              Valor da entrega (opcional)
              <span class="campo-unidade prefixo">
                <input
                  type="number"
                  name="valor"
                  inputmode="decimal"
                  min="0"
                  step="0.01"
                  [(ngModel)]="dados.valorTotal"
                />
                <span>R$</span>
              </span>
            </label>
          }
        </div>
        @if (dados.tipo === 'entrada') {
          @if (podeLancarDespesa()) {
            <span class="ajuda"
              >Com valor, a despesa de ração do lote é lançada junto.</span
            >
          }
          <details class="mais">
            <summary>Mais detalhes</summary>
            <div class="linha-campos">
              <label>
                Fornecedor (opcional)
                <input name="fornecedor" [(ngModel)]="dados.fornecedor" />
              </label>
              <label>
                Nota fiscal (opcional)
                <input name="nota" [(ngModel)]="dados.notaFiscal" />
              </label>
            </div>
          </details>
        }
        <div>
          <button type="submit" [disabled]="enviando()">
            {{
              enviando()
                ? 'Registrando…'
                : dados.tipo === 'entrada'
                  ? 'Registrar entrega'
                  : 'Registrar estoque'
            }}
          </button>
        </div>
      </form>
    }

    <section class="cartao">
      <h3>Movimentos de ração</h3>
      <div class="rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th class="num">Data</th>
              <th>Tipo</th>
              <th class="num">Quantidade</th>
              <th>Fornecedor</th>
              <th>Nota fiscal</th>
              <th class="acao"><span class="visivel-leitor">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            @for (m of movimentos(); track m.id) {
              <tr [class.estornada]="m.estorno">
                <td class="num riscar">{{ data(m.data) }}</td>
                <td class="riscar">
                  {{ m.tipo === 'entrada' ? 'Entrega' : 'Estoque restante' }}
                </td>
                <td class="num riscar">{{ num(m.quantidadeKg) }} kg</td>
                <td>
                  <span class="riscar">{{ m.fornecedor ?? '—' }}</span>
                  @if (m.estorno) {
                    <span class="motivo-estorno"
                      >Estornado: {{ m.estorno.motivo }}</span
                    >
                  }
                </td>
                <td class="riscar">{{ m.notaFiscal ?? '—' }}</td>
                <td class="acao">
                  @if (!m.estorno && podeLancar()) {
                    <button
                      type="button"
                      class="fantasma pequeno"
                      (click)="estornar(m)"
                    >
                      Estornar
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
  private readonly primeiro = viewChild(PrimeiroCampo);
  protected dados = vazio();
  protected readonly movimentos = signal<MovimentoRacao[]>([]);
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly aviso = signal('');
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
    this.aviso.set('');
    try {
      await firstValueFrom(this.http.post(`${this.lote.url()}/racao`, v.dados));
      this.aviso.set(
        v.dados.tipo === 'entrada'
          ? `Entrega de ${formatarNumero(v.dados.quantidadeKg)} kg registrada.`
          : `Estoque de ${formatarNumero(v.dados.quantidadeKg)} kg registrado.`,
      );
      // Pronto para o próximo lançamento, do mesmo tipo.
      this.dados = { ...vazio(), tipo: this.dados.tipo };
      this.primeiro()?.focar();
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
