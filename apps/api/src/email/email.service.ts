import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';

export interface Mensagem {
  para: string;
  assunto: string;
  texto: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporte?: Transporter;
  private readonly remetente: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.remetente =
      config.get<string>('EMAIL_REMETENTE') ??
      'CRISTA <nao-responda@crista.local>';
    if (host) {
      this.transporte = createTransport({
        host,
        port: Number(config.get('SMTP_PORT') ?? 1025),
      });
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
