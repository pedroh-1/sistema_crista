import { HttpClient } from '@angular/common/http';
import {
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  edicaoEquipamentoSchema,
  equipamentoSchema,
  NOME_TIPO_EQUIPAMENTO,
  SituacaoEquipamento,
  TipoEquipamento,
  TIPOS_EQUIPAMENTO,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { ErrosCampo, mensagemErro, validar } from '../nucleo/erros';
import { hoje } from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';
import { Equipamento } from './tipos';

/** UC18: cadastro e edição do equipamento. */
@Component({
  selector: 'crista-form-equipamento',
  imports: [FormsModule, PrimeiroCampo],
  template: `
    <form class="formulario" (ngSubmit)="salvar()">
      @if (erro()) {
        <p class="aviso" role="alert">{{ erro() }}</p>
      }
      <div class="linha-campos">
        <label>
          Nome
          <input
            cristaPrimeiroCampo
            name="nome"
            placeholder="Ex.: Exaustor 3"
            [(ngModel)]="dados.nome"
          />
          @if (erros()['nome']) {
            <span class="erro-campo">{{ erros()['nome'] }}</span>
          }
        </label>
        <label>
          Tipo
          <select name="tipo" [(ngModel)]="dados.tipo">
            @for (t of tipos; track t) {
              <option [value]="t">{{ nomeTipo[t] }}</option>
            }
          </select>
        </label>
        <label>
          Local
          <select name="galpao" [(ngModel)]="dados.galpaoId">
            <option value="">Fazenda inteira (sem galpão)</option>
            @for (g of atual.galpoes(); track g.id) {
              <option [value]="g.id">{{ g.identificacao }}</option>
            }
          </select>
          @if (erros()['galpaoId']) {
            <span class="erro-campo">{{ erros()['galpaoId'] }}</span>
          }
        </label>
      </div>
      <div class="linha-campos">
        <label>
          Preventiva a cada (opcional)
          <span class="campo-unidade">
            <input
              type="number"
              name="periodicidade"
              min="1"
              step="1"
              [(ngModel)]="dados.periodicidadeDias"
            />
            <span>dias</span>
          </span>
          @if (erros()['periodicidadeDias']) {
            <span class="erro-campo">{{ erros()['periodicidadeDias'] }}</span>
          }
        </label>
        <label>
          Data de aquisição (opcional)
          <input
            type="date"
            name="aquisicao"
            [max]="hoje"
            [(ngModel)]="dados.dataAquisicao"
          />
          @if (erros()['dataAquisicao']) {
            <span class="erro-campo">{{ erros()['dataAquisicao'] }}</span>
          }
        </label>
      </div>
      <span class="ajuda"
        >Sem data de aquisição, a primeira preventiva só tem previsão depois de
        registrada uma preventiva.</span
      >
      <label class="caixa">
        <input type="checkbox" name="critico" [(ngModel)]="dados.critico" />
        Equipamento crítico: parada sem retorno abre alerta crítico
      </label>
      @if (equipamento()) {
        <label class="caixa">
          <input
            type="checkbox"
            name="inativo"
            [ngModel]="dados.situacao === 'inativo'"
            (ngModelChange)="dados.situacao = $event ? 'inativo' : 'ativo'"
          />
          Inativo (fora de uso; não recebe manutenção)
        </label>
      }
      <details class="mais">
        <summary>Fabricante, modelo e número de série</summary>
        <div class="linha-campos">
          <label>
            Fabricante (opcional)
            <input name="fabricante" [(ngModel)]="dados.fabricante" />
          </label>
          <label>
            Modelo (opcional)
            <input name="modelo" [(ngModel)]="dados.modelo" />
          </label>
          <label>
            Número de série (opcional)
            <input name="serie" [(ngModel)]="dados.numeroSerie" />
          </label>
        </div>
      </details>
      <div class="acoes">
        <button type="submit" [disabled]="enviando()">
          {{
            enviando()
              ? 'Salvando…'
              : equipamento()
                ? 'Salvar alterações'
                : 'Cadastrar equipamento'
          }}
        </button>
        <button type="button" class="fantasma" (click)="cancelado.emit()">
          Cancelar
        </button>
      </div>
    </form>
  `,
})
export class FormEquipamento implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly atual = inject(FazendaAtual);

  /** Equipamento em edição; sem ele, o formulário cadastra um novo. */
  readonly equipamento = input<Equipamento | null>(null);
  readonly salvo = output<Equipamento>();
  readonly cancelado = output<void>();

  protected readonly hoje = hoje();
  protected readonly tipos = TIPOS_EQUIPAMENTO;
  protected readonly nomeTipo = NOME_TIPO_EQUIPAMENTO;
  protected dados = {
    nome: '',
    tipo: 'ventilacao' as TipoEquipamento,
    galpaoId: '',
    numeroSerie: '',
    fabricante: '',
    modelo: '',
    critico: false,
    periodicidadeDias: null as number | null,
    dataAquisicao: '',
    situacao: 'ativo' as SituacaoEquipamento,
  };
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  ngOnInit(): void {
    const e = this.equipamento();
    if (e) {
      this.dados = {
        nome: e.nome,
        tipo: e.tipo,
        galpaoId: e.galpaoId ?? '',
        numeroSerie: e.numeroSerie ?? '',
        fabricante: e.fabricante ?? '',
        modelo: e.modelo ?? '',
        critico: e.critico,
        periodicidadeDias: e.periodicidadeDias,
        dataAquisicao: e.dataAquisicao ?? '',
        situacao: e.situacao,
      };
    }
  }

  async salvar(): Promise<void> {
    const e = this.equipamento();
    // Campo opcional vazio vai como ausente: na edição, ausente limpa o valor.
    const valor = {
      ...this.dados,
      galpaoId: this.dados.galpaoId || undefined,
      periodicidadeDias: this.dados.periodicidadeDias ?? undefined,
      dataAquisicao: this.dados.dataAquisicao || undefined,
    };
    const v = e
      ? validar(edicaoEquipamentoSchema, valor)
      : validar(equipamentoSchema, valor);
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      const url = `${this.atual.url()}/equipamentos`;
      const salvo = await firstValueFrom(
        e
          ? this.http.put<Equipamento>(`${url}/${e.id}`, v.dados)
          : this.http.post<Equipamento>(url, v.dados),
      );
      this.salvo.emit(salvo);
    } catch (erro) {
      this.erro.set(mensagemErro(erro));
    } finally {
      this.enviando.set(false);
    }
  }
}
