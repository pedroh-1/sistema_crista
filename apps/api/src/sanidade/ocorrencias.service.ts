import { Injectable } from '@nestjs/common';
import {
  dataFimCarencia,
  hojeISO,
  ocorrenciaSchema,
  TIPOS_OCORRENCIA,
} from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { OcorrenciaSanitaria } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  estornoParaResposta,
  LoteContexto,
  paraData,
  paraISO,
} from '../producao/lote-contexto';

type DadosOcorrencia = z.output<typeof ocorrenciaSchema>;

/** Filtros do histórico sanitário (UC09). */
export const filtroHistoricoSchema = z.object({
  de: z.iso.date().optional(),
  ate: z.iso.date().optional(),
  tipo: z.enum(TIPOS_OCORRENCIA).optional(),
  carenciaVigente: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type FiltroHistorico = z.output<typeof filtroHistoricoSchema>;

function comCarencia(o: OcorrenciaSanitaria, hoje: string) {
  const fim =
    o.carenciaDias == null
      ? null
      : dataFimCarencia(paraISO(o.data), o.carenciaDias);
  return { fim, vigente: fim !== null && fim >= hoje };
}

@Injectable()
export class OcorrenciasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly contexto: LoteContexto,
  ) {}

  /** UC08: vacinação e medicação exigem produto, dose, via, lote do produto e carência. */
  async registrar(
    acesso: AcessoFazenda,
    loteId: string,
    dados: DadosOcorrencia,
  ) {
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    this.contexto.validarData(lote, dados.data);
    const ocorrencia = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.ocorrenciaSanitaria.create({
        data: {
          ...dados,
          data: paraData(dados.data),
          fazendaId: acesso.fazendaId,
          loteId,
          criadoPorId: acesso.usuarioId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'ocorrencia',
          idEntidade: criada.id,
          depois: criada,
        },
        tx,
      );
      return criada;
    });
    const carencia = comCarencia(ocorrencia, hojeISO());
    return {
      id: ocorrencia.id,
      data: dados.data,
      tipo: ocorrencia.tipo,
      dataFimCarencia: carencia.fim,
      carenciaVigente: carencia.vigente,
    };
  }

  /** UC09: linha do tempo com filtros e os produtos ainda em carência. */
  async historico(
    acesso: AcessoFazenda,
    loteId: string,
    filtro: FiltroHistorico,
  ) {
    await this.contexto.carregar(acesso, loteId);
    const hoje = hojeISO();
    const ocorrencias = await this.prisma.ocorrenciaSanitaria.findMany({
      where: {
        loteId,
        ...(filtro.tipo && { tipo: filtro.tipo }),
        ...((filtro.de || filtro.ate) && {
          data: {
            ...(filtro.de && { gte: paraData(filtro.de) }),
            ...(filtro.ate && { lte: paraData(filtro.ate) }),
          },
        }),
      },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    const ids = ocorrencias.map((o) => o.id);
    const [estornos, anexos, autores] = await Promise.all([
      this.prisma.estorno.findMany({ where: { idEvento: { in: ids } } }),
      this.prisma.anexo.findMany({
        where: { entidade: 'ocorrencia', idEntidade: { in: ids } },
        select: {
          id: true,
          idEntidade: true,
          nome: true,
          mime: true,
          tamanho: true,
        },
      }),
      this.prisma.usuario.findMany({
        where: {
          id: { in: [...new Set(ocorrencias.map((o) => o.criadoPorId))] },
        },
        select: { id: true, nome: true },
      }),
    ]);
    const estornoPorId = new Map(estornos.map((e) => [e.idEvento, e]));
    const nomes = new Map(autores.map((u) => [u.id, u.nome]));

    const linhas = ocorrencias
      .map((o) => {
        const carencia = comCarencia(o, hoje);
        const estorno = estornoPorId.get(o.id);
        return {
          id: o.id,
          data: paraISO(o.data),
          tipo: o.tipo,
          descricao: o.descricao,
          produto: o.produto,
          dose: o.dose,
          via: o.via,
          loteProduto: o.loteProduto,
          carenciaDias: o.carenciaDias,
          dataFimCarencia: carencia.fim,
          // Ocorrência estornada não gera carência.
          carenciaVigente:
            carencia.vigente && !estorno && o.status === 'valido',
          veterinario: nomes.get(o.criadoPorId) ?? null,
          status: o.status,
          estorno: estornoParaResposta(estorno),
          anexos: anexos
            .filter((a) => a.idEntidade === o.id)
            .map((a) => ({
              id: a.id,
              nome: a.nome,
              mime: a.mime,
              tamanho: a.tamanho,
            })),
        };
      })
      .filter((o) => !filtro.carenciaVigente || o.carenciaVigente);

    return {
      ocorrencias: linhas,
      emCarencia: linhas
        .filter((o) => o.carenciaVigente)
        .map((o) => ({
          produto: o.produto,
          dataFimCarencia: o.dataFimCarencia,
          idOcorrencia: o.id,
        })),
    };
  }
}
