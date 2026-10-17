import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hojeISO, perfisNotificados } from '@crista/domain';
import { EmailService } from '../email/email.service';
import { FilaService } from '../fila/fila.service';
import { PrismaService } from '../prisma/prisma.service';
import { TAREFA_NOTIFICAR } from '../fila/tarefas';

/**
 * UC16: avisa Gestor e Veterinário de um alerta crítico (ator secundário
 * Serviço de Notificação). Hoje só por e-mail; push e SMS entram na Fase 7.
 */
@Injectable()
export class NotificadorAlertas implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fila: FilaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.fila.registrar(TAREFA_NOTIFICAR, (p) =>
      this.notificar(String(p['alertaId'])),
    );
  }

  async notificar(alertaId: string): Promise<void> {
    const alerta = await this.prisma.alerta.findUnique({
      where: { id: alertaId },
      include: { notificacoes: true },
    });
    if (!alerta || alerta.status !== 'aberto') return;
    const fazenda = await this.prisma.fazenda.findUniqueOrThrow({
      where: { id: alerta.fazendaId },
    });

    const vinculos = await this.prisma.vinculo.findMany({
      where: {
        fazendaId: alerta.fazendaId,
        status: 'ativo',
        perfil: { in: [...perfisNotificados(alerta.indicador)] },
        usuarioId: { not: null },
        OR: [{ validoAte: null }, { validoAte: { gte: new Date(hojeISO()) } }],
      },
      include: { usuario: true, galpoes: true },
    });
    const destinatarios = vinculos.filter(
      (v) =>
        v.galpoes.length === 0 ||
        (alerta.galpaoId &&
          v.galpoes.some((g) => g.galpaoId === alerta.galpaoId)),
    );
    const link = `${this.config.get('WEB_URL')}/fazendas/${alerta.fazendaId}/alertas`;

    let falhas = 0;
    for (const v of destinatarios) {
      if (!v.usuario) continue;
      // Na repetição da tarefa, quem já recebeu não recebe de novo.
      if (
        alerta.notificacoes.some(
          (n) => n.usuarioId === v.usuarioId && n.status === 'enviada',
        )
      )
        continue;
      const notificacao = await this.prisma.notificacao.create({
        data: {
          alertaId,
          usuarioId: v.usuario.id,
          canal: 'email',
          tentativas: 1,
        },
      });
      try {
        await this.email.enviar({
          para: v.usuario.email,
          assunto: `[CRISTA] Alerta crítico na ${fazenda.nome}`,
          texto: `${alerta.mensagem}.\n\nVeja e registre a providência adotada em:\n${link}`,
        });
        await this.prisma.notificacao.update({
          where: { id: notificacao.id },
          data: { status: 'enviada', enviadoEm: new Date() },
        });
      } catch (erro) {
        falhas++;
        await this.prisma.notificacao.update({
          where: { id: notificacao.id },
          data: {
            status: 'falhou',
            erro:
              erro instanceof Error ? erro.message.slice(0, 500) : String(erro),
          },
        });
      }
    }
    // Falha de envio faz a fila tentar de novo mais tarde.
    if (falhas > 0)
      throw new Error(`${falhas} notificação(ões) não enviada(s)`);
  }
}
