import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MAXIMO_VISOES, visaoSalvaSchema } from '@crista/domain';
import { z } from 'zod';
import { AcessoFazenda, podeVerGalpao } from '../fazendas/acesso-fazenda.guard';
import { VisaoSalva } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DadosVisao = z.output<typeof visaoSalvaSchema>;

const paraResposta = (v: VisaoSalva) => ({
  id: v.id,
  nome: v.nome,
  filtros: v.filtros,
  atualizadoEm: v.atualizadoEm,
});

/**
 * UC15: visões salvas do painel. São preferência de cada usuário na fazenda,
 * não dado da fazenda: ninguém mais as vê, e não passam pela auditoria.
 */
@Injectable()
export class VisoesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(acesso: AcessoFazenda) {
    const visoes = await this.prisma.visaoSalva.findMany({
      where: { usuarioId: acesso.usuarioId, fazendaId: acesso.fazendaId },
      orderBy: { nome: 'asc' },
    });
    return visoes.map(paraResposta);
  }

  /** Salvar com um nome que já existe substitui os filtros daquela visão. */
  async salvar(acesso: AcessoFazenda, dados: DadosVisao) {
    const lotes = await this.prisma.lote.findMany({
      where: { id: { in: dados.filtros.lotes }, fazendaId: acesso.fazendaId },
    });
    if (
      lotes.length !== new Set(dados.filtros.lotes).size ||
      lotes.some((l) => !podeVerGalpao(acesso, l.galpaoId))
    ) {
      throw new BadRequestException({
        message: 'Lote não encontrado',
        erros: [{ campo: 'filtros.lotes', mensagem: 'Lote não encontrado' }],
      });
    }
    const chave = {
      usuarioId: acesso.usuarioId,
      fazendaId: acesso.fazendaId,
      nome: dados.nome,
    };
    const existe = await this.prisma.visaoSalva.findUnique({
      where: { usuarioId_fazendaId_nome: chave },
    });
    if (
      !existe &&
      (await this.prisma.visaoSalva.count({
        where: { usuarioId: acesso.usuarioId, fazendaId: acesso.fazendaId },
      })) >= MAXIMO_VISOES
    ) {
      throw new ConflictException(
        `Limite de ${MAXIMO_VISOES} visões salvas: exclua uma antes de salvar outra`,
      );
    }
    const visao = await this.prisma.visaoSalva.upsert({
      where: { usuarioId_fazendaId_nome: chave },
      create: { ...chave, filtros: dados.filtros },
      update: { filtros: dados.filtros },
    });
    return paraResposta(visao);
  }

  async excluir(acesso: AcessoFazenda, visaoId: string) {
    const { count } = z.uuid().safeParse(visaoId).success
      ? await this.prisma.visaoSalva.deleteMany({
          where: {
            id: visaoId,
            usuarioId: acesso.usuarioId,
            fazendaId: acesso.fazendaId,
          },
        })
      : { count: 0 };
    if (count === 0) throw new NotFoundException('Visão não encontrada');
  }
}
