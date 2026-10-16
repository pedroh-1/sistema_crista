import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EmailService } from '../email/email.service';
import { FilaService } from '../fila/fila.service';

@Global()
@Module({
  providers: [AuditoriaService, EmailService, FilaService],
  exports: [AuditoriaService, EmailService, FilaService],
})
export class ComumModule {}
