import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface Mensagem {
  para: string;
  assunto: string;
  texto: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporte?: Transporter;
  private readonly remetente: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.remetente =
      config.get<string>('EMAIL_REMETENTE') ??
      'CRISTA <nao-responda@crista.local>';
    if (host) {
      const usuario = config.get<string>('SMTP_USUARIO');
      this.transporte = createTransport({
        host,
        port: Number(config.get('SMTP_PORT') ?? 1025),
        // true na porta 465 (TLS direto); nas outras, o STARTTLS é negociado.
        secure: config.get('SMTP_SEGURO') === 'true',
        ...(usuario && {
          auth: { user: usuario, pass: config.get<string>('SMTP_SENHA') },
        }),
      });
    }
  }

  /**
   * Confere a conexão com o SMTP na subida. Só avisa no log: um SMTP fora do
   * ar não pode derrubar a API, e as notificações têm nova tentativa pela fila.
   */
  async onModuleInit(): Promise<void> {
    if (!this.transporte) return;
    try {
      await this.transporte.verify();
      this.logger.log('Servidor de e-mail conectado');
    } catch (erro) {
      this.logger.error(
        `Não foi possível conectar ao servidor de e-mail: ${(erro as Error).message}`,
      );
    }
  }

  async enviar(msg: Mensagem): Promise<void> {
    if (!this.transporte) {
      // Desenvolvimento sem SMTP: o e-mail vai para o log.
      this.logger.log(`E-mail para ${msg.para} | ${msg.assunto}\n${msg.texto}`);
      return;
    }
    await this.transporte.sendMail({
      from: this.remetente,
      to: msg.para,
      subject: msg.assunto,
      text: msg.texto,
    });
  }
}
