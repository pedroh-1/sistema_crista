import { Module } from '@nestjs/common';
import { AcessoFazendaGuard } from './acesso-fazenda.guard';
import {
  ConvitesController,
  FazendasController,
  GalpoesController,
  VinculosController,
} from './fazendas.controller';
import { FazendasService } from './fazendas.service';
import { GalpoesService } from './galpoes.service';
import { VinculosService } from './vinculos.service';

@Module({
  controllers: [
    FazendasController,
    GalpoesController,
    VinculosController,
    ConvitesController,
  ],
  providers: [
    FazendasService,
    GalpoesService,
    VinculosService,
    AcessoFazendaGuard,
  ],
  exports: [AcessoFazendaGuard],
})
export class FazendasModule {}
