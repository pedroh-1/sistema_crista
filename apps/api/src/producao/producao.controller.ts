import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  alojamentoSchema,
  baixaSchema,
  cargaSchema,
  encerramentoSchema,
  FORMATOS_RELATORIO,
  estornoSchema,
  filtroVisaoGeralSchema,
  loteSchema,
  movimentoRacaoSchema,
  pesagemSchema,
  precoReferenciaSchema,
  relatorioFazendaSchema,
} from '@crista/domain';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import {
  Acesso,
  AcessoFazenda,
  AcessoFazendaGuard,
  Permite,
} from '../fazendas/acesso-fazenda.guard';
import { EncerramentoService } from './encerramento.service';
import { ENTIDADES_EVENTO, EventosService } from './eventos.service';
import { LotesService } from './lotes.service';
import { RelatorioFazendaService } from './relatorio-fazenda.service';
import { RelatorioService } from './relatorio.service';
import { ResumoFazendaService } from './resumo-fazenda.service';
import { VisaoGeralService } from './visao-geral.service';

const formatoSchema = z.object({
  formato: z.enum(FORMATOS_RELATORIO).default('pdf'),
});
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
    private readonly encerramento: EncerramentoService,
    private readonly relatorios: RelatorioService,
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

  @Get(':idLote/mortalidade')
  mortalidade(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
  ) {
    return this.lotes.mortalidadeDiaria(acesso, idLote);
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

  // ---------- UC17 ----------

  @Post(':idLote/cargas')
  @Permite('lote.encerrar')
  registrarCarga(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(cargaSchema)) dados: z.output<typeof cargaSchema>,
  ) {
    return this.encerramento.registrarCarga(acesso, idLote, dados);
  }

  @Get(':idLote/cargas')
  listarCargas(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
  ) {
    return this.encerramento.listarCargas(acesso, idLote);
  }

  @Post(':idLote/encerrar')
  @Permite('lote.encerrar')
  @HttpCode(200)
  encerrar(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Body(new ZodPipe(encerramentoSchema))
    dados: z.output<typeof encerramentoSchema>,
  ) {
    return this.encerramento.encerrar(acesso, idLote, dados);
  }

  @Get(':idLote/relatorio')
  async relatorio(
    @Acesso() acesso: AcessoFazenda,
    @Param('idLote') idLote: string,
    @Query(new ZodPipe(formatoSchema))
    { formato }: z.output<typeof formatoSchema>,
  ) {
    const r = await this.relatorios.gerar(acesso, idLote, formato);
    return new StreamableFile(r.conteudo, {
      type: r.tipo,
      disposition: `attachment; filename="${r.nome}"`,
    });
  }
}

/** Resumo da fazenda para a página inicial (lacuna do docs/08-design.md). */
@Controller('fazendas/:idFazenda/resumo')
@UseGuards(AcessoFazendaGuard)
export class ResumoFazendaController {
  constructor(private readonly resumos: ResumoFazendaService) {}

  @Get()
  resumo(@Acesso() acesso: AcessoFazenda) {
    return this.resumos.resumo(acesso);
  }
}

/** Visão geral da fazenda e o relatório dela, com o mesmo filtro (docs/08-design.md). */
@Controller('fazendas/:idFazenda/visao-geral')
@UseGuards(AcessoFazendaGuard)
export class VisaoGeralController {
  constructor(
    private readonly visoes: VisaoGeralService,
    private readonly relatorios: RelatorioFazendaService,
  ) {}

  @Get()
  visao(
    @Acesso() acesso: AcessoFazenda,
    @Query(new ZodPipe(filtroVisaoGeralSchema))
    filtro: z.output<typeof filtroVisaoGeralSchema>,
  ) {
    return this.visoes.visao(acesso, filtro);
  }

  @Get('relatorio')
  async relatorio(
    @Acesso() acesso: AcessoFazenda,
    @Query(new ZodPipe(relatorioFazendaSchema))
    filtro: z.output<typeof relatorioFazendaSchema>,
  ) {
    const r = await this.relatorios.gerar(acesso, filtro);
    return new StreamableFile(r.conteudo, {
      type: r.tipo,
      disposition: `attachment; filename="${r.nome}"`,
    });
  }
}
