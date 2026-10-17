import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  conviteSchema,
  edicaoFazendaSchema,
  edicaoGalpaoSchema,
  fazendaSchema,
  galpaoSchema,
  NovoGalpao,
  tokenSchema,
} from '@crista/domain';
import { z } from 'zod';
import { Publico, UsuarioAtual, UsuarioAutenticado } from '../auth/auth.guard';
import { LimiteDeConta } from '../comum/limites';
import { ZodPipe } from '../comum/zod.pipe';
import {
  Acesso,
  AcessoFazenda,
  AcessoFazendaGuard,
  Permite,
} from './acesso-fazenda.guard';
import { FazendasService } from './fazendas.service';
import { GalpoesService } from './galpoes.service';
import { VinculosService } from './vinculos.service';

@Controller('fazendas')
export class FazendasController {
  constructor(private readonly fazendas: FazendasService) {}

  @Post()
  criar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodPipe(fazendaSchema)) dados: z.output<typeof fazendaSchema>,
  ) {
    return this.fazendas.criar(usuario.id, dados);
  }

  @Get()
  listar(@UsuarioAtual() usuario: UsuarioAutenticado) {
    return this.fazendas.listar(usuario.id);
  }

  @Get(':idFazenda')
  @UseGuards(AcessoFazendaGuard)
  obter(@Acesso() acesso: AcessoFazenda) {
    return this.fazendas.obter(acesso);
  }

  @Patch(':idFazenda')
  @UseGuards(AcessoFazendaGuard)
  @Permite('fazenda.editar')
  editar(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(edicaoFazendaSchema))
    dados: z.output<typeof edicaoFazendaSchema>,
  ) {
    return this.fazendas.editar(acesso, dados);
  }
}

@Controller('fazendas/:idFazenda/galpoes')
@UseGuards(AcessoFazendaGuard)
export class GalpoesController {
  constructor(private readonly galpoes: GalpoesService) {}

  @Post()
  @Permite('galpao.editar')
  criar(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(galpaoSchema)) dados: NovoGalpao,
  ) {
    return this.galpoes.criar(acesso, dados);
  }

  @Get()
  listar(@Acesso() acesso: AcessoFazenda) {
    return this.galpoes.listar(acesso);
  }

  @Get(':idGalpao')
  obter(@Acesso() acesso: AcessoFazenda, @Param('idGalpao') idGalpao: string) {
    return this.galpoes.obter(acesso, idGalpao);
  }

  @Patch(':idGalpao')
  @Permite('galpao.editar')
  editar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idGalpao') idGalpao: string,
    @Body(new ZodPipe(edicaoGalpaoSchema))
    dados: z.output<typeof edicaoGalpaoSchema>,
  ) {
    return this.galpoes.editar(acesso, idGalpao, dados);
  }
}

@Controller('fazendas/:idFazenda/vinculos')
@UseGuards(AcessoFazendaGuard)
@Permite('vinculo.gerenciar')
export class VinculosController {
  constructor(private readonly vinculos: VinculosService) {}

  @Post()
  convidar(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(conviteSchema)) dados: z.output<typeof conviteSchema>,
  ) {
    return this.vinculos.convidar(acesso, dados);
  }

  @Get()
  listar(@Acesso() acesso: AcessoFazenda) {
    return this.vinculos.listar(acesso);
  }

  @Post(':idVinculo/revogar')
  @HttpCode(204)
  revogar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idVinculo') idVinculo: string,
  ) {
    return this.vinculos.revogar(acesso, idVinculo);
  }
}

@Controller('convites')
export class ConvitesController {
  constructor(private readonly vinculos: VinculosService) {}

  @Publico()
  @LimiteDeConta()
  @Post('consultar')
  @HttpCode(200)
  consultar(@Body(new ZodPipe(tokenSchema)) { token }: { token: string }) {
    return this.vinculos.consultarConvite(token);
  }

  @Post('aceitar')
  @HttpCode(200)
  aceitar(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Body(new ZodPipe(tokenSchema)) { token }: { token: string },
  ) {
    return this.vinculos.aceitar(usuario.id, token);
  }
}
