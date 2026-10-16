import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Acao, pode } from '@crista/domain';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AcessoFazenda, podeVerGalpao } from '../fazendas/acesso-fazenda.guard';
import { PrismaService } from '../prisma/prisma.service';
import { Armazenamento } from './armazenamento';

/** RNF08: anexos de até 10 MB. */
export const TAMANHO_MAXIMO_ANEXO = 10 * 1024 * 1024;

/** Registros que aceitam anexo e a permissão para anexar. */
const ENTIDADES_COM_ANEXO = {
  ocorrencia: 'sanidade.registrar',
} as const satisfies Record<string, Acao>;

export const anexoSchema = z.object({
  entidade: z.enum(
    Object.keys(ENTIDADES_COM_ANEXO) as [keyof typeof ENTIDADES_COM_ANEXO],
  ),
  idEntidade: z.uuid(),
});

/** O tipo é conferido pelo conteúdo do arquivo, não pela extensão nem pelo cabeçalho enviado. */
function tipoPeloConteudo(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return 'image/jpeg';
  if (
    b.length >= 8 &&
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-')
    return 'application/pdf';
  return null;
}

@Injectable()
export class AnexosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly armazenamento: Armazenamento,
  ) {}

  async anexar(
    acesso: AcessoFazenda,
    dados: z.output<typeof anexoSchema>,
    arquivo: Express.Multer.File | undefined,
  ) {
    if (!pode(acesso.perfil, ENTIDADES_COM_ANEXO[dados.entidade])) {
      throw new ForbiddenException(
        'Seu perfil nesta fazenda não permite anexar a este registro',
      );
    }
    if (!arquivo)
      throw new BadRequestException('Envie o arquivo no campo "arquivo"');
    if (arquivo.size > TAMANHO_MAXIMO_ANEXO)
      throw new BadRequestException('O anexo pode ter no máximo 10 MB');
    const mime = tipoPeloConteudo(arquivo.buffer);
    if (!mime)
      throw new BadRequestException(
        'Formato não aceito: envie JPG, PNG ou PDF',
      );

    await this.garantirRegistro(acesso, dados);

    const id = randomUUID();
    const chave = `${acesso.fazendaId}/${id}`;
    await this.armazenamento.gravar(chave, arquivo.buffer);
    const anexo = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.anexo.create({
        data: {
          fazendaId: acesso.fazendaId,
          entidade: dados.entidade,
          idEntidade: dados.idEntidade,
          chave,
          nome: arquivo.originalname.slice(0, 200),
          mime,
          tamanho: arquivo.size,
          sha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
          criadoPorId: acesso.usuarioId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'anexar',
          entidade: dados.entidade,
          idEntidade: dados.idEntidade,
          depois: {
            idAnexo: criado.id,
            nome: criado.nome,
            sha256: criado.sha256,
          },
        },
        tx,
      );
      return criado;
    });
    return {
      id: anexo.id,
      nome: anexo.nome,
      mime: anexo.mime,
      tamanho: anexo.tamanho,
    };
  }

  async abrir(acesso: AcessoFazenda, anexoId: string) {
    const anexo = z.uuid().safeParse(anexoId).success
      ? await this.prisma.anexo.findFirst({
          where: { id: anexoId, fazendaId: acesso.fazendaId },
        })
      : null;
    if (!anexo) throw new NotFoundException('Anexo não encontrado');
    await this.garantirRegistro(acesso, {
      entidade: anexo.entidade as 'ocorrencia',
      idEntidade: anexo.idEntidade,
    });
    return { anexo, conteudo: this.armazenamento.ler(anexo.chave) };
  }

  /** O registro precisa ser da fazenda e de um galpão permitido ao vínculo. */
  private async garantirRegistro(
    acesso: AcessoFazenda,
    dados: z.output<typeof anexoSchema>,
  ) {
    const registro = await this.prisma.ocorrenciaSanitaria.findFirst({
      where: { id: dados.idEntidade, fazendaId: acesso.fazendaId },
      include: { lote: { select: { galpaoId: true } } },
    });
    if (!registro || !podeVerGalpao(acesso, registro.lote.galpaoId))
      throw new NotFoundException('Registro não encontrado');
  }
}
