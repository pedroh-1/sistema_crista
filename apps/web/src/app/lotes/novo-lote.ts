import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  LINHAGENS,
  loteSchema,
  NOME_LINHAGEM,
  NOME_SEXAGEM,
  SEXAGENS,
} from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import {
  confirmouAposAviso,
  ErrosCampo,
  mensagemErro,
  validar,
} from '../nucleo/erros';
import { hoje } from '../nucleo/formato';

@Component({
  selector: 'crista-novo-lote',
  imports: [FormsModule, RouterLink],
  template: `
    <p><a [routerLink]="atual.link('lotes')">← Lotes</a></p>
    <h2>Cadastrar lote</h2>
    @if (disponiveis().length === 0) {
      <div class="cartao">
        <p>
          Nenhum galpão disponível. Cadastre um galpão ou encerre o lote em
          andamento.
        </p>
      </div>
    } @else {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        @if (erro()) {
          <p class="alerta" role="alert">{{ erro() }}</p>
        }
        <div class="grade-2">
          <label>
            Código do lote
            <input
              name="codigo"
              placeholder="Ex.: 2026-07"
              [(ngModel)]="dados.codigo"
            />
            @if (erros()['codigo']) {
              <span class="erro-campo">{{ erros()['codigo'] }}</span>
            }
          </label>
          <label>
            Galpão
            <select name="galpao" [(ngModel)]="dados.galpaoId">
              <option value="">Escolha…</option>
              @for (g of disponiveis(); track g.id) {
                <option [value]="g.id">
                  {{ g.identificacao }} (até {{ g.capacidadeAves }} aves)
                </option>
              }
            </select>
            @if (erros()['galpaoId']) {
              <span class="erro-campo">{{ erros()['galpaoId'] }}</span>
            }
          </label>
          <label>
            Linhagem
            <select name="linhagem" [(ngModel)]="dados.linhagem">
              @for (l of linhagens; track l) {
                <option [value]="l">{{ nomeLinhagem[l] }}</option>
              }
            </select>
          </label>
          <label>
            Sexagem
            <select name="sexagem" [(ngModel)]="dados.sexagem">
              @for (s of sexagens; track s) {
                <option [value]="s">{{ nomeSexagem[s] }}</option>
              }
            </select>
          </label>
          <label>
            Data de alojamento
            <input
              type="date"
              name="data"
              [max]="hoje"
              [(ngModel)]="dados.dataAlojamento"
            />
            @if (erros()['dataAlojamento']) {
              <span class="erro-campo">{{ erros()['dataAlojamento'] }}</span>
            }
          </label>
          <label>
            Quantidade prevista (aves)
            <input
              type="number"
              name="quantidade"
              min="1"
              [(ngModel)]="dados.quantidadePrevista"
            />
            @if (erros()['quantidadePrevista']) {
              <span class="erro-campo">{{
                erros()['quantidadePrevista']
              }}</span>
            }
          </label>
          <label>
            Origem / incubatório (opcional)
            <input name="origem" [(ngModel)]="dados.origem" />
          </label>
          <label>
            Idade dos pintos no alojamento (dias)
            <input
              type="number"
              name="idade"
              min="0"
              [(ngModel)]="dados.idadeInicialDias"
            />
          </label>
          <label>
            Peso médio do pinto (g, opcional)
            <input
              type="number"
              name="pesoPinto"
              min="0"
              step="0.1"
              [(ngModel)]="dados.pesoPintoG"
            />
          </label>
          <label>
            Custo por pinto (R$, opcional)
            <input
              type="number"
              name="custo"
              min="0"
              step="0.01"
              [(ngModel)]="dados.custoPinto"
            />
          </label>
        </div>
        <button type="submit" [disabled]="enviando()">Cadastrar lote</button>
      </form>
    }
  `,
})
export class NovoLote {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly atual = inject(FazendaAtual);

  protected readonly hoje = hoje();
  protected readonly linhagens = LINHAGENS;
  protected readonly sexagens = SEXAGENS;
  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly nomeSexagem = NOME_SEXAGEM;
  protected readonly disponiveis = computed(() =>
    this.atual.galpoes().filter((g) => g.situacao === 'disponivel'),
  );
  protected dados = {
    codigo: '',
    galpaoId: '',
    linhagem: 'cobb500',
    sexagem: 'misto',
    origem: '',
    dataAlojamento: hoje(),
    idadeInicialDias: 0,
    pesoPintoG: null as number | null,
    custoPinto: null as number | null,
    quantidadePrevista: null as number | null,
  };
  protected readonly erros = signal<ErrosCampo>({});
  protected readonly erro = signal('');
  protected readonly enviando = signal(false);

  async enviar(confirmarDensidade = false): Promise<void> {
    const v = validar(loteSchema, {
      ...this.dados,
      pesoPintoG: this.dados.pesoPintoG ?? undefined,
      custoPinto: this.dados.custoPinto ?? undefined,
      confirmarDensidade,
    });
    this.erros.set(v.ok ? {} : v.erros);
    if (!v.ok) return;

    this.enviando.set(true);
    this.erro.set('');
    try {
      const lote = await firstValueFrom(
        this.http.post<{ id: string }>(`${this.atual.url()}/lotes`, v.dados),
      );
      await this.atual.recarregarGalpoes();
      await this.router.navigate(this.atual.link('lotes', lote.id));
    } catch (e) {
      if (confirmouAposAviso(e)) return this.enviar(true);
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
