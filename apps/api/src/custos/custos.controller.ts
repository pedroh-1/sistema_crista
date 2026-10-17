import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  despesaSchema,
  estornoSchema,
  filtroPainelSchema,
  FiltroPainel,
  visaoSalvaSchema,
} from '@crista/domain';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import {
  Acesso,
  AcessoFazenda,
  AcessoFazendaGuard,
  Permite,
} from '../fazendas/acesso-fazenda.guard';
import { DespesasService } from './despesas.service';
import { PainelService } from './painel.service';
import { VisoesService } from './visoes.service';

const filtroDespesasSchema = z.object({ lote: z.uuid().optional() });

@Controller('fazendas/:idFazenda')
@UseGuards(AcessoFazendaGuard)
export class CustosController {
  constructor(
    private readonly despesas: DespesasService,
    private readonly painel: PainelService,
    private readonly visoes: VisoesService,
  ) {}

  // ---------- UC12 ----------

  @Post('despesas')
  @Permite('despesa.registrar')
  registrar(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(despesaSchema)) dados: z.output<typeof despesaSchema>,
  ) {
    return this.despesas.registrar(acesso, dados);
  }

  @Get('despesas')
  @Permite('financeiro.ver')
  listar(
    @Acesso() acesso: AcessoFazenda,
    @Query(new ZodPipe(filtroDespesasSchema))
    filtro: z.output<typeof filtroDespesasSchema>,
  ) {
    return this.despesas.listar(acesso, filtro.lote);
  }

  @Post('despesas/:idDespesa/estornar')
  @Permite('despesa.registrar')
  @HttpCode(204)
  estornar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idDespesa') idDespesa: string,
    @Body(new ZodPipe(estornoSchema)) { motivo }: { motivo: string },
  ) {
    return this.despesas.estornar(acesso, idDespesa, motivo);
  }

  // ---------- UC15 ----------

  @Get('painel')
  @Permite('painel.filtrar')
  comparar(
    @Acesso() acesso: AcessoFazenda,
    @Query(new ZodPipe(filtroPainelSchema)) filtro: FiltroPainel,
  ) {
    return this.painel.comparar(acesso, filtro);
  }

  @Get('visoes')
  @Permite('painel.filtrar')
  listarVisoes(@Acesso() acesso: AcessoFazenda) {
    return this.visoes.listar(acesso);
  }

  @Post('visoes')
  @Permite('painel.filtrar')
  salvarVisao(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(visaoSalvaSchema))
    dados: z.output<typeof visaoSalvaSchema>,
  ) {
    return this.visoes.salvar(acesso, dados);
  }

  @Delete('visoes/:idVisao')
  @Permite('painel.filtrar')
  @HttpCode(204)
  excluirVisao(
    @Acesso() acesso: AcessoFazenda,
    @Param('idVisao') idVisao: string,
  ) {
    return this.visoes.excluir(acesso, idVisao);
  }
}
