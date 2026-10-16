import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ocorrenciaSchema } from '@crista/domain';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import {
  Acesso,
  AcessoFazenda,
  AcessoFazendaGuard,
  Permite,
} from '../fazendas/acesso-fazenda.guard';
import {
  FiltroHistorico,
  filtroHistoricoSchema,
  OcorrenciasService,
} from './ocorrencias.service';

@Controller('fazendas/:idFazenda/lotes/:idLote/ocorrencias')
@UseGuards(AcessoFazendaGuard)
export class SanidadeController {
  constructor(private readonly ocorrencias: OcorrenciasService) {}

  @Post()
  @Permite('sanidade.registrar')
  registrar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(ocorrenciaSchema))
    dados: z.output<typeof ocorrenciaSchema>,
  ) {
    return this.ocorrencias.registrar(acesso, idLote, dados);
  }

  @Get()
  historico(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Query(new ZodPipe(filtroHistoricoSchema)) filtro: FiltroHistorico,
  ) {
    return this.ocorrencias.historico(acesso, idLote, filtro);
  }
}
