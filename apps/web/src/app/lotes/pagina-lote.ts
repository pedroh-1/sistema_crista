import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Indicador, NOME_LINHAGEM, NOME_SEXAGEM } from '@crista/domain';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { mensagemErro } from '../nucleo/erros';
import {
  formatarData,
  formatarIndicador,
  formatarNumero,
} from '../nucleo/formato';
import { NOME_SITUACAO_META } from './aba-curva';
import { FormAlojamento } from './form-alojamento';
import { LoteAtual } from './lote-atual';

@Component({
  selector: 'crista-pagina-lote',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, FormAlojamento],
  providers: [LoteAtual],
  template: `
    <p><a [routerLink]="fazenda.link('lotes')">← Lotes</a></p>
    @if (erro()) {
      <p class="alerta" role="alert">{{ erro() }}</p>
    }
    @if (atual.lote(); as lote) {
      <div class="cabecalho-secao">
        <div>
          <h2>Lote {{ lote.codigo }}</h2>
          <span class="suave">
            {{ lote.galpao.identificacao }} · {{ nomeLinhagem[lote.linhagem] }}
            {{ nomeSexagem[lote.sexagem] }} · alojado em
            {{ data(lote.dataAlojamento) }}
          </span>
        </div>
        @if (!atual.emAndamento()) {
          <span class="etiqueta inativo"
            >{{ lote.situacao === 'cancelado' ? 'Cancelado' : 'Encerrado' }}: só
            consulta</span
          >
        }
      </div>

      @if (lote.resumo.carenciaAte) {
        <p class="alerta">
          Aves em período de carência até {{ data(lote.resumo.carenciaAte) }}:
          não podem ser abatidas antes disso.
        </p>
      }
      @if (
        lote.resumo.mortalidadeHoje.nivel === 'critico' ||
        lote.resumo.mortalidadeHoje.nivel === 'atencao'
      ) {
        <p class="alerta">
          Mortalidade de hoje em
          {{ ind(lote.resumo.mortalidadeHoje.percentual, 2, '%') }} ({{
            lote.resumo.mortalidadeHoje.nivel === 'critico'
              ? 'nível crítico'
              : 'nível de atenção'
          }}).
        </p>
      }

      @if (lote.alojamento) {
        <div class="indicadores">
          <div class="indicador">
            <span class="rotulo">Idade</span
            ><strong>{{ lote.resumo.idadeDias }} dias</strong>
          </div>
          <div class="indicador">
            <span class="rotulo">Saldo de aves</span
            ><strong>{{ num(lote.resumo.saldoAves) }}</strong>
          </div>
          <div class="indicador" [title]="motivo(lote.meta.desvioCurva)">
            <span class="rotulo">Peso × curva</span>
            <strong>{{ ind(lote.meta.desvioCurva, 1, '%') }}</strong>
            @if (lote.meta.situacao) {
              <span class="situacao-meta" [class]="lote.meta.situacao">{{
                nomeSituacao[lote.meta.situacao]
              }}</span>
            }
          </div>
          @for (c of cartoes; track c.rotulo) {
            <div class="indicador" [title]="motivo(lote.resumo[c.chave])">
              <span class="rotulo">{{ c.rotulo }}</span>
              <strong>{{
                ind(lote.resumo[c.chave], c.casas, c.unidade)
              }}</strong>
            </div>
          }
        </div>
        <p class="suave">
          Alojamento: {{ num(lote.alojamento.avesRecebidas) }} aves recebidas,
          {{ num(lote.alojamento.mortasTransporte) }} mortas no transporte, em
          {{ data(lote.alojamento.data) }}.
          @if (lote.resumo.ultimaPesagem) {
            Peso da pesagem de {{ data(lote.resumo.ultimaPesagem) }}.
          }
          Passe o mouse sobre um "—" para ver o que falta.
        </p>
      } @else if (atual.emAndamento()) {
        <crista-form-alojamento />
      }

      <nav class="abas">
        <a routerLink="mortalidade" routerLinkActive="ativa">Mortalidade</a>
        <a routerLink="pesagens" routerLinkActive="ativa">Pesagens</a>
        <a routerLink="sanidade" routerLinkActive="ativa">Sanidade</a>
        <a routerLink="racao" routerLinkActive="ativa">Ração</a>
        <a routerLink="curva" routerLinkActive="ativa">Curva de peso</a>
        @if (fazenda.pode('financeiro.ver')) {
          <a routerLink="custos" routerLinkActive="ativa">Custos</a>
        }
      </nav>
      <router-outlet />
    }
  `,
  styles: `
    .indicadores {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 0.6rem;
      margin-bottom: 0.75rem;
    }
    .indicador {
      background: var(--superficie);
      border: 1px solid var(--borda);
      border-radius: var(--raio);
      padding: 0.6rem 0.75rem;
      display: grid;
    }
    .indicador strong {
      font-size: 1.15rem;
    }
    .rotulo {
      font-size: 0.8rem;
      color: var(--texto-suave);
    }
    .abas {
      display: flex;
      gap: 0.25rem;
      border-bottom: 1px solid var(--borda);
      margin: 1rem 0;
      overflow-x: auto;
    }
    .abas a {
      padding: 0.5rem 0.9rem;
      text-decoration: none;
      color: var(--texto-suave);
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      white-space: nowrap;
    }
    .abas a.ativa {
      color: var(--primaria);
      border-bottom-color: var(--primaria);
      font-weight: 600;
    }
  `,
})
export class PaginaLote {
  protected readonly atual = inject(LoteAtual);
  protected readonly fazenda = inject(FazendaAtual);
  protected readonly nomeLinhagem = NOME_LINHAGEM;
  protected readonly nomeSexagem = NOME_SEXAGEM;
  protected readonly nomeSituacao = NOME_SITUACAO_META;
  protected readonly data = formatarData;
  protected readonly num = formatarNumero;
  protected readonly ind = formatarIndicador;
  protected readonly erro = signal('');

  protected readonly cartoes = [
    { rotulo: 'Mortalidade', chave: 'mortalidade', casas: 2, unidade: '%' },
    { rotulo: 'Viabilidade', chave: 'viabilidade', casas: 2, unidade: '%' },
    { rotulo: 'Peso médio', chave: 'pesoMedioG', casas: 0, unidade: ' g' },
    { rotulo: 'Uniformidade', chave: 'uniformidade', casas: 1, unidade: '%' },
    { rotulo: 'GPD médio', chave: 'gpdMedioG', casas: 1, unidade: ' g/dia' },
    {
      rotulo: 'Ração consumida',
      chave: 'racaoConsumidaKg',
      casas: 0,
      unidade: ' kg',
    },
    {
      rotulo: 'Conversão alimentar',
      chave: 'conversaoAlimentar',
      casas: 3,
      unidade: '',
    },
    { rotulo: 'IEP', chave: 'iep', casas: 0, unidade: '' },
    {
      rotulo: 'Densidade',
      chave: 'densidadeKgM2',
      casas: 1,
      unidade: ' kg/m²',
    },
  ] as const;

  readonly idLote = input.required<string>();

  constructor() {
    effect(() => {
      const id = this.idLote();
      this.erro.set('');
      this.atual.carregar(id).catch((e) => this.erro.set(mensagemErro(e)));
    });
  }

  protected motivo(i: Indicador): string {
    return i.disponivel ? '' : i.motivo;
  }
}
