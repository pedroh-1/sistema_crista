import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  fecharAlertaSchema,
  INDICADORES_DO_LOTE,
  NovaRegraAlerta,
  regraAlertaSchema,
} from '@crista/domain';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import {
  Acesso,
  AcessoFazenda,
  AcessoFazendaGuard,
  Permite,
} from '../fazendas/acesso-fazenda.guard';
import { AlertasService, filtroAlertasSchema } from './alertas.service';

const indicadorSchema = z.enum(INDICADORES_DO_LOTE);

@Controller('fazendas/:idFazenda')
@UseGuards(AcessoFazendaGuard)
export class AlertasController {
  constructor(private readonly alertas: AlertasService) {}

  @Get('alertas')
  listar(
    @Acesso() acesso: AcessoFazenda,
    @Query(new ZodPipe(filtroAlertasSchema))
    filtro: z.output<typeof filtroAlertasSchema>,
  ) {
    return this.alertas.listar(acesso, filtro);
  }

  @Post('alertas/:idAlerta/fechar')
  @Permite('alerta.fechar')
  @HttpCode(204)
  fechar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idAlerta') idAlerta: string,
    @Body(new ZodPipe(fecharAlertaSchema))
    { providencia }: { providencia: string },
  ) {
    return this.alertas.fechar(acesso, idAlerta, providencia);
  }

  @Get('regras-alerta')
  regras(@Acesso() acesso: AcessoFazenda) {
    return this.alertas.regras(acesso);
  }

  @Put('regras-alerta')
  @Permite('alerta.configurar')
  salvar(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(regraAlertaSchema)) dados: NovaRegraAlerta,
  ) {
    return this.alertas.salvarRegra(acesso, dados);
  }

  @Delete('regras-alerta/:indicador')
  @Permite('alerta.configurar')
  restaurar(
    @Acesso() acesso: AcessoFazenda,
    @Param('indicador', new ZodPipe(indicadorSchema))
    indicador: z.output<typeof indicadorSchema>,
  ) {
    return this.alertas.restaurarPadrao(acesso, indicador);
  }
}
