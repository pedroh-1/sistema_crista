import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  alojamentoSchema,
  baixaSchema,
  estornoSchema,
  loteSchema,
  movimentoRacaoSchema,
  pesagemSchema,
  precoReferenciaSchema,
} from '@crista/domain';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import {
  Acesso,
  AcessoFazenda,
  AcessoFazendaGuard,
  Permite,
} from '../fazendas/acesso-fazenda.guard';
import { ENTIDADES_EVENTO, EventosService } from './eventos.service';
import { LotesService } from './lotes.service';

const filtroLotesSchema = z.object({
  situacao: z.enum(['em_andamento', 'encerrado', 'cancelado']).optional(),
});
const estornoComEventoSchema = estornoSchema.extend({
  entidade: z.enum(
    Object.keys(ENTIDADES_EVENTO) as [keyof typeof ENTIDADES_EVENTO],
  ),
  idEvento: z.uuid(),
});

@Controller('fazendas/:idFazenda/lotes')
@UseGuards(AcessoFazendaGuard)
export class LotesController {
  constructor(
    private readonly lotes: LotesService,
    private readonly eventos: EventosService,
  ) {}

  // ---------- UC05 ----------

  @Post()
  @Permite('lote.cadastrar')
  criar(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(loteSchema)) dados: z.output<typeof loteSchema>,
  ) {
    return this.lotes.criar(acesso, dados);
  }

  @Get()
  listar(
    @Acesso() acesso: AcessoFazenda,
    @Query(new ZodPipe(filtroLotesSchema))
    filtro: z.output<typeof filtroLotesSchema>,
  ) {
    return this.lotes.listar(acesso, filtro.situacao);
  }

  @Get(':idLote')
  obter(@Acesso() acesso: AcessoFazenda, @Param('idLote') idLote: string) {
    return this.lotes.obter(acesso, idLote);
  }

  @Get(':idLote/curva')
  curva(@Acesso() acesso: AcessoFazenda, @Param('idLote') idLote: string) {
    return this.lotes.curva(acesso, idLote);
  }

  @Get(':idLote/financeiro')
  @Permite('financeiro.ver')
  financeiro(@Acesso() acesso: AcessoFazenda, @Param('idLote') idLote: string) {
    return this.lotes.financeiro(acesso, idLote);
  }

  @Put(':idLote/preco')
  @Permite('despesa.registrar')
  @HttpCode(204)
  definirPreco(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(precoReferenciaSchema))
    dados: z.output<typeof precoReferenciaSchema>,
  ) {
    return this.lotes.definirPreco(acesso, idLote, dados.precoReferenciaKg);
  }

  @Post(':idLote/cancelar')
  @Permite('lote.cadastrar')
  @HttpCode(204)
  cancelar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(estornoSchema)) { motivo }: { motivo: string },
  ) {
    return this.lotes.cancelar(acesso, idLote, motivo);
  }

  // ---------- UC06 ----------

  @Post(':idLote/alojamento')
  @Permite('alojamento.registrar')
  registrarAlojamento(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(alojamentoSchema))
    dados: z.output<typeof alojamentoSchema>,
  ) {
    return this.lotes.registrarAlojamento(acesso, idLote, dados);
  }

  @Put(':idLote/alojamento')
  @Permite('alojamento.registrar')
  corrigirAlojamento(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(alojamentoSchema))
    dados: z.output<typeof alojamentoSchema>,
  ) {
    return this.lotes.corrigirAlojamento(acesso, idLote, dados);
  }

  // ---------- UC07 ----------

  @Post(':idLote/baixas')
  @Permite('baixa.registrar')
  registrarBaixa(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(baixaSchema)) dados: z.output<typeof baixaSchema>,
  ) {
    return this.eventos.registrarBaixa(acesso, idLote, dados);
  }

  @Get(':idLote/baixas')
  listarBaixas(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
  ) {
    return this.eventos.listarBaixas(acesso, idLote);
  }

  // ---------- UC10 ----------

  @Post(':idLote/pesagens')
  @Permite('pesagem.registrar')
  registrarPesagem(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(pesagemSchema)) dados: z.output<typeof pesagemSchema>,
  ) {
    return this.eventos.registrarPesagem(acesso, idLote, dados);
  }

  @Get(':idLote/pesagens')
  listarPesagens(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
  ) {
    return this.eventos.listarPesagens(acesso, idLote);
  }

  // ---------- Ração ----------

  @Post(':idLote/racao')
  @Permite('racao.registrar')
  registrarRacao(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(movimentoRacaoSchema))
    dados: z.output<typeof movimentoRacaoSchema>,
  ) {
    return this.eventos.registrarRacao(acesso, idLote, dados);
  }

  @Get(':idLote/racao')
  listarRacao(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
  ) {
    return this.eventos.listarRacao(acesso, idLote);
  }

  // ---------- Correção ----------

  @Post(':idLote/estornos')
  @HttpCode(204)
  estornar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(estornoComEventoSchema))
    dados: z.output<typeof estornoComEventoSchema>,
  ) {
    return this.eventos.estornar(
      acesso,
      idLote,
      dados.entidade,
      dados.idEvento,
      dados.motivo,
    );
  }
}
