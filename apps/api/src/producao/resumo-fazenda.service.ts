import { Injectable } from '@nestjs/common';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DadosLote } from './dados-lote';
import { metaDoLote } from './indicadores';
import { paraISO } from './lote-contexto';
import { resumoDoLote } from './resumo';

/**
 * Resumo da fazenda para a página inicial: lotes em andamento com os indicadores do dia,
 * alertas abertos, galpões ocupados e equipamentos parados, só nos galpões do vínculo.
 */
@Injectable()
export class ResumoFazendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dadosLote: DadosLote,
  ) {}

  async resumo(acesso: AcessoFazenda) {
    const restrito = acesso.galpoes.length > 0;
    // Alerta e equipamento sem galpão são da fazenda e valem para todos.
    const galpaoOuFazenda = restrito
      ? { OR: [{ galpaoId: null }, { galpaoId: { in: acesso.galpoes } }] }
      : {};

    const [lotes, galpoes, alertas, equipamentosParados] = await Promise.all([
      this.prisma.lote.findMany({
        where: {
          fazendaId: acesso.fazendaId,
          situacao: 'em_andamento',
          ...(restrito && { galpaoId: { in: acesso.galpoes } }),
        },
        orderBy: { dataAlojamento: 'asc' },
      }),
      this.prisma.galpao.findMany({
        where: {
          fazendaId: acesso.fazendaId,
          situacao: { not: 'inativo' },
          ...(restrito && { id: { in: acesso.galpoes } }),
        },
        select: { situacao: true },
      }),
      this.prisma.alerta.findMany({
        where: {
          fazendaId: acesso.fazendaId,
          status: 'aberto',
          ...galpaoOuFazenda,
        },
        select: { loteId: true, criticidade: true },
      }),
      this.equipamentosParados(acesso),
    ]);

    const resumos = await Promise.all(
      lotes.map(async (lote) => {
        const dados = await this.dadosLote.carregar(lote);
        const resumo = resumoDoLote(dados.entrada);
        const meta = metaDoLote(dados);
        const doLote = alertas.filter((a) => a.loteId === lote.id);
        return {
          id: lote.id,
          codigo: lote.codigo,
          galpao: dados.galpao.identificacao,
          linhagem: lote.linhagem,
          dataAlojamento: paraISO(lote.dataAlojamento),
          idadeDias: resumo.idadeDias,
          saldoAves: resumo.saldoAves,
          mortalidade: resumo.mortalidade,
          mortalidadeHoje: resumo.mortalidadeHoje,
          pesoMedioG: resumo.pesoMedioG,
          ultimaPesagem: resumo.ultimaPesagem,
          situacaoMeta: meta.situacao,
          nivelMeta: meta.nivel,
          carenciaAte: resumo.carenciaAte,
          alertas: {
            abertos: doLote.length,
            criticos: doLote.filter((a) => a.criticidade === 'critico').length,
          },
        };
      }),
    );

    return {
      lotes: resumos,
      saldoAves: resumos.reduce((s, l) => s + (l.saldoAves ?? 0), 0),
      galpoes: {
        total: galpoes.length,
        ocupados: galpoes.filter((g) => g.situacao === 'ocupado').length,
      },
      alertas: {
        abertos: alertas.length,
        criticos: alertas.filter((a) => a.criticidade === 'critico').length,
      },
      equipamentosParados,
    };
  }

  /** Equipamentos com parada sem retorno (manutenção estornada não conta), só nos galpões do vínculo. */
  async equipamentosParados(acesso: AcessoFazenda) {
    const restrito = acesso.galpoes.length > 0;
    const galpaoOuFazenda = restrito
      ? { OR: [{ galpaoId: null }, { galpaoId: { in: acesso.galpoes } }] }
      : {};
    const [paradas, estornos] = await Promise.all([
      this.prisma.manutencao.findMany({
        where: {
          fazendaId: acesso.fazendaId,
          paradaInicio: { not: null },
          retornoOperacao: null,
          equipamento: { situacao: { not: 'inativo' }, ...galpaoOuFazenda },
        },
        select: {
          id: true,
          equipamentoId: true,
          equipamento: { select: { critico: true } },
        },
      }),
      this.prisma.estorno.findMany({
        where: { fazendaId: acesso.fazendaId, entidade: 'manutencao' },
        select: { idEvento: true },
      }),
    ]);
    const estornadas = new Set(estornos.map((e) => e.idEvento));
    const parados = new Map<string, boolean>();
    for (const p of paradas)
      if (!estornadas.has(p.id))
        parados.set(p.equipamentoId, p.equipamento.critico);
    return {
      total: parados.size,
      criticos: [...parados.values()].filter(Boolean).length,
    };
  }
}
