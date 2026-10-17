import { Injectable } from '@nestjs/common';
import {
  FiltroVisaoGeral,
  hojeISO,
  IndicadorDoLote,
  indicadoresDaFazenda,
  mortalidadeDiariaDaFazenda,
  NOME_INDICADOR_ALERTA,
  PERIODO_PADRAO_DIAS,
  NivelLimite,
  pode,
  serieMortalidadeDia,
  valorDe,
} from '@crista/domain';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DadosLote } from './dados-lote';
import { br, num } from './formato';
import { financeiroDoLote, metaDoLote } from './indicadores';
import { paraData, paraISO } from './lote-contexto';
import { limiteDe, resumoDoLote } from './resumo';
import { ResumoFazendaService } from './resumo-fazenda.service';

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Para onde o ponto de atenção leva na tela. */
export type LinkAtencao =
  { tipo: 'lote'; id: string } | { tipo: 'alertas' } | { tipo: 'equipamentos' };

export interface PontoAtencao {
  tom: 'critico' | 'atencao' | 'info' | 'sucesso';
  texto: string;
  link: LinkAtencao | null;
}

const ORDEM_TOM: Record<PontoAtencao['tom'], number> = {
  critico: 0,
  atencao: 1,
  sucesso: 2,
  info: 3,
};

/**
 * Visão geral da fazenda (docs/08-design.md): indicadores agregados, mortalidade
 * diária, comparação dos lotes, custos e os pontos de atenção, todos com o mesmo
 * filtro. O relatório da fazenda chama este serviço para os números baterem.
 */
@Injectable()
export class VisaoGeralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dadosLote: DadosLote,
    private readonly resumos: ResumoFazendaService,
  ) {}

  async visao(acesso: AcessoFazenda, filtro: FiltroVisaoGeral) {
    const hoje = hojeISO();
    const ate = filtro.ate && filtro.ate < hoje ? filtro.ate : hoje;
    const de = filtro.de ?? somarDias(ate, -PERIODO_PADRAO_DIAS);
    const verFinanceiro = pode(acesso.perfil, 'financeiro.ver');

    const [fazenda, lotes, alertas, parados] = await Promise.all([
      this.prisma.fazenda.findUniqueOrThrow({
        where: { id: acesso.fazendaId },
        select: { id: true, nome: true, municipio: true, uf: true },
      }),
      this.prisma.lote.findMany({
        where: this.filtroLotes(acesso, filtro, de, ate),
        include: {
          encerramento: { select: { dataEncerramento: true, parcial: true } },
        },
        orderBy: { dataAlojamento: 'asc' },
      }),
      this.prisma.alerta.findMany({
        where: {
          fazendaId: acesso.fazendaId,
          status: 'aberto',
          ...(acesso.galpoes.length > 0 && {
            OR: [{ galpaoId: null }, { galpaoId: { in: acesso.galpoes } }],
          }),
        },
        select: {
          loteId: true,
          equipamentoId: true,
          indicador: true,
          criticidade: true,
          mensagem: true,
        },
      }),
      this.resumos.equipamentosParados(acesso),
    ]);

    const dados = await Promise.all(
      lotes.map(async (lote) => {
        const encerradoEm = lote.encerramento
          ? paraISO(lote.encerramento.dataEncerramento)
          : null;
        // Lote encerrado fica como estava no encerramento; os outros, no fim do período.
        const fim = encerradoEm && encerradoEm < ate ? encerradoEm : ate;
        const completo = await this.dadosLote.carregar(lote, fim);
        return {
          lote,
          encerradoEm,
          dados: this.dadosLote.cortarEm(completo, fim),
        };
      }),
    );

    const linhas = dados.map(({ lote, encerradoEm, dados: d }) => {
      const resumo = resumoDoLote(d.entrada);
      const meta = metaDoLote(d);
      const fin = verFinanceiro ? financeiroDoLote(d) : null;
      const doLote = alertas.filter((a) => a.loteId === lote.id);
      return {
        id: lote.id,
        codigo: lote.codigo,
        galpao: d.galpao.identificacao,
        galpaoId: lote.galpaoId,
        linhagem: lote.linhagem,
        situacao: lote.situacao,
        dataAlojamento: paraISO(lote.dataAlojamento),
        dataEncerramento: encerradoEm,
        encerramentoParcial: lote.encerramento?.parcial ?? false,
        idadeDias: resumo.idadeDias,
        avesAlojadas: resumo.avesAlojadas,
        saldoAves: resumo.saldoAves,
        baixasAcumuladas: resumo.baixasAcumuladas,
        mortalidade: resumo.mortalidade,
        // A mortalidade "de hoje" só faz sentido com o período terminando hoje.
        mortalidadeHoje:
          lote.situacao === 'em_andamento' && ate === hoje
            ? resumo.mortalidadeHoje
            : null,
        pesoMedioG: resumo.pesoMedioG,
        desvioCurva: meta.desvioCurva,
        situacaoMeta: meta.situacao,
        nivelMeta: meta.nivel,
        uniformidade: resumo.uniformidade,
        uniformidadeNivel: resumo.uniformidadeNivel,
        conversaoAlimentar: resumo.conversaoAlimentar,
        iep: resumo.iep,
        carenciaAte:
          lote.situacao === 'em_andamento' ? resumo.carenciaAte : null,
        alertas: {
          abertos: doLote.length,
          criticos: doLote.filter((a) => a.criticidade === 'critico').length,
        },
        financeiro: fin && {
          custoTotal: fin.custoTotal,
          custoPorKg: fin.custoPorKg,
          margem: fin.margem,
        },
        // Para a agregação; não sai na resposta.
        _agregar: {
          racaoConsumidaKg: valorDe(resumo.racaoConsumidaKg),
          pesoVivoProduzidoKg: valorDe(resumo.pesoVivoProduzidoKg),
          porCategoria: fin?.porCategoria ?? [],
          parcelas: d.parcelas,
        },
      };
    });

    const indicadores = indicadoresDaFazenda(
      linhas.map((l) => ({
        situacao: l.situacao,
        avesAlojadas: l.avesAlojadas,
        baixasAcumuladas: l.baixasAcumuladas,
        saldoAves: l.saldoAves,
        racaoConsumidaKg: l._agregar.racaoConsumidaKg,
        pesoVivoProduzidoKg: l._agregar.pesoVivoProduzidoKg,
        iep: valorDe(l.iep),
        situacaoMeta: l.situacaoMeta,
        custoTotal: l.financeiro?.custoTotal ?? null,
        margem: l.financeiro ? valorDe(l.financeiro.margem) : null,
      })),
    );

    const mortalidadeDiaria = mortalidadeDiariaDaFazenda(
      dados.flatMap(({ dados: d }) => {
        const e = d.entrada;
        const alojadas = resumoDoLote(e).avesAlojadas;
        if (alojadas === null) return [];
        return [
          serieMortalidadeDia(
            {
              dataAlojamento: e.dataAlojamento,
              idadeInicialDias: e.idadeInicialDias,
              avesAlojadas: alojadas,
              baixas: e.baixas,
              cargas: e.cargas,
            },
            limiteDe(e, 'mortalidade_dia'),
          ),
        ];
      }),
      de,
      ate,
    );

    const idsDosLotes = new Set(linhas.map((l) => l.id));
    const filtrado = Boolean(filtro.galpao || filtro.lote);
    const alertasNoFiltro = alertas.filter((a) =>
      // Com galpão ou lote no filtro, só os alertas dos lotes que ficaram.
      filtrado ? a.loteId !== null && idsDosLotes.has(a.loteId) : true,
    );

    return {
      fazenda,
      periodo: { de, ate },
      filtro: {
        galpao: filtro.galpao ?? null,
        lote: filtro.lote ?? null,
        situacao: filtro.situacao,
      },
      financeiroVisivel: verFinanceiro,
      indicadores,
      alertas: {
        abertos: alertasNoFiltro.length,
        criticos: alertasNoFiltro.filter((a) => a.criticidade === 'critico')
          .length,
      },
      mortalidadeDiaria,
      lotes: linhas.map(({ _agregar, ...linha }) => linha),
      custos: verFinanceiro ? this.custos(linhas, de, ate) : null,
      atencao: this.atencao(
        linhas,
        alertasNoFiltro,
        filtrado ? null : parados,
        de,
        mortalidadeDiaria,
      ),
    };
  }

  /** Lotes do vínculo cuja vida cruza o período (cancelados ficam de fora). */
  private filtroLotes(
    acesso: AcessoFazenda,
    filtro: FiltroVisaoGeral,
    de: string,
    ate: string,
  ): Prisma.LoteWhereInput {
    const situacoes =
      filtro.situacao === 'todos'
        ? (['em_andamento', 'encerrado'] as const)
        : ([filtro.situacao] as const);
    const galpoes = [
      ...(acesso.galpoes.length > 0
        ? [{ galpaoId: { in: acesso.galpoes } }]
        : []),
      ...(filtro.galpao ? [{ galpaoId: filtro.galpao }] : []),
    ];
    return {
      fazendaId: acesso.fazendaId,
      situacao: { in: [...situacoes] },
      dataAlojamento: { lte: paraData(ate) },
      AND: [
        ...galpoes,
        ...(filtro.lote ? [{ id: filtro.lote }] : []),
        {
          OR: [
            { situacao: 'em_andamento' },
            { encerramento: { dataEncerramento: { gte: paraData(de) } } },
          ],
        },
      ],
    };
  }

  /** Custo por categoria (acumulado dos lotes) e despesas lançadas por mês no período. */
  private custos(
    linhas: {
      _agregar: {
        porCategoria: { categoria: string; valor: number }[];
        parcelas: { data: string; valor: number }[];
      };
    }[],
    de: string,
    ate: string,
  ) {
    const categorias = new Map<string, number>();
    for (const l of linhas)
      for (const c of l._agregar.porCategoria)
        categorias.set(
          c.categoria,
          (categorias.get(c.categoria) ?? 0) + c.valor,
        );
    const total = [...categorias.values()].reduce((s, v) => s + v, 0);

    const meses = new Map<string, number>();
    for (const l of linhas)
      for (const p of l._agregar.parcelas)
        if (p.data >= de && p.data <= ate) {
          const mes = p.data.slice(0, 7);
          meses.set(mes, (meses.get(mes) ?? 0) + p.valor);
        }

    return {
      porCategoria: [...categorias]
        .map(([categoria, valor]) => ({
          categoria,
          valor,
          percentual: total > 0 ? (valor / total) * 100 : 0,
        }))
        .sort((a, b) => b.valor - a.valor),
      porMes: [...meses]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, valor]) => ({ mes, valor })),
    };
  }

  /**
   * Resumo gerencial: o que pede ação primeiro. Alertas abertos vêm com a
   * mensagem da regra; os mesmos limites são conferidos nos lotes em andamento
   * para o que ainda não virou alerta (a fila avalia depois do lançamento).
   */
  private atencao(
    linhas: {
      id: string;
      codigo: string;
      situacao: string;
      mortalidadeHoje: {
        percentual: { disponivel: boolean; valor?: number };
        nivel: NivelLimite | null;
      } | null;
      desvioCurva: { disponivel: boolean; valor?: number };
      nivelMeta: NivelLimite | null;
      uniformidade: { disponivel: boolean; valor?: number };
      uniformidadeNivel: NivelLimite | null;
      carenciaAte: string | null;
      dataEncerramento: string | null;
      encerramentoParcial: boolean;
    }[],
    alertas: {
      loteId: string | null;
      equipamentoId: string | null;
      indicador: string;
      criticidade: string;
      mensagem: string;
    }[],
    parados: { total: number; criticos: number } | null,
    de: string,
    mortalidadeDiaria: { data: string; nivel: NivelLimite }[],
  ): PontoAtencao[] {
    const pontos: PontoAtencao[] = [];
    const codigo = new Map(linhas.map((l) => [l.id, l.codigo]));

    for (const a of alertas) {
      if (a.equipamentoId) continue; // contados junto dos equipamentos parados
      const lote = a.loteId ? codigo.get(a.loteId) : undefined;
      pontos.push({
        tom: a.criticidade === 'critico' ? 'critico' : 'atencao',
        texto: `${lote ? `Lote ${lote}: ` : ''}${a.mensagem}`,
        link: a.loteId ? { tipo: 'lote', id: a.loteId } : { tipo: 'alertas' },
      });
    }

    for (const l of linhas) {
      if (l.situacao !== 'em_andamento') continue;
      const desvios: [
        IndicadorDoLote,
        NivelLimite | null,
        number | undefined,
        string,
      ][] = [
        [
          'mortalidade_dia',
          l.mortalidadeHoje?.nivel ?? null,
          l.mortalidadeHoje?.percentual.valor,
          'hoje',
        ],
        ['desvio_peso', l.nivelMeta, l.desvioCurva.valor, 'na última pesagem'],
        [
          'uniformidade',
          l.uniformidadeNivel,
          l.uniformidade.valor,
          'na última pesagem',
        ],
      ];
      for (const [indicador, nivel, valor, quando] of desvios) {
        const jaTemAlerta = alertas.some(
          (a) => a.loteId === l.id && a.indicador === indicador,
        );
        if (jaTemAlerta || valor === undefined) continue;
        if (nivel !== 'atencao' && nivel !== 'critico') continue;
        pontos.push({
          tom: nivel,
          texto: `Lote ${l.codigo}: ${NOME_INDICADOR_ALERTA[indicador].toLowerCase()} em ${num(valor, indicador === 'mortalidade_dia' ? 2 : 1)}% ${quando}, além do limite ${nivel === 'critico' ? 'crítico' : 'de atenção'}`,
          link: { tipo: 'lote', id: l.id },
        });
      }
    }

    for (const l of linhas) {
      if (l.carenciaAte) {
        pontos.push({
          tom: 'info',
          texto: `Lote ${l.codigo} em carência até ${br(l.carenciaAte)}: a saída para abate fica bloqueada até lá`,
          link: { tipo: 'lote', id: l.id },
        });
      }
      if (
        l.encerramentoParcial &&
        l.dataEncerramento &&
        l.dataEncerramento >= de
      ) {
        pontos.push({
          tom: 'info',
          texto: `Lote ${l.codigo} foi encerrado com pendências: o relatório dele é parcial`,
          link: { tipo: 'lote', id: l.id },
        });
      }
    }

    // Dias do período que passaram do limite: o que já passou, mas explica o gráfico.
    const diasAcima = mortalidadeDiaria.filter((p) => p.nivel !== 'normal');
    if (diasAcima.length > 0) {
      const criticos = diasAcima.filter((p) => p.nivel === 'critico').length;
      pontos.push({
        tom: 'atencao',
        texto:
          `Mortalidade acima do limite em ${diasAcima.length} ${diasAcima.length === 1 ? 'dia' : 'dias'} do período` +
          (criticos > 0 ? ` (${criticos} no crítico)` : '') +
          `, o último em ${br(diasAcima[diasAcima.length - 1].data)}`,
        link: null,
      });
    }

    if (parados && parados.total > 0) {
      pontos.push({
        tom: parados.criticos > 0 ? 'critico' : 'atencao',
        texto:
          `${parados.total} ${parados.total === 1 ? 'equipamento parado' : 'equipamentos parados'}` +
          (parados.criticos > 0
            ? `, ${parados.criticos} ${parados.criticos === 1 ? 'crítico' : 'críticos'}`
            : ''),
        link: { tipo: 'equipamentos' },
      });
    }

    if (!pontos.some((p) => p.tom === 'critico' || p.tom === 'atencao')) {
      pontos.unshift({
        tom: 'sucesso',
        texto:
          'Nenhum alerta aberto e nenhum lote fora dos limites configurados hoje',
        link: null,
      });
    }
    return pontos.sort((a, b) => ORDEM_TOM[a.tom] - ORDEM_TOM[b.tom]);
  }
}

export type VisaoGeral = Awaited<ReturnType<VisaoGeralService['visao']>>;
