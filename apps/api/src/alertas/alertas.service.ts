import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CONFIG_INDICADOR,
  INDICADORES_DO_LOTE,
  IndicadorDoLote,
  NovaRegraAlerta,
} from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { Alerta } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paraISO } from '../producao/lote-contexto';

export const filtroAlertasSchema = z.object({
  status: z.enum(['aberto', 'fechado']).optional(),
  lote: z.uuid().optional(),
});

@Injectable()
export class AlertasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(
    acesso: AcessoFazenda,
    filtro: z.output<typeof filtroAlertasSchema>,
  ) {
    const alertas = await this.prisma.alerta.findMany({
      where: {
        fazendaId: acesso.fazendaId,
        ...(filtro.status && { status: filtro.status }),
        ...(filtro.lote && { loteId: filtro.lote }),
        // Alerta sem galpão (equipamento da fazenda) é visto por todos.
        ...(acesso.galpoes.length > 0 && {
          OR: [{ galpaoId: null }, { galpaoId: { in: acesso.galpoes } }],
        }),
      },
      orderBy: [
        { status: 'asc' },
        { criticidade: 'desc' },
        { atualizadoEm: 'desc' },
      ],
      take: 200,
    });
    const lotes = await this.prisma.lote.findMany({
      where: {
        id: {
          in: alertas
            .map((a) => a.loteId)
            .filter((id): id is string => id !== null),
        },
      },
      select: { id: true, codigo: true },
    });
    const codigo = new Map(lotes.map((l) => [l.id, l.codigo]));
    const nomes = await this.nomes(alertas.map((a) => a.fechadoPorId));
    return alertas.map((a) => this.paraResposta(a, codigo, nomes));
  }

  /** UC16: fechar exige a providência adotada. */
  async fechar(acesso: AcessoFazenda, alertaId: string, providencia: string) {
    const alerta = z.uuid().safeParse(alertaId).success
      ? await this.prisma.alerta.findFirst({
          where: { id: alertaId, fazendaId: acesso.fazendaId },
        })
      : null;
    if (
      !alerta ||
      (alerta.galpaoId &&
        acesso.galpoes.length > 0 &&
        !acesso.galpoes.includes(alerta.galpaoId))
    ) {
      throw new NotFoundException('Alerta não encontrado');
    }
    if (alerta.status === 'fechado')
      throw new ConflictException('Alerta já fechado');
    await this.prisma.$transaction(async (tx) => {
      await tx.alerta.update({
        where: { id: alertaId },
        data: {
          status: 'fechado',
          fechadoEm: new Date(),
          fechadoPorId: acesso.usuarioId,
          providencia,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'fechar',
          entidade: 'alerta',
          idEntidade: alertaId,
          depois: { providencia },
        },
        tx,
      );
    });
  }

  /** Limites de cada indicador: o configurado pela fazenda ou o padrão (sinalizado). */
  async regras(acesso: AcessoFazenda) {
    const regras = await this.prisma.regraAlerta.findMany({
      where: { fazendaId: acesso.fazendaId },
    });
    return INDICADORES_DO_LOTE.map((indicador) => {
      const cfg = CONFIG_INDICADOR[indicador];
      const regra = regras.find((r) => r.indicador === indicador);
      return {
        indicador,
        nome: cfg.nome,
        unidade: cfg.unidade,
        direcao: cfg.direcao,
        padrao: cfg.padrao,
        configurado: regra
          ? {
              atencao: Number(regra.limiteAtencao),
              critico: Number(regra.limiteCritico),
            }
          : null,
      };
    });
  }

  async salvarRegra(acesso: AcessoFazenda, dados: NovaRegraAlerta) {
    const antes = await this.prisma.regraAlerta.findUnique({
      where: {
        fazendaId_indicador: {
          fazendaId: acesso.fazendaId,
          indicador: dados.indicador,
        },
      },
    });
    await this.prisma.$transaction(async (tx) => {
      const regra = await tx.regraAlerta.upsert({
        where: {
          fazendaId_indicador: {
            fazendaId: acesso.fazendaId,
            indicador: dados.indicador,
          },
        },
        create: {
          fazendaId: acesso.fazendaId,
          ...dados,
          atualizadoPorId: acesso.usuarioId,
        },
        update: {
          limiteAtencao: dados.limiteAtencao,
          limiteCritico: dados.limiteCritico,
          atualizadoPorId: acesso.usuarioId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'configurar',
          entidade: 'regra_alerta',
          idEntidade: regra.id,
          antes,
          depois: regra,
        },
        tx,
      );
    });
    return this.regras(acesso);
  }

  /** Volta ao limite padrão do indicador. */
  async restaurarPadrao(acesso: AcessoFazenda, indicador: IndicadorDoLote) {
    const regra = await this.prisma.regraAlerta.findUnique({
      where: {
        fazendaId_indicador: { fazendaId: acesso.fazendaId, indicador },
      },
    });
    if (regra) {
      await this.prisma.$transaction(async (tx) => {
        await tx.regraAlerta.delete({ where: { id: regra.id } });
        await this.auditoria.registrar(
          {
            fazendaId: acesso.fazendaId,
            usuarioId: acesso.usuarioId,
            acao: 'restaurar_padrao',
            entidade: 'regra_alerta',
            idEntidade: regra.id,
            antes: regra,
          },
          tx,
        );
      });
    }
    return this.regras(acesso);
  }

  private paraResposta(
    a: Alerta,
    codigo: Map<string, string>,
    nomes: Map<string, string>,
  ) {
    return {
      id: a.id,
      indicador: a.indicador,
      criticidade: a.criticidade,
      status: a.status,
      valor: Number(a.valor),
      limite: Number(a.limite),
      limitePadrao: a.limitePadrao,
      mensagem: a.mensagem,
      loteId: a.loteId,
      lote: a.loteId ? (codigo.get(a.loteId) ?? null) : null,
      equipamentoId: a.equipamentoId,
      dataReferencia: paraISO(a.dataReferencia),
      abertoEm: a.abertoEm,
      atualizadoEm: a.atualizadoEm,
      fechadoEm: a.fechadoEm,
      fechadoPor: a.fechadoPorId ? (nomes.get(a.fechadoPorId) ?? null) : null,
      providencia: a.providencia,
    };
  }

  private async nomes(ids: (string | null)[]) {
    const validos = [...new Set(ids.filter((id): id is string => id !== null))];
    const usuarios = await this.prisma.usuario.findMany({
      where: { id: { in: validos } },
      select: { id: true, nome: true },
    });
    return new Map(usuarios.map((u) => [u.id, u.nome]));
  }
}
