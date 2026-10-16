import { Injectable } from '@nestjs/common';
import { CategoriaDespesa, hojeISO, PontoCurva } from '@crista/domain';
import { Galpao, Lote } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoteContexto, numOuNulo, paraISO } from './lote-contexto';
import { EntradaResumo } from './resumo';

/** Parcela de despesa que cabe ao lote (UC12). */
export interface ParcelaDespesa {
  idDespesa: string;
  data: string;
  categoria: CategoriaDespesa;
  descricao: string;
  fornecedor: string | null;
  numeroNota: string | null;
  valor: number;
  percentual: number;
}

/** Tudo o que os indicadores do lote precisam, só com eventos válidos e não estornados. */
export interface DadosDoLote {
  lote: Lote;
  galpao: Galpao;
  entrada: EntradaResumo;
  parcelas: ParcelaDespesa[];
  curva: PontoCurva[];
  /** 'sintetico' indica curva de teste (doc 06); null quando a linhagem não tem curva. */
  fonteCurva: string | null;
}

@Injectable()
export class DadosLote {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contexto: LoteContexto,
  ) {}

  async carregar(lote: Lote, hoje = hojeISO()): Promise<DadosDoLote> {
    const loteId = lote.id;
    const valido = await this.contexto.filtroValidos(lote.fazendaId);

    const [
      galpao,
      alojamento,
      baixas,
      pesagens,
      movimentos,
      ocorrencias,
      rateios,
      curva,
    ] = await Promise.all([
      this.prisma.galpao.findUniqueOrThrow({ where: { id: lote.galpaoId } }),
      this.prisma.alojamento.findUnique({ where: { loteId } }),
      this.prisma.eventoBaixa.findMany({ where: { loteId, ...valido } }),
      this.prisma.pesagem.findMany({
        where: { loteId, ...valido },
        include: { pesos: true },
      }),
      this.prisma.movimentoRacao.findMany({ where: { loteId, ...valido } }),
      this.prisma.ocorrenciaSanitaria.findMany({
        where: { loteId, ...valido },
      }),
      this.prisma.despesaRateio.findMany({
        where: { loteId, despesa: valido },
        include: { despesa: true },
      }),
      this.curvaDa(lote),
    ]);

    return {
      lote,
      galpao,
      entrada: {
        hoje,
        dataAlojamento: paraISO(lote.dataAlojamento),
        idadeInicialDias: lote.idadeInicialDias,
        pesoPintoG: numOuNulo(lote.pesoPintoG),
        areaUtilM2: Number(galpao.areaUtilM2),
        alojamento,
        baixas: baixas.map((b) => ({
          data: paraISO(b.data),
          mortes: b.mortes,
          descartes: b.descartes,
        })),
        pesagens: pesagens.map((p) => ({
          data: paraISO(p.data),
          avesPesadas: p.avesPesadas,
          pesoTotalG: Number(p.pesoTotalG),
          pesos: p.pesos.map((x) => Number(x.pesoG)),
        })),
        movimentosRacao: movimentos.map((m) => ({
          data: paraISO(m.data),
          tipo: m.tipo,
          quantidadeKg: Number(m.quantidadeKg),
        })),
        ocorrencias: ocorrencias.map((o) => ({
          data: paraISO(o.data),
          carenciaDias: o.carenciaDias,
        })),
      },
      parcelas: rateios.map((r) => ({
        idDespesa: r.despesaId,
        data: paraISO(r.despesa.data),
        categoria: r.despesa.categoria,
        descricao: r.despesa.descricao,
        fornecedor: r.despesa.fornecedor,
        numeroNota: r.despesa.numeroNota,
        valor: Number(r.valor),
        percentual: Number(r.percentual),
      })),
      curva: curva.pontos,
      fonteCurva: curva.fonte,
    };
  }

  /** Corta os dados numa data, para ver o lote como estava naquele dia (UC15). */
  cortarEm(dados: DadosDoLote, fim: string): DadosDoLote {
    const ate = <T extends { data: string }>(lista: T[]) =>
      lista.filter((x) => x.data <= fim);
    return {
      ...dados,
      entrada: {
        ...dados.entrada,
        hoje: fim,
        baixas: ate(dados.entrada.baixas),
        pesagens: ate(dados.entrada.pesagens),
        movimentosRacao: ate(dados.entrada.movimentosRacao),
        ocorrencias: ate(dados.entrada.ocorrencias),
      },
      parcelas: ate(dados.parcelas),
    };
  }

  /** Curva da linhagem e sexagem do lote; sem curva do sexo, usa a de lote misto. Versão mais recente. */
  private async curvaDa(
    lote: Lote,
  ): Promise<{ pontos: PontoCurva[]; fonte: string | null }> {
    if (lote.linhagem === 'outra') return { pontos: [], fonte: null };
    for (const sexo of [lote.sexagem, 'misto'] as const) {
      const ultima = await this.prisma.curvaReferencia.findFirst({
        where: { linhagem: lote.linhagem, sexo },
        orderBy: { versao: 'desc' },
        select: { versao: true },
      });
      if (!ultima) continue;
      const linhas = await this.prisma.curvaReferencia.findMany({
        where: { linhagem: lote.linhagem, sexo, versao: ultima.versao },
        orderBy: { idadeDias: 'asc' },
      });
      return {
        pontos: linhas.map((l) => ({
          idadeDias: l.idadeDias,
          pesoG: Number(l.pesoG),
          consumoAcumG: numOuNulo(l.consumoAcumG),
        })),
        fonte: linhas[0]?.fonte ?? null,
      };
    }
    return { pontos: [], fonte: null };
  }
}
