import { Module } from '@nestjs/common';
import { AnexosController } from '../anexos/anexos.controller';
import { AnexosService } from '../anexos/anexos.service';
import { armazenamentoProvider } from '../anexos/armazenamento';
import { CustosController } from '../custos/custos.controller';
import { DespesasService } from '../custos/despesas.service';
import { PainelService } from '../custos/painel.service';
import { VisoesService } from '../custos/visoes.service';
import { SanidadeController } from '../sanidade/sanidade.controller';
import { OcorrenciasService } from '../sanidade/ocorrencias.service';
import { DadosLote } from './dados-lote';
import { EncerramentoService } from './encerramento.service';
import { RelatorioService } from './relatorio.service';
import { EventosService } from './eventos.service';
import { LoteContexto } from './lote-contexto';
import { LotesService } from './lotes.service';
import {
  LotesController,
  ResumoFazendaController,
} from './producao.controller';
import { ResumoFazendaService } from './resumo-fazenda.service';

/** Ciclo produtivo (UC05 a UC10), sanidade, anexos, custos e painel (UC11 a UC15). */
@Module({
  controllers: [
    LotesController,
    SanidadeController,
    AnexosController,
    CustosController,
    ResumoFazendaController,
  ],
  providers: [
    LoteContexto,
    LotesService,
    EventosService,
    OcorrenciasService,
    AnexosService,
    armazenamentoProvider,
    DadosLote,
    EncerramentoService,
    RelatorioService,
    DespesasService,
    PainelService,
    VisoesService,
    ResumoFazendaService,
  ],
  exports: [DadosLote, LoteContexto, DespesasService],
})
export class ProducaoModule {}
