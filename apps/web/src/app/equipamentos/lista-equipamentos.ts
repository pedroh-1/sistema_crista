import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  NOME_SITUACAO_PREVENTIVA,
  NOME_TIPO_EQUIPAMENTO,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { mensagemErro } from '../nucleo/erros';
import { formatarData } from '../nucleo/formato';
import { FormEquipamento } from './form-equipamento';
import {
  CLASSE_PREVENTIVA,
  Equipamento,
  formatarDataHora,
  ICONE_PREVENTIVA,
} from './tipos';

/** UC18: equipamentos da fazenda, com parada e preventiva em destaque. */
@Component({
  selector: 'crista-lista-equipamentos',
  imports: [RouterLink, FormEquipamento],
  template: `
    <header class="cabecalho-secao">
      <h1>Equipamentos</h1>
      @if (atual.pode('equipamento.cadastrar') && !formAberto()) {
        <button type="button" (click)="formAberto.set(true)">
          Cadastrar equipamento
        </button>
      }
    </header>
    @if (erro()) {
      <p class="aviso" role="alert">{{ erro() }}</p>
    }

    @if (formAberto()) {
      <section class="cartao">
        <h3>Cadastrar equipamento</h3>
        <crista-form-equipamento
          (salvo)="aoCadastrar($event)"
          (cancelado)="formAberto.set(false)"
        />
      </section>
    }

    <div class="tabela-moldura">
      <table class="tabela">
        <thead>
          <tr>
            <th>Equipamento</th>
            <th>Tipo</th>
            <th>Local</th>
            <th>Operação</th>
            <th>Preventiva</th>
            <th class="num">Última manutenção</th>
          </tr>
        </thead>
        <tbody>
          @for (e of equipamentos(); track e.id) {
            <tr>
              <td>
                <a [routerLink]="atual.link('equipamentos', e.id)">{{
                  e.nome
                }}</a>
                @if (e.critico) {
                  <span class="suave"> · crítico</span>
                }
              </td>
              <td>{{ nomeTipo[e.tipo] }}</td>
              <td>{{ e.galpao ?? 'Fazenda' }}</td>
              <td>
                @if (e.situacao === 'inativo') {
                  <span class="etiqueta">Inativo</span>
                } @else if (e.paradoDesde) {
                  <span
                    class="etiqueta critico"
                    [title]="'Desde ' + dataHora(e.paradoDesde)"
                    >‼ Parado</span
                  >
                } @else {
                  <span class="etiqueta sucesso">✓ Em operação</span>
                }
              </td>
              <td>
                <span
                  class="etiqueta"
                  [class]="classePreventiva[e.situacaoPreventiva]"
                  >{{ iconePreventiva[e.situacaoPreventiva] }}
                  {{ nomePreventiva[e.situacaoPreventiva] }}</span
                >
                @if (e.proximaPreventiva && e.situacao === 'ativo') {
                  <span class="suave num">
                    {{ data(e.proximaPreventiva) }}</span
                  >
                }
              </td>
              <td class="num">{{ data(e.ultimaManutencao) }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="suave">Nenhum equipamento cadastrado.</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class ListaEquipamentos implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly atual = inject(FazendaAtual);

  protected readonly nomeTipo = NOME_TIPO_EQUIPAMENTO;
  protected readonly nomePreventiva = NOME_SITUACAO_PREVENTIVA;
  protected readonly classePreventiva = CLASSE_PREVENTIVA;
  protected readonly iconePreventiva = ICONE_PREVENTIVA;
  protected readonly data = formatarData;
  protected readonly dataHora = formatarDataHora;
  protected readonly equipamentos = signal<Equipamento[]>([]);
  protected readonly formAberto = signal(false);
  protected readonly erro = signal('');

  async ngOnInit(): Promise<void> {
    try {
      this.equipamentos.set(
        await firstValueFrom(
          this.http.get<Equipamento[]>(`${this.atual.url()}/equipamentos`),
        ),
      );
    } catch (e) {
      this.erro.set(mensagemErro(e));
    }
  }

  aoCadastrar(e: Equipamento): void {
    this.router.navigate(this.atual.link('equipamentos', e.id));
  }
}
