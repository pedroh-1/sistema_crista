import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { ZodPipe } from '../comum/zod.pipe';
import {
  Acesso,
  AcessoFazenda,
  AcessoFazendaGuard,
} from '../fazendas/acesso-fazenda.guard';
import {
  anexoSchema,
  AnexosService,
  TAMANHO_MAXIMO_ANEXO,
} from './anexos.service';

@Controller('fazendas/:idFazenda/anexos')
@UseGuards(AcessoFazendaGuard)
export class AnexosController {
  constructor(private readonly anexos: AnexosService) {}

  /** Multipart: campos `entidade`, `idEntidade` e o arquivo em `arquivo`. */
  @Post()
  @UseInterceptors(
    FileInterceptor('arquivo', {
      limits: { fileSize: TAMANHO_MAXIMO_ANEXO, files: 1 },
    }),
  )
  anexar(
    @Acesso() acesso: AcessoFazenda,
    @Body(new ZodPipe(anexoSchema)) dados: z.output<typeof anexoSchema>,
    @UploadedFile() arquivo: Express.Multer.File | undefined,
  ) {
    return this.anexos.anexar(acesso, dados, arquivo);
  }

  @Get(':idAnexo')
  async abrir(
    @Acesso() acesso: AcessoFazenda,
    @Param('idAnexo') idAnexo: string,
  ) {
    const { anexo, conteudo } = await this.anexos.abrir(acesso, idAnexo);
    return new StreamableFile(conteudo, {
      type: anexo.mime,
      length: anexo.tamanho,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(anexo.nome)}`,
    });
  }
}
