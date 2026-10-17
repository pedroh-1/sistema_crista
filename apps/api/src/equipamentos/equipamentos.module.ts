import { Module } from '@nestjs/common';
import { ProducaoModule } from '../producao/producao.module';
import { EquipamentosController } from './equipamentos.controller';
import { EquipamentosService } from './equipamentos.service';
import { ManutencoesService } from './manutencoes.service';

/** UC18 e UC19: equipamentos e manutenção. O custo vira despesa (módulo de custos). */
@Module({
  imports: [ProducaoModule],
  controllers: [EquipamentosController],
  providers: [EquipamentosService, ManutencoesService],
})
export class EquipamentosModule {}
