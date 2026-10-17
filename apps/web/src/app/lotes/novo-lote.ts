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
import { Dialogos } from '../nucleo/dialogos';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import {
  confirmouAposAviso,
  ErrosCampo,
  mensagemErro,
  validar,
} from '../nucleo/erros';
import { formatarNumero, hoje } from '../nucleo/formato';
import { PrimeiroCampo } from '../nucleo/primeiro-campo';

@Component({
  selector: 'crista-novo-lote',
  imports: [FormsModule, RouterLink, PrimeiroCampo],
  template: `
    <nav class="trilha" aria-label="Caminho">
      <a [routerLink]="atual.link('lotes')">Lotes</a>
      <span aria-hidden="true">/</span><span>Cadastrar lote</span>
    </nav>
    <h1>Cadastrar lote</h1>
    @if (disponiveis().length === 0) {
      <p class="aviso atencao">
        ⚠ Nenhum galpão disponível. Cadastre um galpão ou encerre o lote em
        andamento.
      </p>
    } @else {
      <form class="cartao formulario" (ngSubmit)="enviar()">
        @if (erro()) {
          <p class="aviso" role="alert">{{ erro() }}</p>
        }
        <div class="linha-campos">
          <label>
            Código do lote
            <input
              cristaPrimeiroCampo
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
                  {{ g.identificacao }} (até {{ num(g.capacidadeAves) }} aves)
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
        </div>
        <div class="linha-campos">
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
            Quantidade prevista
            <span class="campo-unidade">
              <input
                type="number"
                name="quantidade"
                min="1"
                [(ngModel)]="dados.quantidadePrevista"
              />
              <span>aves</span>
            </span>
            @if (erros()['quantidadePrevista']) {
              <span class="erro-campo">{{
                erros()['quantidadePrevista']
              }}</span>
            }
          </label>
          <label>
            Idade dos pintos no alojamento
            <span class="campo-unidade">
              <input
                type="number"
                name="idade"
                min="0"
                [(ngModel)]="dados.idadeInicialDias"
              />
              <span>dias</span>
            </span>
          </label>
        </div>
        <details class="mais">
          <summary>Origem, peso e custo do pinto</summary>
          <div class="linha-campos">
            <label>
              Origem / incubatório (opcional)
              <input name="origem" [(ngModel)]="dados.origem" />
            </label>
            <label>
              Peso médio do pinto (opcional)
              <span class="campo-unidade">
                <input
                  type="number"
                  name="pesoPinto"
                  min="0"
                  step="0.1"
                  [(ngModel)]="dados.pesoPintoG"
                />
                <span>g</span>
              </span>
            </label>
            <label>
              Custo por pinto (opcional)
              <span class="campo-unidade prefixo">
                <input
                  type="number"
                  name="custo"
                  min="0"
                  step="0.01"
                  [(ngModel)]="dados.custoPinto"
                />
                <span>R$</span>
              </span>
            </label>
          </div>
          <span class="ajuda"
            >Sem o custo do pinto, ele fica fora do custo total do lote.</span
          >
        </details>
        <div>
          <button type="submit" [disabled]="enviando()">
            {{ enviando() ? 'Cadastrando…' : 'Cadastrar lote' }}
          </button>
        </div>
      </form>
    }
  `,
})
export class NovoLote {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(Dialogos);
  private readonly router = inject(Router);
  protected readonly atual = inject(FazendaAtual);
  protected readonly num = formatarNumero;

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
      if (await confirmouAposAviso(e, this.dialogos)) return this.enviar(true);
      this.erro.set(mensagemErro(e));
    } finally {
      this.enviando.set(false);
    }
  }
}
