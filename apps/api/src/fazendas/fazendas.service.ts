import { ConflictException, Injectable } from '@nestjs/common';
import { edicaoFazendaSchema, fazendaSchema, hojeISO } from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { Fazenda } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcessoFazenda } from './acesso-fazenda.guard';

type DadosFazenda = z.output<typeof fazendaSchema>;
type EdicaoFazenda = z.output<typeof edicaoFazendaSchema>;

const paraResposta = (f: Fazenda) => ({
  ...f,
  latitude: f.latitude == null ? null : Number(f.latitude),
  longitude: f.longitude == null ? null : Number(f.longitude),
});

@Injectable()
export class FazendasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** UC02: quem cria a fazenda vira Gestor. */
  async criar(usuarioId: string, dados: DadosFazenda) {
    if (
      await this.prisma.fazenda.findUnique({
        where: { documento: dados.documento },
      })
    ) {
      throw new ConflictException('Já existe uma fazenda com este CPF/CNPJ');
    }
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });

    const fazenda = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.fazenda.create({
        data: { ...dados, criadoPorId: usuarioId },
      });
      const vinculo = await tx.vinculo.create({
        data: {
          fazendaId: criada.id,
          usuarioId,
          emailConvidado: usuario.email,
          perfil: 'gestor',
          status: 'ativo',
          aceitoEm: new Date(),
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: criada.id,
          usuarioId,
          acao: 'criar',
          entidade: 'fazenda',
          idEntidade: criada.id,
          depois: criada,
        },
        tx,
      );
      await this.auditoria.registrar(
        {
          fazendaId: criada.id,
          usuarioId,
          acao: 'criar',
          entidade: 'vinculo',
          idEntidade: vinculo.id,
          depois: { perfil: 'gestor' },
        },
        tx,
      );
      return criada;
    });
    return { ...paraResposta(fazenda), perfil: 'gestor' as const };
  }

  async listar(usuarioId: string) {
    const vinculos = await this.prisma.vinculo.findMany({
      where: {
        usuarioId,
        status: 'ativo',
        OR: [{ validoAte: null }, { validoAte: { gte: new Date(hojeISO()) } }],
      },
      include: { fazenda: true },
      orderBy: { fazenda: { nome: 'asc' } },
    });
    return vinculos.map((v) => ({
      ...paraResposta(v.fazenda),
      perfil: v.perfil,
    }));
  }

  async obter(acesso: AcessoFazenda) {
    const fazenda = await this.prisma.fazenda.findUniqueOrThrow({
      where: { id: acesso.fazendaId },
    });
    return { ...paraResposta(fazenda), perfil: acesso.perfil };
  }

  async editar(acesso: AcessoFazenda, dados: EdicaoFazenda) {
    const fazenda = await this.prisma.$transaction(async (tx) => {
      const antes = await tx.fazenda.findUniqueOrThrow({
        where: { id: acesso.fazendaId },
      });
      const depois = await tx.fazenda.update({
        where: { id: acesso.fazendaId },
        data: dados,
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'editar',
          entidade: 'fazenda',
          idEntidade: depois.id,
          antes,
          depois,
        },
        tx,
      );
      return depois;
    });
    return { ...paraResposta(fazenda), perfil: acesso.perfil };
  }
}
