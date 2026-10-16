import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { edicaoGalpaoSchema, NovoGalpao } from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Galpao } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcessoFazenda, podeVerGalpao } from './acesso-fazenda.guard';

type EdicaoGalpao = z.output<typeof edicaoGalpaoSchema>;

const paraResposta = (g: Galpao) => {
  const area = Number(g.areaUtilM2);
  // Densidade máxima (UC03): capacidade ÷ área útil
  return {
    ...g,
    areaUtilM2: area,
    densidadeMaxima: Math.round((g.capacidadeAves / area) * 100) / 100,
  };
};

@Injectable()
export class GalpoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** UC03: identificação única na fazenda; o galpão nasce disponível. */
  async criar(acesso: AcessoFazenda, dados: NovoGalpao) {
    await this.garantirIdentificacaoLivre(
      acesso.fazendaId,
      dados.identificacao,
    );
    const galpao = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.galpao.create({
        data: { ...dados, fazendaId: acesso.fazendaId },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'galpao',
          idEntidade: criado.id,
          depois: criado,
        },
        tx,
      );
      return criado;
    });
    return paraResposta(galpao);
  }

  async listar(acesso: AcessoFazenda) {
    const galpoes = await this.prisma.galpao.findMany({
      where: {
        fazendaId: acesso.fazendaId,
        ...(acesso.galpoes.length > 0 && { id: { in: acesso.galpoes } }),
      },
      orderBy: { identificacao: 'asc' },
    });
    return galpoes.map(paraResposta);
  }

  async obter(acesso: AcessoFazenda, galpaoId: string) {
    return paraResposta(await this.buscar(acesso, galpaoId));
  }

  async editar(acesso: AcessoFazenda, galpaoId: string, dados: EdicaoGalpao) {
    const antes = await this.buscar(acesso, galpaoId);
    if (dados.identificacao && dados.identificacao !== antes.identificacao) {
      await this.garantirIdentificacaoLivre(
        acesso.fazendaId,
        dados.identificacao,
      );
    }
    if (dados.situacao && antes.situacao === 'ocupado') {
      throw new ConflictException(
        'O galpão tem lote em andamento; encerre o lote antes de mudar a situação',
      );
    }
    const depois = await this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.galpao.update({
        where: { id: galpaoId },
        data: dados,
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'editar',
          entidade: 'galpao',
          idEntidade: galpaoId,
          antes,
          depois: atualizado,
        },
        tx,
      );
      return atualizado;
    });
    return paraResposta(depois);
  }

  private async buscar(acesso: AcessoFazenda, galpaoId: string) {
    const galpao = z.uuid().safeParse(galpaoId).success
      ? await this.prisma.galpao.findFirst({
          where: { id: galpaoId, fazendaId: acesso.fazendaId },
        })
      : null;
    if (!galpao || !podeVerGalpao(acesso, galpao.id))
      throw new NotFoundException('Galpão não encontrado');
    return galpao;
  }

  private async garantirIdentificacaoLivre(
    fazendaId: string,
    identificacao: string,
  ) {
    if (
      await this.prisma.galpao.findFirst({
        where: { fazendaId, identificacao },
      })
    ) {
      throw new ConflictException(
        'Já existe um galpão com esta identificação na fazenda',
      );
    }
  }
}
