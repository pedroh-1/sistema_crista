import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { conviteSchema, hojeISO, NOME_PERFIL } from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DIA_MS, hashToken, novoToken } from '../comum/tokens';
import { EmailService } from '../email/email.service';
import { StatusVinculo, Vinculo } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AcessoFazenda } from './acesso-fazenda.guard';

type DadosConvite = z.output<typeof conviteSchema>;

const VALIDADE_CONVITE_DIAS = 7;

/** O banco guarda pendente/ativo; a expiração é calculada na leitura. */
export function statusEfetivo(
  v: Pick<Vinculo, 'status' | 'conviteExpiraEm' | 'validoAte'>,
  agora = new Date(),
): StatusVinculo {
  if (v.status === 'pendente' && v.conviteExpiraEm && v.conviteExpiraEm < agora)
    return 'expirado';
  if (
    v.status === 'ativo' &&
    v.validoAte &&
    v.validoAte < new Date(hojeISO(undefined, agora))
  )
    return 'expirado';
  return v.status;
}

@Injectable()
export class VinculosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /** UC04: o convite vale por 7 dias. */
  async convidar(acesso: AcessoFazenda, dados: DadosConvite) {
    if (dados.validoAte && dados.validoAte <= hojeISO()) {
      throw new BadRequestException(
        'A validade do acesso precisa ser posterior a hoje',
      );
    }
    if (dados.galpoes.length > 0) {
      const encontrados = await this.prisma.galpao.count({
        where: { id: { in: dados.galpoes }, fazendaId: acesso.fazendaId },
      });
      if (encontrados !== new Set(dados.galpoes).size)
        throw new BadRequestException('Galpão não pertence à fazenda');
    }

    const aberto = await this.prisma.vinculo.findFirst({
      where: {
        fazendaId: acesso.fazendaId,
        emailConvidado: dados.email,
        status: { in: ['pendente', 'ativo'] },
      },
    });
    if (aberto && statusEfetivo(aberto) !== 'expirado') {
      throw new ConflictException(
        aberto.status === 'ativo'
          ? 'Este e-mail já tem acesso à fazenda'
          : 'Já existe um convite pendente para este e-mail',
      );
    }

    const { token, hash } = novoToken();
    const vinculo = await this.prisma.$transaction(async (tx) => {
      if (aberto)
        await tx.vinculo.update({
          where: { id: aberto.id },
          data: { status: 'expirado', hashConvite: null },
        });
      const criado = await tx.vinculo.create({
        data: {
          fazendaId: acesso.fazendaId,
          emailConvidado: dados.email,
          perfil: dados.perfil,
          crmv: dados.crmv,
          validoAte: dados.validoAte ? new Date(dados.validoAte) : null,
          hashConvite: hash,
          conviteExpiraEm: new Date(
            Date.now() + VALIDADE_CONVITE_DIAS * DIA_MS,
          ),
          convidadoPorId: acesso.usuarioId,
          galpoes: { create: dados.galpoes.map((galpaoId) => ({ galpaoId })) },
        },
        include: { fazenda: { select: { nome: true } } },
      });
      // O hash do convite não vai para a auditoria.
      const depois = {
        email: criado.emailConvidado,
        perfil: criado.perfil,
        crmv: criado.crmv,
        validoAte: dados.validoAte ?? null,
        galpoes: dados.galpoes,
      };
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'convidar',
          entidade: 'vinculo',
          idEntidade: criado.id,
          depois,
        },
        tx,
      );
      return criado;
    });

    const link = `${this.config.get('WEB_URL')}/convite?token=${token}`;
    await this.email.enviar({
      para: dados.email,
      assunto: `Convite para a fazenda ${vinculo.fazenda.nome} no CRISTA`,
      texto:
        `Você foi convidado para acessar a fazenda ${vinculo.fazenda.nome} como ${NOME_PERFIL[dados.perfil]}.\n\n` +
        `Para aceitar, abra o link abaixo (válido por ${VALIDADE_CONVITE_DIAS} dias). Se ainda não tem conta, crie uma com este e-mail:\n${link}`,
    });
    return this.paraResposta({
      ...vinculo,
      galpoes: dados.galpoes.map((galpaoId) => ({ galpaoId })),
      usuario: null,
    });
  }

  async listar(acesso: AcessoFazenda) {
    const vinculos = await this.prisma.vinculo.findMany({
      where: { fazendaId: acesso.fazendaId },
      include: {
        galpoes: { select: { galpaoId: true } },
        usuario: { select: { nome: true } },
      },
      orderBy: { criadoEm: 'asc' },
    });
    return vinculos.map((v) => this.paraResposta(v));
  }

  async revogar(acesso: AcessoFazenda, vinculoId: string) {
    const vinculo = z.uuid().safeParse(vinculoId).success
      ? await this.prisma.vinculo.findFirst({
          where: { id: vinculoId, fazendaId: acesso.fazendaId },
        })
      : null;
    if (!vinculo) throw new NotFoundException('Vínculo não encontrado');
    if (vinculo.status === 'revogado')
      throw new ConflictException('Vínculo já revogado');

    if (vinculo.perfil === 'gestor' && vinculo.status === 'ativo') {
      const gestores = await this.prisma.vinculo.count({
        where: {
          fazendaId: acesso.fazendaId,
          perfil: 'gestor',
          status: 'ativo',
        },
      });
      if (gestores <= 1)
        throw new ConflictException(
          'A fazenda precisa de pelo menos um Gestor',
        );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vinculo.update({
        where: { id: vinculo.id },
        data: { status: 'revogado', revogadoEm: new Date(), hashConvite: null },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'revogar',
          entidade: 'vinculo',
          idEntidade: vinculo.id,
          antes: { status: vinculo.status },
        },
        tx,
      );
    });
  }

  /** Dados públicos do convite, para a tela de aceite antes do login. */
  async consultarConvite(token: string) {
    const vinculo = await this.prisma.vinculo.findUnique({
      where: { hashConvite: hashToken(token) },
      include: { fazenda: { select: { nome: true } } },
    });
    if (!vinculo || vinculo.status !== 'pendente')
      throw new NotFoundException('Convite não encontrado');
    return {
      fazenda: vinculo.fazenda.nome,
      perfil: vinculo.perfil,
      email: vinculo.emailConvidado,
      expirado: statusEfetivo(vinculo) === 'expirado',
    };
  }

  async aceitar(usuarioId: string, token: string) {
    const vinculo = await this.prisma.vinculo.findUnique({
      where: { hashConvite: hashToken(token) },
      include: { fazenda: { select: { id: true, nome: true } } },
    });
    if (!vinculo || vinculo.status !== 'pendente')
      throw new NotFoundException('Convite não encontrado');
    if (statusEfetivo(vinculo) === 'expirado') {
      await this.prisma.vinculo.update({
        where: { id: vinculo.id },
        data: { status: 'expirado', hashConvite: null },
      });
      throw new BadRequestException(
        'Convite expirado. Peça um novo ao Gestor da fazenda.',
      );
    }
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });
    if (usuario.email !== vinculo.emailConvidado) {
      throw new ForbiddenException(
        'Este convite foi enviado para outro e-mail',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vinculo.update({
        where: { id: vinculo.id },
        data: {
          status: 'ativo',
          usuarioId,
          aceitoEm: new Date(),
          hashConvite: null,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: vinculo.fazendaId,
          usuarioId,
          acao: 'aceitar',
          entidade: 'vinculo',
          idEntidade: vinculo.id,
          depois: { status: 'ativo' },
        },
        tx,
      );
    });
    return {
      id: vinculo.fazenda.id,
      nome: vinculo.fazenda.nome,
      perfil: vinculo.perfil,
    };
  }

  private paraResposta(
    v: Vinculo & {
      galpoes: { galpaoId: string }[];
      usuario: { nome: string } | null;
    },
  ) {
    return {
      id: v.id,
      email: v.emailConvidado,
      nome: v.usuario?.nome ?? null,
      perfil: v.perfil,
      crmv: v.crmv,
      galpoes: v.galpoes.map((g) => g.galpaoId),
      validoAte: v.validoAte?.toISOString().slice(0, 10) ?? null,
      status: statusEfetivo(v),
      conviteExpiraEm: v.conviteExpiraEm,
      criadoEm: v.criadoEm,
    };
  }
}
