import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client';

/**
 * Rede de segurança para violações de unicidade que escaparem das checagens
 * dos serviços (por exemplo, duas requisições simultâneas).
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaErrosFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  override catch(
    erro: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    if (erro.code === 'P2002') {
      super.catch(new ConflictException('Registro duplicado'), host);
      return;
    }
    super.catch(erro, host);
  }
}
