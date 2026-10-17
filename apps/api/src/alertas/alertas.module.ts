import { Module } from '@nestjs/common';
import { ProducaoModule } from '../producao/producao.module';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';
import { AvaliadorEquipamento } from './avaliador-equipamento.service';
import { AvaliadorAlertas } from './avaliador.service';
import { NotificadorAlertas } from './notificador.service';

/** UC16: alertas de desvio, avaliados e notificados pela fila. */
@Module({
  imports: [ProducaoModule],
  controllers: [AlertasController],
  providers: [
    AlertasService,
    AvaliadorAlertas,
    AvaliadorEquipamento,
    NotificadorAlertas,
  ],
})
export class AlertasModule {}
