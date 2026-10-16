import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface Evento {
  fazendaId?: string | null;
  usuarioId?: string | null;
  acao: string;
  entidade: string;
  idEntidade: string;
  antes?: object | null;
  depois?: object | null;
}

const json = (v: object | null | undefined) =>
  v == null
    ? Prisma.DbNull
    : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Grava o evento na mesma transação da alteração, quando houver uma. */
  registrar(evento: Evento, tx: Prisma.TransactionClient = this.prisma) {
    return tx.eventoAuditoria.create({
      data: {
        ...evento,
        antes: json(evento.antes),
        depois: json(evento.depois),
      },
    });
  }
}
