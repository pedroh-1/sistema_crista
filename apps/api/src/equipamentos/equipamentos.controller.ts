import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  edicaoEquipamentoSchema,
  equipamentoSchema,
  estornoSchema,
  manutencaoSchema,
  retornoOperacaoSchema,
} from '@crista/domain';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import {
  Acesso,
  AcessoFazenda,
  AcessoFazendaGuard,
  Permite,
} from '../fazendas/acesso-fazenda.guard';
import { EquipamentosService } from './equipamentos.service';
import { ManutencoesService } from './manutencoes.service';

@Controller('fazendas/:idFazenda/equipamentos')
@UseGuards(AcessoFazendaGuard)
export class EquipamentosController {
  constructor(
    private readonly equipamentos: EquipamentosService,
    private readonly manutencoes: ManutencoesService,
  ) {}

  // ---------- UC18 ----------

  @Post()
  @Permite('equipamento.cadastrar')
  criar(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(equipamentoSchema))
    dados: z.output<typeof equipamentoSchema>,
  ) {
    return this.equipamentos.criar(acesso, dados);
  }

  @Get()
  listar(@Acesso() acesso: AcessoFazenda) {
    return this.equipamentos.listar(acesso);
  }

  @Get(':idEquipamento')
  obter(
    @Acesso() acesso: AcessoFazenda,
    @Param('idEquipamento') idEquipamento: string,
  ) {
    return this.equipamentos.obter(acesso, idEquipamento);
  }

  @Put(':idEquipamento')
  @Permite('equipamento.cadastrar')
  editar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idEquipamento') idEquipamento: string,
    @Body(new ZodPipe(edicaoEquipamentoSchema))
    dados: z.output<typeof edicaoEquipamentoSchema>,
  ) {
    return this.equipamentos.editar(acesso, idEquipamento, dados);
  }

  // ---------- UC19 ----------

  @Post(':idEquipamento/manutencoes')
  @Permite('manutencao.registrar')
  registrarManutencao(
    @Acesso() acesso: AcessoFazenda,
    @Param('idEquipamento') idEquipamento: string,
    @Body(new ZodPipe(manutencaoSchema))
    dados: z.output<typeof manutencaoSchema>,
  ) {
    return this.manutencoes.registrar(acesso, idEquipamento, dados);
  }

  @Get(':idEquipamento/manutencoes')
  listarManutencoes(
    @Acesso() acesso: AcessoFazenda,
    @Param('idEquipamento') idEquipamento: string,
  ) {
    return this.manutencoes.listar(acesso, idEquipamento);
  }

  @Post(':idEquipamento/manutencoes/:idManutencao/retorno')
  @Permite('manutencao.registrar')
  @HttpCode(204)
  registrarRetorno(
    @Acesso() acesso: AcessoFazenda,
    @Param('idEquipamento') idEquipamento: string,
    @Param('idManutencao') idManutencao: string,
    @Body(new ZodPipe(retornoOperacaoSchema))
    { retornoOperacao }: z.output<typeof retornoOperacaoSchema>,
  ) {
    return this.manutencoes.registrarRetorno(
      acesso,
      idEquipamento,
      idManutencao,
      retornoOperacao,
    );
  }

  @Post(':idEquipamento/manutencoes/:idManutencao/estornar')
  @Permite('manutencao.registrar')
  @HttpCode(204)
  estornar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idEquipamento') idEquipamento: string,
    @Param('idManutencao') idManutencao: string,
    @Body(new ZodPipe(estornoSchema)) { motivo }: { motivo: string },
  ) {
    return this.manutencoes.estornar(
      acesso,
      idEquipamento,
      idManutencao,
      motivo,
    );
  }
}
