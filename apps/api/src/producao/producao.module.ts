import { Module } from '@nestjs/common';
import { AnexosController } from '../anexos/anexos.controller';
import { AnexosService } from '../anexos/anexos.service';
import { Armazenamento } from '../anexos/armazenamento';
import { CustosController } from '../custos/custos.controller';
import { DespesasService } from '../custos/despesas.service';
import { PainelService } from '../custos/painel.service';
import { SanidadeController } from '../sanidade/sanidade.controller';
import { OcorrenciasService } from '../sanidade/ocorrencias.service';
import { DadosLote } from './dados-lote';
import { EncerramentoService } from './encerramento.service';
import { RelatorioService } from './relatorio.service';
import { EventosService } from './eventos.service';
import { LoteContexto } from './lote-contexto';
import { LotesService } from './lotes.service';
import { LotesController } from './producao.controller';

/** Ciclo produtivo (UC05 a UC10), sanidade, anexos, custos e painel (UC11 a UC15). */
@Module({
  controllers: [
    LotesController,
    SanidadeController,
    AnexosController,
    CustosController,
  ],
  providers: [
    LoteContexto,
    LotesService,
    EventosService,
    OcorrenciasService,
    AnexosService,
    Armazenamento,
    DadosLote,
    EncerramentoService,
    RelatorioService,
    DespesasService,
    PainelService,
  ],
  exports: [DadosLote, LoteContexto],
})
export class ProducaoModule {}
