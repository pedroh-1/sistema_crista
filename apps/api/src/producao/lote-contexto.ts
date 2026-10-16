import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hojeISO } from '@crista/domain';
import { z } from 'zod';
import { Estorno, Lote } from '../generated/prisma/client';
import { AcessoFazenda, podeVerGalpao } from '../fazendas/acesso-fazenda.guard';
import { PrismaService } from '../prisma/prisma.service';

/** Data do banco (@db.Date, meia-noite UTC) para AAAA-MM-DD. */
export const paraISO = (data: Date): string => data.toISOString().slice(0, 10);

/** AAAA-MM-DD para o tipo Date gravado em colunas @db.Date. */
export const paraData = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

/** Estorno de um lançamento, para as listagens. */
export const estornoParaResposta = (e: Estorno | undefined) =>
  e ? { motivo: e.motivo, em: e.criadoEm, por: e.criadoPorId } : null;

/** Converte Decimal do Prisma para number, mantendo o nulo. */
export const numOuNulo = (v: { toString(): string } | null): number | null =>
  v == null ? null : Number(v);

@Injectable()
export class LoteContexto {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca o lote da fazenda respeitando os galpões permitidos ao vínculo.
   * Com `paraLancamento`, exige lote em andamento: lote encerrado é só consulta.
   */
  async carregar(
    acesso: AcessoFazenda,
    loteId: string,
    opcoes: { paraLancamento?: boolean } = {},
  ): Promise<Lote> {
    const lote = z.uuid().safeParse(loteId).success
      ? await this.prisma.lote.findFirst({
          where: { id: loteId, fazendaId: acesso.fazendaId },
        })
      : null;
    if (!lote || !podeVerGalpao(acesso, lote.galpaoId))
      throw new NotFoundException('Lote não encontrado');
    if (opcoes.paraLancamento && lote.situacao !== 'em_andamento') {
      throw new ConflictException(
        'Lote encerrado ou cancelado: só é possível consultar',
      );
    }
    return lote;
  }

  /** Filtro de eventos que contam nos indicadores: válidos e não estornados. */
  async filtroValidos(fazendaId: string) {
    const estornos = await this.prisma.estorno.findMany({
      where: { fazendaId },
      select: { idEvento: true },
    });
    return {
      status: 'valido' as const,
      id: { notIn: estornos.map((e) => e.idEvento) },
    };
  }

  /** Mortes + descartes válidos do lote. */
  async totalBaixas(fazendaId: string, loteId: string): Promise<number> {
    const soma = await this.prisma.eventoBaixa.aggregate({
      where: { loteId, ...(await this.filtroValidos(fazendaId)) },
      _sum: { mortes: true, descartes: true },
    });
    return (soma._sum.mortes ?? 0) + (soma._sum.descartes ?? 0);
  }

  /** Lançamentos não podem estar no futuro nem antes do alojamento. */
  validarData(lote: Lote, data: string, campo = 'data'): void {
    const alojamento = paraISO(lote.dataAlojamento);
    if (data > hojeISO())
      throw this.erroData(campo, 'A data não pode estar no futuro');
    if (data < alojamento)
      throw this.erroData(
        campo,
        `A data não pode ser anterior ao alojamento (${alojamento})`,
      );
  }

  private erroData(campo: string, mensagem: string) {
    return new BadRequestException({
      message: mensagem,
      erros: [{ campo, mensagem }],
    });
  }
}

/** Erro 409 que o cliente pode resolver confirmando (densidade, revisão de pesagem). */
export class ConfirmacaoNecessaria extends ConflictException {
  constructor(
    codigo: 'DENSIDADE' | 'REVISAO_PESAGEM' | 'DUPLICIDADE',
    mensagem: string,
  ) {
    super({ message: mensagem, codigo });
  }
}
