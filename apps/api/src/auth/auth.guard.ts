import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface UsuarioAutenticado {
  id: string;
  email: string;
}

declare module 'express' {
  interface Request {
    usuario?: UsuarioAutenticado;
  }
}

const PUBLICO = 'publico';

/** Rota acessível sem login. */
export const Publico = () => SetMetadata(PUBLICO, true);

export const UsuarioAtual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const usuario = ctx.switchToHttp().getRequest<Request>().usuario;
    if (!usuario) throw new UnauthorizedException();
    return usuario;
  },
);

/** Guard global: toda rota exige login, menos as marcadas com @Publico(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publico = this.reflector.getAllAndOverride<boolean>(PUBLICO, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publico) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const [tipo, token] = req.headers.authorization?.split(' ') ?? [];
    if (tipo !== 'Bearer' || !token)
      throw new UnauthorizedException('Faça login para continuar');

    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
      }>(token);
      req.usuario = { id: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException('Sessão expirada; faça login novamente');
    }
    return true;
  }
}
