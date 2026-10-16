import { Global, Module } from '@nestjs/common';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { EmailService } from '../email/email.service';

@Global()
@Module({
  providers: [AuditoriaService, EmailService],
  exports: [AuditoriaService, EmailService],
})
export class ComumModule {}
