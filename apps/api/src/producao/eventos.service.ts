import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Acao,
  amostraMinima,
  avaliarMortalidadeDia,
  avesAlojadas,
  baixaSchema,
  idadeDias,
  motivoRevisaoPesagem,
  movimentoRacaoSchema,
  pesagemSchema,
  hojeISO,
  pode,
  uniformidade,
} from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DespesasService } from '../custos/despesas.service';
import { FilaService } from '../fila/fila.service';
import { TAREFA_AVALIAR_LOTE } from '../fila/tarefas';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmacaoNecessaria,
  estornoParaResposta,
  LoteContexto,
  paraData,
  paraISO,
} from './lote-contexto';

type DadosBaixa = z.output<typeof baixaSchema>;
type DadosPesagem = z.output<typeof pesagemSchema>;
type DadosRacao = z.output<typeof movimentoRacaoSchema>;

/** Eventos que podem ser estornados e a permissão exigida para isso. */
export const ENTIDADES_EVENTO = {
  baixa: 'baixa.registrar',
  pesagem: 'pesagem.registrar',
  racao: 'racao.registrar',
  ocorrencia: 'sanidade.registrar',
  carga: 'lote.encerrar',
} as const satisfies Record<string, Acao>;
export type EntidadeEvento = keyof typeof ENTIDADES_EVENTO;

@Injectable()
export class EventosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly contexto: LoteContexto,
    private readonly despesas: DespesasService,
    private readonly fila: FilaService,
  ) {}

  // ---------- UC07: baixa diária ----------

  /** Várias baixas por dia são somadas (docs/05-sincronizacao.md). O total nunca passa das aves alojadas. */
  async registrarBaixa(
    acesso: AcessoFazenda,
    loteId: string,
    dados: DadosBaixa,
  ) {
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    this.contexto.validarData(lote, dados.data);
    const alojamento = await this.prisma.alojamento.findUnique({
      where: { loteId },
    });
    if (!alojamento)
      throw new ConflictException(
        'Registre o alojamento antes de lançar baixas',
      );

    const alojadas = avesAlojadas(
      alojamento.avesRecebidas,
      alojamento.mortasTransporte,
    );
    const nova = dados.mortes + dados.descartes;
    const validos = await this.contexto.filtroValidos(acesso.fazendaId);

    const { baixa, saldo } = await this.prisma.$transaction(async (tx) => {
      // Serializa as baixas do mesmo lote para duas requisições simultâneas não passarem juntas do saldo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${loteId}))`;
      const lancadas = await tx.eventoBaixa.aggregate({
        where: { loteId, ...validos },
        _sum: { mortes: true, descartes: true },
      });
      const saldoAntes =
        alojadas - (lancadas._sum.mortes ?? 0) - (lancadas._sum.descartes ?? 0);
      if (nova > saldoAntes)
        throw new ConflictException(
          `A baixa (${nova}) passa do saldo atual de aves (${saldoAntes})`,
        );

      const criada = await tx.eventoBaixa.create({
        data: {
          ...dados,
          data: paraData(dados.data),
          fazendaId: acesso.fazendaId,
          loteId,
          criadoPorId: acesso.usuarioId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'baixa',
          idEntidade: criada.id,
          depois: criada,
        },
        tx,
      );
      // UC16: a avaliação de alertas roda depois, pela fila (RNF07).
      await this.fila.enfileirar(tx, TAREFA_AVALIAR_LOTE, {
        loteId,
        data: dados.data,
      });
      return { baixa: criada, saldo: saldoAntes };
    });

    // Mortalidade do dia sobre o saldo do início do dia, para avisar quem lançou (o alerta formal é o UC16).
    const soma = async (data: { equals: Date } | { lt: Date }) => {
      const r = await this.prisma.eventoBaixa.aggregate({
        where: { loteId, data, ...validos },
        _sum: { mortes: true, descartes: true },
      });
      return (r._sum.mortes ?? 0) + (r._sum.descartes ?? 0);
    };
    const totalDia = await soma({ equals: paraData(dados.data) });
    const saldoInicioDia =
      alojadas - (await soma({ lt: paraData(dados.data) }));
    const percentualDia =
      saldoInicioDia > 0 ? (totalDia / saldoInicioDia) * 100 : 0;
    const idade = idadeDias(
      paraISO(lote.dataAlojamento),
      dados.data,
      lote.idadeInicialDias,
    );

    return {
      id: baixa.id,
      data: dados.data,
      totalDoDia: totalDia,
      saldoAves: saldo - nova,
      mortalidadeDoDia: percentualDia,
      nivel: avaliarMortalidadeDia(percentualDia, idade),
    };
  }

  async listarBaixas(acesso: AcessoFazenda, loteId: string) {
    await this.contexto.carregar(acesso, loteId);
    const baixas = await this.prisma.eventoBaixa.findMany({
      where: { loteId },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    const estornos = await this.estornosDe(baixas.map((b) => b.id));
    const autores = await this.nomes(baixas.map((b) => b.criadoPorId));
    return baixas.map((b) => ({
      id: b.id,
      data: paraISO(b.data),
      mortes: b.mortes,
      descartes: b.descartes,
      causaProvavel: b.causaProvavel,
      status: b.status,
      registradoPor: autores.get(b.criadoPorId) ?? null,
      registradoEm: b.registradoEm,
      estorno: estornoParaResposta(estornos.get(b.id)),
    }));
  }

  // ---------- UC10: pesagem amostral ----------

  async registrarPesagem(
    acesso: AcessoFazenda,
    loteId: string,
    dados: DadosPesagem,
  ) {
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    this.contexto.validarData(lote, dados.data);

    const pesos = dados.pesosIndividuaisG ?? [];
    const avesPesadas =
      pesos.length > 0 ? pesos.length : (dados.avesPesadas ?? 0);
    const pesoTotalG =
      pesos.length > 0
        ? pesos.reduce((s, p) => s + p, 0)
        : (dados.pesoTotalG ?? 0);
    const pesoMedioG = pesoTotalG / avesPesadas;

    const anterior = await this.prisma.pesagem.findFirst({
      where: {
        loteId,
        data: { lte: paraData(dados.data) },
        ...(await this.contexto.filtroValidos(acesso.fazendaId)),
      },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    const revisao = motivoRevisaoPesagem(
      anterior && {
        data: paraISO(anterior.data),
        pesoMedioG: Number(anterior.pesoTotalG) / anterior.avesPesadas,
      },
      { data: dados.data, pesoMedioG },
    );
    if (revisao && !dados.confirmarRevisao) {
      throw new ConfirmacaoNecessaria(
        'REVISAO_PESAGEM',
        `${revisao}. Confira os pesos e confirme para salvar.`,
      );
    }

    const pesagem = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.pesagem.create({
        data: {
          fazendaId: acesso.fazendaId,
          loteId,
          data: paraData(dados.data),
          avesPesadas,
          pesoTotalG,
          pontoColeta: dados.pontoColeta,
          revisaoConfirmada: revisao !== null,
          criadoPorId: acesso.usuarioId,
          pesos: { create: pesos.map((pesoG) => ({ pesoG })) },
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'pesagem',
          idEntidade: criada.id,
          depois: { ...criada, pesosIndividuais: pesos.length },
        },
        tx,
      );
      await this.fila.enfileirar(tx, TAREFA_AVALIAR_LOTE, {
        loteId,
        data: hojeISO(),
      });
      return criada;
    });

    const saldo = await this.saldoAtual(acesso.fazendaId, loteId);
    const minimo = saldo === null ? null : amostraMinima(saldo);
    return {
      id: pesagem.id,
      data: dados.data,
      avesPesadas,
      pesoMedioG,
      uniformidade: uniformidade(pesos),
      amostraMinima: minimo,
      baixaRepresentatividade: minimo !== null && avesPesadas < minimo,
    };
  }

  async listarPesagens(acesso: AcessoFazenda, loteId: string) {
    const lote = await this.contexto.carregar(acesso, loteId);
    const pesagens = await this.prisma.pesagem.findMany({
      where: { loteId },
      include: { pesos: { select: { pesoG: true } } },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    const estornos = await this.estornosDe(pesagens.map((p) => p.id));
    return pesagens.map((p) => ({
      id: p.id,
      data: paraISO(p.data),
      idadeDias: idadeDias(
        paraISO(lote.dataAlojamento),
        paraISO(p.data),
        lote.idadeInicialDias,
      ),
      avesPesadas: p.avesPesadas,
      pesoMedioG: Number(p.pesoTotalG) / p.avesPesadas,
      uniformidade: uniformidade(p.pesos.map((x) => Number(x.pesoG))),
      pontoColeta: p.pontoColeta,
      revisaoConfirmada: p.revisaoConfirmada,
      status: p.status,
      estorno: estornoParaResposta(estornos.get(p.id)),
    }));
  }

  // ---------- Ração ----------

  async registrarRacao(
    acesso: AcessoFazenda,
    loteId: string,
    dados: DadosRacao,
  ) {
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    this.contexto.validarData(lote, dados.data);
    const { valorTotal, ...movimentoDados } = dados;
    const movimento = await this.prisma.$transaction(async (tx) => {
      const despesa = valorTotal
        ? await this.despesas.gravar(tx, acesso, {
            data: dados.data,
            categoria: 'racao',
            descricao: `Ração: ${dados.quantidadeKg} kg`,
            valor: valorTotal,
            fornecedor: dados.fornecedor,
            numeroNota: dados.notaFiscal,
            lotes: [loteId],
            criterioRateio: 'aves_alojadas',
            origem: 'racao',
          })
        : null;
      const criado = await tx.movimentoRacao.create({
        data: {
          ...movimentoDados,
          despesaId: despesa?.id,
          data: paraData(dados.data),
          fazendaId: acesso.fazendaId,
          loteId,
          criadoPorId: acesso.usuarioId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'racao',
          idEntidade: criado.id,
          depois: criado,
        },
        tx,
      );
      return criado;
    });
    return {
      id: movimento.id,
      data: dados.data,
      tipo: movimento.tipo,
      quantidadeKg: Number(movimento.quantidadeKg),
    };
  }

  async listarRacao(acesso: AcessoFazenda, loteId: string) {
    await this.contexto.carregar(acesso, loteId);
    const movimentos = await this.prisma.movimentoRacao.findMany({
      where: { loteId },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    const estornos = await this.estornosDe(movimentos.map((m) => m.id));
    return movimentos.map((m) => ({
      id: m.id,
      data: paraISO(m.data),
      tipo: m.tipo,
      quantidadeKg: Number(m.quantidadeKg),
      fornecedor: m.fornecedor,
      notaFiscal: m.notaFiscal,
      status: m.status,
      estorno: estornoParaResposta(estornos.get(m.id)),
    }));
  }

  // ---------- Estorno ----------

  /** Cancela um lançamento sem apagá-lo; exige a mesma permissão de quem lança. */
  async estornar(
    acesso: AcessoFazenda,
    loteId: string,
    entidade: EntidadeEvento,
    idEvento: string,
    motivo: string,
  ) {
    if (!pode(acesso.perfil, ENTIDADES_EVENTO[entidade])) {
      throw new ForbiddenException(
        'Seu perfil nesta fazenda não permite corrigir este lançamento',
      );
    }
    await this.contexto.carregar(acesso, loteId, { paraLancamento: true });
    const evento = await this.buscarEvento(entidade, idEvento, loteId);
    if (!evento) throw new NotFoundException('Lançamento não encontrado');
    if (await this.prisma.estorno.findUnique({ where: { idEvento } }))
      throw new ConflictException('Lançamento já estornado');

    await this.prisma.$transaction(async (tx) => {
      const estorno = await tx.estorno.create({
        data: {
          fazendaId: acesso.fazendaId,
          entidade,
          idEvento,
          motivo,
          criadoPorId: acesso.usuarioId,
        },
      });
      // Entrega de ração com valor: a despesa gerada junto é estornada também.
      if ('despesaId' in evento && evento.despesaId) {
        await tx.estorno.create({
          data: {
            fazendaId: acesso.fazendaId,
            entidade: 'despesa',
            idEvento: evento.despesaId,
            motivo: `Estorno da entrega de ração: ${motivo}`,
            criadoPorId: acesso.usuarioId,
          },
        });
      }
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'estornar',
          entidade,
          idEntidade: idEvento,
          depois: { idEstorno: estorno.id, motivo },
        },
        tx,
      );
    });
  }

  private buscarEvento(entidade: EntidadeEvento, id: string, loteId: string) {
    if (!z.uuid().safeParse(id).success) return null;
    const where = { id, loteId };
    switch (entidade) {
      case 'baixa':
        return this.prisma.eventoBaixa.findFirst({ where });
      case 'pesagem':
        return this.prisma.pesagem.findFirst({ where });
      case 'racao':
        return this.prisma.movimentoRacao.findFirst({ where });
      case 'ocorrencia':
        return this.prisma.ocorrenciaSanitaria.findFirst({ where });
      case 'carga':
        return this.prisma.saidaCarga.findFirst({ where });
    }
  }

  private async estornosDe(ids: string[]) {
    const estornos = await this.prisma.estorno.findMany({
      where: { idEvento: { in: ids } },
    });
    return new Map(estornos.map((e) => [e.idEvento, e]));
  }

  private async nomes(ids: string[]) {
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, nome: true },
    });
    return new Map(usuarios.map((u) => [u.id, u.nome]));
  }

  private async saldoAtual(
    fazendaId: string,
    loteId: string,
  ): Promise<number | null> {
    const alojamento = await this.prisma.alojamento.findUnique({
      where: { loteId },
    });
    if (!alojamento) return null;
    return (
      avesAlojadas(alojamento.avesRecebidas, alojamento.mortasTransporte) -
      (await this.contexto.totalBaixas(fazendaId, loteId))
    );
  }
}
