import { Injectable, OnModuleInit } from '@nestjs/common';
import { hojeISO, horasParado } from '@crista/domain';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { FilaService } from '../fila/fila.service';
import { TAREFA_AVALIAR_EQUIPAMENTO, TAREFA_NOTIFICAR } from '../fila/tarefas';
import { PrismaService } from '../prisma/prisma.service';
import { paraData } from '../producao/lote-contexto';

const FUSO = 'America/Sao_Paulo';
const dataHora = (d: Date) =>
  d.toLocaleString('pt-BR', {
    timeZone: FUSO,
    dateStyle: 'short',
    timeStyle: 'short',
  });

/**
 * UC16 + UC19: equipamento crítico com parada sem retorno abre um alerta
 * crítico (notificado); o retorno, o estorno da manutenção ou o fim da
 * condição de crítico fecha o alerta pelo sistema. Roda pela fila.
 */
@Injectable()
export class AvaliadorEquipamento implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fila: FilaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  onModuleInit(): void {
    this.fila.registrar(TAREFA_AVALIAR_EQUIPAMENTO, (p) =>
      this.avaliar(String(p['equipamentoId'])),
    );
  }

  async avaliar(equipamentoId: string): Promise<void> {
    const equipamento = await this.prisma.equipamento.findUnique({
      where: { id: equipamentoId },
      include: { galpao: { select: { identificacao: true } } },
    });
    if (!equipamento) return;
    const estornadas = await this.prisma.estorno.findMany({
      where: { fazendaId: equipamento.fazendaId, entidade: 'manutencao' },
      select: { idEvento: true },
    });
    const parada = await this.prisma.manutencao.findFirst({
      where: {
        equipamentoId,
        paradaInicio: { not: null },
        retornoOperacao: null,
        id: { notIn: estornadas.map((e) => e.idEvento) },
      },
      orderBy: { paradaInicio: 'asc' },
    });
    const ativo = equipamento.critico && equipamento.situacao === 'ativo';

    await this.prisma.$transaction(async (tx) => {
      const aberto = await tx.alerta.findFirst({
        where: {
          equipamentoId,
          indicador: 'equipamento_parado',
          status: 'aberto',
        },
      });

      if (ativo && parada?.paradaInicio) {
        const local = equipamento.galpao
          ? `galpão ${equipamento.galpao.identificacao}`
          : 'fazenda';
        const dados = {
          galpaoId: equipamento.galpaoId,
          valor: horasParado(parada.paradaInicio, new Date()),
          dataReferencia: paraData(hojeISO(FUSO, parada.paradaInicio)),
          mensagem: `Equipamento crítico "${equipamento.nome}" (${local}) parado desde ${dataHora(parada.paradaInicio)}`,
        };
        if (aberto) {
          await tx.alerta.update({ where: { id: aberto.id }, data: dados });
          return;
        }
        const alerta = await tx.alerta.create({
          data: {
            ...dados,
            fazendaId: equipamento.fazendaId,
            equipamentoId,
            indicador: 'equipamento_parado',
            criticidade: 'critico',
            limite: 0,
            limitePadrao: false,
          },
        });
        await this.fila.enfileirar(tx, TAREFA_NOTIFICAR, {
          alertaId: alerta.id,
        });
        return;
      }

      if (!aberto) return;
      const providencia = !equipamento.critico
        ? 'Equipamento deixou de ser crítico'
        : equipamento.situacao === 'inativo'
          ? 'Equipamento inativado'
          : 'Retorno à operação registrado na manutenção';
      await tx.alerta.update({
        where: { id: aberto.id },
        data: { status: 'fechado', fechadoEm: new Date(), providencia },
      });
      await this.auditoria.registrar(
        {
          fazendaId: equipamento.fazendaId,
          acao: 'fechar',
          entidade: 'alerta',
          idEntidade: aberto.id,
          depois: { providencia, pelo: 'sistema' },
        },
        tx,
      );
    });
  }
}
