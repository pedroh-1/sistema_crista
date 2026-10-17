import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  avesAlojadas,
  CategoriaDespesa,
  CriterioRateio,
  despesaSchema,
  hojeISO,
  racaoConsumidaKg,
  ratear,
} from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AcessoFazenda, podeVerGalpao } from '../fazendas/acesso-fazenda.guard';
import { OrigemDespesa, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmacaoNecessaria,
  estornoParaResposta,
  LoteContexto,
  paraData,
  paraISO,
} from '../producao/lote-contexto';

type DadosDespesa = z.output<typeof despesaSchema>;

/** Despesa já validada, pronta para gravar (usada também pela entrega de ração). */
export interface NovaDespesaInterna {
  data: string;
  categoria: CategoriaDespesa;
  descricao: string;
  valor: number;
  fornecedor?: string;
  numeroNota?: string;
  lotes: string[];
  criterioRateio: CriterioRateio;
  percentuais?: number[];
  origem: OrigemDespesa;
  /** Manutenção que gerou a despesa (UC19). */
  manutencaoId?: string;
  /**
   * Os lotes foram escolhidos pelo sistema, não por quem lança: o rateio vale
   * mesmo para lotes de galpões que o vínculo não vê (ex.: equipamento da fazenda).
   */
  rateioPeloSistema?: boolean;
  duplicidadeConfirmada?: boolean;
}

@Injectable()
export class DespesasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly contexto: LoteContexto,
  ) {}

  /** UC12: lança a despesa e reparte entre os lotes pelo critério escolhido. */
  async registrar(acesso: AcessoFazenda, dados: DadosDespesa) {
    if (dados.data > hojeISO()) {
      throw new BadRequestException({
        message: 'A data não pode estar no futuro',
        erros: [{ campo: 'data', mensagem: 'A data não pode estar no futuro' }],
      });
    }
    if (dados.numeroNota && dados.fornecedor && !dados.confirmarDuplicidade) {
      const igual = await this.prisma.despesa.findFirst({
        where: {
          fazendaId: acesso.fazendaId,
          numeroNota: { equals: dados.numeroNota, mode: 'insensitive' },
          fornecedor: { equals: dados.fornecedor, mode: 'insensitive' },
          ...(await this.contexto.filtroValidos(acesso.fazendaId)),
        },
      });
      if (igual) {
        throw new ConfirmacaoNecessaria(
          'DUPLICIDADE',
          `Já existe uma despesa com a nota ${dados.numeroNota} de ${dados.fornecedor} (${paraISO(igual.data)}, R$ ${Number(igual.valor).toFixed(2)}). Confirme se não é a mesma.`,
        );
      }
    }
    const despesa = await this.prisma.$transaction((tx) =>
      this.gravar(tx, acesso, {
        ...dados,
        origem: 'manual',
        duplicidadeConfirmada: dados.confirmarDuplicidade,
      }),
    );
    return despesa;
  }

  /** Grava a despesa e as parcelas dentro de uma transação já aberta. */
  async gravar(
    tx: Prisma.TransactionClient,
    acesso: AcessoFazenda,
    dados: NovaDespesaInterna,
  ) {
    const parcelas = await this.calcularRateio(acesso, dados);
    const despesa = await tx.despesa.create({
      data: {
        fazendaId: acesso.fazendaId,
        data: paraData(dados.data),
        categoria: dados.categoria,
        descricao: dados.descricao,
        valor: dados.valor,
        fornecedor: dados.fornecedor,
        numeroNota: dados.numeroNota,
        criterioRateio: dados.lotes.length > 1 ? dados.criterioRateio : null,
        origem: dados.origem,
        manutencaoId: dados.manutencaoId,
        duplicidadeConfirmada: dados.duplicidadeConfirmada ?? false,
        criadoPorId: acesso.usuarioId,
        rateios: { create: parcelas },
      },
    });
    await this.auditoria.registrar(
      {
        fazendaId: acesso.fazendaId,
        usuarioId: acesso.usuarioId,
        acao: 'criar',
        entidade: 'despesa',
        idEntidade: despesa.id,
        depois: { ...despesa, rateios: parcelas },
      },
      tx,
    );
    return { id: despesa.id, valor: Number(despesa.valor), rateios: parcelas };
  }

  async listar(acesso: AcessoFazenda, loteId?: string) {
    const despesas = await this.prisma.despesa.findMany({
      where: {
        fazendaId: acesso.fazendaId,
        ...(loteId && { rateios: { some: { loteId } } }),
      },
      include: {
        rateios: {
          include: { lote: { select: { codigo: true, galpaoId: true } } },
        },
      },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    const estornos = await this.prisma.estorno.findMany({
      where: { idEvento: { in: despesas.map((d) => d.id) } },
    });
    const estornoPorId = new Map(estornos.map((e) => [e.idEvento, e]));
    const restrito = acesso.galpoes.length > 0;

    return despesas
      .map((d) => ({
        id: d.id,
        data: paraISO(d.data),
        categoria: d.categoria,
        descricao: d.descricao,
        valor: Number(d.valor),
        fornecedor: d.fornecedor,
        numeroNota: d.numeroNota,
        criterioRateio: d.criterioRateio,
        origem: d.origem,
        estorno: estornoParaResposta(estornoPorId.get(d.id)),
        // Quem só vê alguns galpões só vê as parcelas desses galpões.
        rateios: d.rateios
          .filter((r) => podeVerGalpao(acesso, r.lote.galpaoId))
          .map((r) => ({
            loteId: r.loteId,
            lote: r.lote.codigo,
            percentual: Number(r.percentual),
            valor: Number(r.valor),
          })),
      }))
      .filter((d) => !restrito || d.rateios.length > 0);
  }

  async estornar(acesso: AcessoFazenda, despesaId: string, motivo: string) {
    const despesa = z.uuid().safeParse(despesaId).success
      ? await this.prisma.despesa.findFirst({
          where: { id: despesaId, fazendaId: acesso.fazendaId },
        })
      : null;
    if (!despesa) throw new NotFoundException('Despesa não encontrada');
    if (despesa.origem === 'racao') {
      throw new ConflictException(
        'Esta despesa veio de uma entrega de ração: corrija pela aba Ração do lote',
      );
    }
    if (despesa.origem === 'manutencao') {
      throw new ConflictException(
        'Esta despesa veio de uma manutenção: corrija pela página do equipamento',
      );
    }
    if (
      await this.prisma.estorno.findUnique({ where: { idEvento: despesaId } })
    ) {
      throw new ConflictException('Despesa já estornada');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.estorno.create({
        data: {
          fazendaId: acesso.fazendaId,
          entidade: 'despesa',
          idEvento: despesaId,
          motivo,
          criadoPorId: acesso.usuarioId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'estornar',
          entidade: 'despesa',
          idEntidade: despesaId,
          depois: { motivo },
        },
        tx,
      );
    });
  }

  /** Parcelas em centavos: a soma é sempre o valor da despesa. */
  private async calcularRateio(
    acesso: AcessoFazenda,
    dados: NovaDespesaInterna,
  ) {
    if (dados.lotes.length === 0) return [];
    const ids = [...new Set(dados.lotes)];
    if (ids.length !== dados.lotes.length)
      throw this.erroLotes('Lote repetido no rateio');

    const lotes = await this.prisma.lote.findMany({
      where: { id: { in: ids }, fazendaId: acesso.fazendaId },
    });
    const porId = new Map(lotes.map((l) => [l.id, l]));
    for (const id of ids) {
      const lote = porId.get(id);
      if (
        !lote ||
        (!dados.rateioPeloSistema && !podeVerGalpao(acesso, lote.galpaoId))
      )
        throw this.erroLotes('Lote não encontrado');
      if (lote.situacao !== 'em_andamento')
        throw this.erroLotes(`O lote ${lote.codigo} não está em andamento`);
    }

    const pesos =
      ids.length === 1
        ? [1]
        : await this.pesosDoRateio(acesso.fazendaId, ids, dados);
    const total = pesos.reduce((s, p) => s + p, 0);
    const centavos = ratear(Math.round(dados.valor * 100), pesos);
    return ids.map((loteId, i) => ({
      loteId,
      percentual: Math.round((pesos[i] / total) * 1_000_000) / 10_000,
      valor: centavos[i] / 100,
    }));
  }

  private async pesosDoRateio(
    fazendaId: string,
    ids: string[],
    dados: NovaDespesaInterna,
  ): Promise<number[]> {
    switch (dados.criterioRateio) {
      case 'percentual':
        return dados.percentuais ?? [];
      case 'aves_alojadas': {
        const alojamentos = await this.prisma.alojamento.findMany({
          where: { loteId: { in: ids } },
        });
        const porLote = new Map(
          alojamentos.map((a) => [
            a.loteId,
            avesAlojadas(a.avesRecebidas, a.mortasTransporte),
          ]),
        );
        return ids.map((id) => {
          const aves = porLote.get(id);
          if (!aves)
            throw this.erroLotes(
              'Todos os lotes precisam ter o alojamento registrado para ratear por aves alojadas',
            );
          return aves;
        });
      }
      case 'consumo_racao': {
        const movimentos = await this.prisma.movimentoRacao.findMany({
          where: {
            loteId: { in: ids },
            ...(await this.contexto.filtroValidos(fazendaId)),
          },
        });
        return ids.map((id) => {
          const consumo = racaoConsumidaKg(
            movimentos
              .filter((m) => m.loteId === id)
              .map((m) => ({
                data: paraISO(m.data),
                tipo: m.tipo,
                quantidadeKg: Number(m.quantidadeKg),
              })),
          );
          if (!consumo)
            throw this.erroLotes(
              'Todos os lotes precisam ter ração registrada para ratear por consumo',
            );
          return consumo;
        });
      }
    }
  }

  private erroLotes(mensagem: string) {
    return new BadRequestException({
      message: mensagem,
      erros: [{ campo: 'lotes', mensagem }],
    });
  }
}
