import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Acao, hojeISO, Perfil, pode } from '@crista/domain';
import type { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

export interface AcessoFazenda {
  fazendaId: string;
  usuarioId: string;
  vinculoId: string;
  perfil: Perfil;
  /** Galpões permitidos. Vazio = todos os galpões da fazenda. */
  galpoes: string[];
}

declare module 'express' {
  interface Request {
    acesso?: AcessoFazenda;
  }
}

const PERMITE = 'permite';

/** Ação da matriz de permissões (docs/02-permissoes.md) exigida pela rota. */
export const Permite = (acao: Acao) => SetMetadata(PERMITE, acao);

export const Acesso = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AcessoFazenda => {
    const acesso = ctx.switchToHttp().getRequest<Request>().acesso;
    if (!acesso) throw new Error('Rota sem AcessoFazendaGuard');
    return acesso;
  },
);

/** Confere se o galpão está entre os permitidos ao vínculo. */
export function podeVerGalpao(
  acesso: AcessoFazenda,
  galpaoId: string,
): boolean {
  return acesso.galpoes.length === 0 || acesso.galpoes.includes(galpaoId);
}

/**
 * Para rotas /fazendas/:idFazenda/...: exige vínculo ativo e dentro da validade
 * e, se a rota tiver @Permite, que o perfil tenha a permissão.
 * Sem vínculo a resposta é 404, para não revelar que a fazenda existe.
 */
@Injectable()
export class AcessoFazendaGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const fazendaId = req.params['idFazenda'];
    const usuarioId = req.usuario?.id;
    if (!usuarioId || !z.uuid().safeParse(fazendaId).success)
      throw new NotFoundException('Fazenda não encontrada');

    const vinculo = await this.prisma.vinculo.findFirst({
      where: {
        fazendaId,
        usuarioId,
        status: 'ativo',
        OR: [{ validoAte: null }, { validoAte: { gte: new Date(hojeISO()) } }],
      },
      include: { galpoes: { select: { galpaoId: true } } },
    });
    if (!vinculo) throw new NotFoundException('Fazenda não encontrada');

    const acao = this.reflector.getAllAndOverride<Acao | undefined>(PERMITE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (acao && !pode(vinculo.perfil, acao)) {
      throw new ForbiddenException(
        'Seu perfil nesta fazenda não permite esta ação',
      );
    }

    req.acesso = {
      fazendaId: vinculo.fazendaId,
      usuarioId,
      vinculoId: vinculo.id,
      perfil: vinculo.perfil,
      galpoes: vinculo.galpoes.map((g) => g.galpaoId),
    };
    return true;
  }
}
