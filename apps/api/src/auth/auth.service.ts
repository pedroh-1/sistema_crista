import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { CadastroUsuario, hojeISO, Login } from '@crista/domain';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DIA_MS, hashToken, novoToken } from '../comum/tokens';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  /** UC01: a conta nasce pendente e ativa ao confirmar o e-mail. */
  async cadastrar(dados: CadastroUsuario, ip?: string) {
    if (
      await this.prisma.usuario.findUnique({ where: { email: dados.email } })
    ) {
      throw new ConflictException('Já existe uma conta com este e-mail');
    }
    if (
      dados.cpf &&
      (await this.prisma.usuario.findUnique({ where: { cpf: dados.cpf } }))
    ) {
      throw new ConflictException('Já existe uma conta com este CPF');
    }

    const senhaHash = await hash(dados.senha);
    const { token, hash: hashVerificacao } = novoToken();

    const usuario = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.usuario.create({
        data: {
          nome: dados.nome,
          email: dados.email,
          telefone: dados.telefone,
          cpf: dados.cpf,
          senhaHash,
        },
      });
      await tx.aceiteTermos.create({
        data: {
          usuarioId: criado.id,
          versaoTermos: this.config.get('TERMOS_VERSAO') ?? 'sem-versao',
          ip,
        },
      });
      await tx.tokenVerificacao.create({
        data: {
          usuarioId: criado.id,
          tipo: 'email',
          hashToken: hashVerificacao,
          expiraEm: new Date(Date.now() + DIA_MS),
        },
      });
      await this.auditoria.registrar(
        {
          usuarioId: criado.id,
          acao: 'criar',
          entidade: 'usuario',
          idEntidade: criado.id,
          depois: { email: criado.email },
        },
        tx,
      );
      return criado;
    });

    await this.enviarVerificacao(usuario.email, usuario.nome, token);
    return { id: usuario.id, email: usuario.email, status: usuario.status };
  }

  async verificarEmail(token: string) {
    const registro = await this.prisma.tokenVerificacao.findUnique({
      where: { hashToken: hashToken(token) },
    });
    if (
      !registro ||
      registro.tipo !== 'email' ||
      registro.usadoEm ||
      registro.expiraEm < new Date()
    ) {
      throw new BadRequestException(
        'Link inválido ou expirado. Peça um novo e-mail de confirmação.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.tokenVerificacao.update({
        where: { id: registro.id },
        data: { usadoEm: new Date() },
      }),
      this.prisma.usuario.update({
        where: { id: registro.usuarioId },
        data: { status: 'ativo', emailVerificadoEm: new Date() },
      }),
    ]);
  }

  /** Sempre responde igual, para não revelar quais e-mails têm conta. */
  async reenviarVerificacao(email: string) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario || usuario.status !== 'pendente') return;
    const { token, hash: hashVerificacao } = novoToken();
    await this.prisma.tokenVerificacao.create({
      data: {
        usuarioId: usuario.id,
        tipo: 'email',
        hashToken: hashVerificacao,
        expiraEm: new Date(Date.now() + DIA_MS),
      },
    });
    await this.enviarVerificacao(usuario.email, usuario.nome, token);
  }

  async login({ email, senha }: Login) {
    const usuario = await this.prisma.usuario.findUnique({ where: { email } });
    if (!usuario || !(await verify(usuario.senhaHash, senha))) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }
    if (usuario.status !== 'ativo') {
      throw new ForbiddenException('Confirme seu e-mail antes de entrar');
    }
    const accessToken = await this.jwt.signAsync({
      sub: usuario.id,
      email: usuario.email,
    });
    return {
      accessToken,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    };
  }

  /** Dados do usuário logado e as fazendas a que ele tem acesso. */
  async eu(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
    });
    const vinculos = await this.prisma.vinculo.findMany({
      where: {
        usuarioId,
        status: 'ativo',
        OR: [{ validoAte: null }, { validoAte: { gte: new Date(hojeISO()) } }],
      },
      include: { fazenda: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: 'asc' },
    });
    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      fazendas: vinculos.map((v) => ({
        id: v.fazenda.id,
        nome: v.fazenda.nome,
        perfil: v.perfil,
      })),
    };
  }

  private enviarVerificacao(para: string, nome: string, token: string) {
    const link = `${this.config.get('WEB_URL')}/verificar-email?token=${token}`;
    return this.email.enviar({
      para,
      assunto: 'Confirme seu e-mail no CRISTA',
      texto: `Olá, ${nome}.\n\nPara ativar sua conta, abra o link abaixo (válido por 24 horas):\n${link}`,
    });
  }
}
