import { Injectable } from '@nestjs/common';
import { FiltroPainel, hojeISO, NOME_LINHAGEM, pode } from '@crista/domain';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { DadosDoLote, DadosLote } from '../producao/dados-lote';
import {
  curvaAte,
  financeiroDoLote,
  metaDoLote,
  serieDeMortalidade,
  serieDePeso,
} from '../producao/indicadores';
import { LoteContexto, paraISO } from '../producao/lote-contexto';
import { resumoDoLote } from '../producao/resumo';

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

@Injectable()
export class PainelService {
  constructor(
    private readonly contexto: LoteContexto,
    private readonly dadosLote: DadosLote,
  ) {}

  /**
   * UC15: compara até 4 lotes. O período corta os dados na data final (ou na
   * idade final de cada lote) e limita as séries ao intervalo pedido.
   */
  async comparar(acesso: AcessoFazenda, filtro: FiltroPainel) {
    const hoje = hojeISO();
    const verFinanceiro = pode(acesso.perfil, 'financeiro.ver');
    const lotes = await Promise.all(
      filtro.lotes.map((id) => this.contexto.carregar(acesso, id)),
    );

    const resultados = await Promise.all(
      lotes.map(async (lote) => {
        const completo = await this.dadosLote.carregar(lote, hoje);
        const { inicio, fim } = this.periodo(completo, filtro, hoje);
        const dados = this.dadosLote.cortarEm(completo, fim);
        const noPeriodo = <T extends { data: string }>(lista: T[]) =>
          lista.filter((x) => x.data >= inicio);
        const peso = noPeriodo(serieDePeso(dados));
        const idadeFinal = resumoDoLote(dados.entrada).idadeDias;
        return {
          id: lote.id,
          codigo: lote.codigo,
          galpao: dados.galpao.identificacao,
          linhagem: lote.linhagem,
          situacao: lote.situacao,
          dataAlojamento: paraISO(lote.dataAlojamento),
          periodo: { inicio, fim },
          resumo: resumoDoLote(dados.entrada),
          meta: metaDoLote(dados),
          financeiro: verFinanceiro ? financeiroDoLote(dados) : null,
          series: {
            peso,
            mortalidade: noPeriodo(serieDeMortalidade(dados)),
            curvaPadrao: curvaAte(dados.curva, idadeFinal),
          },
        };
      }),
    );

    const linhagens = [...new Set(lotes.map((l) => l.linhagem))];
    const avisos: string[] = [];
    if (linhagens.length > 1) {
      avisos.push(
        `Os lotes são de linhagens diferentes (${linhagens.map((l) => NOME_LINHAGEM[l]).join(', ')}), com metas diferentes: compare o desvio da curva, não o peso absoluto.`,
      );
    }
    if (resultados.some((r) => r.meta.fonteCurva === 'sintetico')) {
      avisos.push(
        'A curva de referência é de teste (sintética) até a equipe cadastrar as curvas oficiais das linhagens.',
      );
    }
    return { lotes: resultados, avisos, financeiroVisivel: verFinanceiro };
  }

  /** Converte o filtro (por data ou por idade) em datas do lote, sem passar de hoje. */
  private periodo(dados: DadosDoLote, filtro: FiltroPainel, hoje: string) {
    const { dataAlojamento, idadeInicialDias } = dados.entrada;
    const dataDaIdade = (idade: number) =>
      somarDias(dataAlojamento, idade - idadeInicialDias);
    let inicio = dataAlojamento;
    let fim = hoje;
    if (filtro.idadeDe !== undefined) inicio = dataDaIdade(filtro.idadeDe);
    if (filtro.idadeAte !== undefined) fim = dataDaIdade(filtro.idadeAte);
    if (filtro.de) inicio = filtro.de;
    if (filtro.ate) fim = filtro.ate;
    if (fim > hoje) fim = hoje;
    if (inicio < dataAlojamento) inicio = dataAlojamento;
    return { inicio, fim };
  }
}
