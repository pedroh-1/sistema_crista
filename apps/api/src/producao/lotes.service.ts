import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  alojamentoSchema,
  hojeISO,
  loteSchema,
  serieMortalidadeDia,
} from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AcessoFazenda, podeVerGalpao } from '../fazendas/acesso-fazenda.guard';
import { Alojamento, Lote, SituacaoLote } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConfirmacaoNecessaria,
  LoteContexto,
  numOuNulo,
  paraData,
  paraISO,
} from './lote-contexto';
import { DadosLote } from './dados-lote';
import { EncerramentoService } from './encerramento.service';
import {
  curvaAte,
  financeiroDoLote,
  metaDoLote,
  serieDePeso,
} from './indicadores';
import { resumoDoLote } from './resumo';

type DadosNovoLote = z.output<typeof loteSchema>;
type DadosAlojamento = z.output<typeof alojamentoSchema>;

export const loteParaResposta = (l: Lote) => ({
  id: l.id,
  galpaoId: l.galpaoId,
  codigo: l.codigo,
  linhagem: l.linhagem,
  sexagem: l.sexagem,
  origem: l.origem,
  dataAlojamento: paraISO(l.dataAlojamento),
  idadeInicialDias: l.idadeInicialDias,
  pesoPintoG: numOuNulo(l.pesoPintoG),
  custoPinto: numOuNulo(l.custoPinto),
  precoReferenciaKg: numOuNulo(l.precoReferenciaKg),
  quantidadePrevista: l.quantidadePrevista,
  situacao: l.situacao,
  criadoEm: l.criadoEm,
});

const alojamentoParaResposta = (a: Alojamento) => ({
  data: paraISO(a.data),
  avesRecebidas: a.avesRecebidas,
  mortasTransporte: a.mortasTransporte,
  justificativaDivergencia: a.justificativaDivergencia,
  acimaDaCapacidadeConfirmado: a.confirmouDensidadePorId !== null,
});

@Injectable()
export class LotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly contexto: LoteContexto,
    private readonly dadosLote: DadosLote,
    private readonly encerramentos: EncerramentoService,
  ) {}

  /** UC05: um lote em andamento por galpão; o galpão passa a ocupado. */
  async criar(acesso: AcessoFazenda, dados: DadosNovoLote) {
    const galpao = await this.prisma.galpao.findFirst({
      where: { id: dados.galpaoId, fazendaId: acesso.fazendaId },
    });
    if (!galpao || !podeVerGalpao(acesso, galpao.id)) {
      throw new BadRequestException({
        message: 'Galpão não encontrado',
        erros: [{ campo: 'galpaoId', mensagem: 'Galpão não encontrado' }],
      });
    }
    if (galpao.situacao === 'ocupado')
      throw new ConflictException(
        `O galpão ${galpao.identificacao} já tem um lote em andamento`,
      );
    if (galpao.situacao === 'inativo')
      throw new ConflictException(
        `O galpão ${galpao.identificacao} está inativo`,
      );
    if (dados.dataAlojamento > hojeISO()) {
      throw new BadRequestException({
        message: 'A data de alojamento não pode estar no futuro',
        erros: [
          {
            campo: 'dataAlojamento',
            mensagem: 'A data de alojamento não pode estar no futuro',
          },
        ],
      });
    }
    if (
      await this.prisma.lote.findFirst({
        where: { fazendaId: acesso.fazendaId, codigo: dados.codigo },
      })
    ) {
      throw new ConflictException(
        'Já existe um lote com este código na fazenda',
      );
    }
    if (
      dados.quantidadePrevista > galpao.capacidadeAves &&
      !dados.confirmarDensidade
    ) {
      throw new ConfirmacaoNecessaria(
        'DENSIDADE',
        `A quantidade prevista (${dados.quantidadePrevista}) passa da capacidade do galpão (${galpao.capacidadeAves} aves). Confirme para continuar.`,
      );
    }

    const { confirmarDensidade, dataAlojamento, ...resto } = dados;
    const lote = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.lote.create({
        data: {
          ...resto,
          fazendaId: acesso.fazendaId,
          dataAlojamento: paraData(dataAlojamento),
          confirmouDensidadePorId:
            confirmarDensidade &&
            dados.quantidadePrevista > galpao.capacidadeAves
              ? acesso.usuarioId
              : null,
          criadoPorId: acesso.usuarioId,
        },
      });
      await tx.galpao.update({
        where: { id: galpao.id },
        data: { situacao: 'ocupado' },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'lote',
          idEntidade: criado.id,
          depois: criado,
        },
        tx,
      );
      return criado;
    });
    return loteParaResposta(lote);
  }

  async listar(acesso: AcessoFazenda, situacao?: SituacaoLote) {
    const lotes = await this.prisma.lote.findMany({
      where: {
        fazendaId: acesso.fazendaId,
        ...(situacao && { situacao }),
        ...(acesso.galpoes.length > 0 && { galpaoId: { in: acesso.galpoes } }),
      },
      include: { galpao: { select: { identificacao: true } } },
      orderBy: { dataAlojamento: 'desc' },
    });
    return lotes.map((l) => ({
      ...loteParaResposta(l),
      galpao: l.galpao.identificacao,
    }));
  }

  /** Lote com alojamento, indicadores do dia e meta da curva (UC13). */
  async obter(acesso: AcessoFazenda, loteId: string) {
    const lote = await this.contexto.carregar(acesso, loteId);
    // Lote encerrado é visto como estava na data do encerramento.
    const encerramento = await this.encerramentos.encerramento(loteId);
    const dados = await this.dadosLote.carregar(lote, encerramento?.data);
    const alojamento = await this.prisma.alojamento.findUnique({
      where: { loteId },
    });
    return {
      encerramento,
      ...loteParaResposta(lote),
      galpao: {
        id: dados.galpao.id,
        identificacao: dados.galpao.identificacao,
        capacidadeAves: dados.galpao.capacidadeAves,
      },
      alojamento: alojamento && alojamentoParaResposta(alojamento),
      resumo: resumoDoLote(dados.entrada),
      meta: metaDoLote(dados),
    };
  }

  /** UC11: pesagens contra a curva padrão da linhagem. */
  async curva(acesso: AcessoFazenda, loteId: string) {
    const lote = await this.contexto.carregar(acesso, loteId);
    const dados = await this.dadosLote.carregar(lote);
    const pesagens = serieDePeso(dados);
    const idadeHoje = resumoDoLote(dados.entrada).idadeDias;
    const ate = Math.max(idadeHoje, pesagens.at(-1)?.idadeDias ?? 0) + 7;
    return {
      fonteCurva: dados.fonteCurva,
      linhagem: lote.linhagem,
      pesagens,
      curvaPadrao: curvaAte(dados.curva, ate),
    };
  }

  /** Mortalidade de cada dia com os limites do alerta (UC16) que valiam naquela idade. */
  async mortalidadeDiaria(acesso: AcessoFazenda, loteId: string) {
    const lote = await this.contexto.carregar(acesso, loteId);
    const dados = await this.dadosLote.carregar(lote);
    const { avesAlojadas } = resumoDoLote(dados.entrada);
    const regra = await this.prisma.regraAlerta.findUnique({
      where: {
        fazendaId_indicador: {
          fazendaId: lote.fazendaId,
          indicador: 'mortalidade_dia',
        },
      },
    });
    const configurado = regra
      ? {
          atencao: Number(regra.limiteAtencao),
          critico: Number(regra.limiteCritico),
        }
      : null;
    return {
      limitesConfigurados: configurado,
      pontos:
        avesAlojadas === null
          ? []
          : serieMortalidadeDia(
              { ...dados.entrada, avesAlojadas },
              configurado,
            ),
    };
  }

  /** UC14: custos, receita e margem, com as parcelas de despesa do lote. */
  async financeiro(acesso: AcessoFazenda, loteId: string) {
    const lote = await this.contexto.carregar(acesso, loteId);
    const dados = await this.dadosLote.carregar(lote);
    return {
      ...financeiroDoLote(dados),
      despesas: dados.parcelas.sort((a, b) => b.data.localeCompare(a.data)),
    };
  }

  /** Preço de venda de referência (R$/kg), base da receita prevista (UC14). */
  async definirPreco(
    acesso: AcessoFazenda,
    loteId: string,
    precoReferenciaKg: number | null,
  ) {
    const antes = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.lote.update({
        where: { id: loteId },
        data: { precoReferenciaKg },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'editar',
          entidade: 'lote',
          idEntidade: loteId,
          antes: { precoReferenciaKg: numOuNulo(antes.precoReferenciaKg) },
          depois: { precoReferenciaKg },
        },
        tx,
      );
    });
  }

  /** Lote criado por engano: só pode ser cancelado antes de qualquer lançamento. */
  async cancelar(acesso: AcessoFazenda, loteId: string, motivo: string) {
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    const lancamentos = await Promise.all([
      this.prisma.alojamento.count({ where: { loteId } }),
      this.prisma.eventoBaixa.count({ where: { loteId } }),
      this.prisma.pesagem.count({ where: { loteId } }),
      this.prisma.movimentoRacao.count({ where: { loteId } }),
      this.prisma.ocorrenciaSanitaria.count({ where: { loteId } }),
    ]);
    if (lancamentos.some((n) => n > 0)) {
      throw new ConflictException(
        'O lote já tem lançamentos e não pode ser cancelado; ele será encerrado no fim do ciclo',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.lote.update({
        where: { id: loteId },
        data: { situacao: 'cancelado' },
      });
      await tx.galpao.update({
        where: { id: lote.galpaoId },
        data: { situacao: 'disponivel' },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'cancelar',
          entidade: 'lote',
          idEntidade: loteId,
          antes: { situacao: lote.situacao },
          depois: { situacao: 'cancelado', motivo },
        },
        tx,
      );
    });
  }

  /**
   * UC06: saldo inicial = recebidas − mortas no transporte. Divergência da
   * quantidade prevista exige justificativa; acima da capacidade, só o Gestor confirma.
   * A data real do alojamento passa a ser a data do lote.
   */
  async registrarAlojamento(
    acesso: AcessoFazenda,
    loteId: string,
    dados: DadosAlojamento,
  ) {
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    if (await this.prisma.alojamento.findUnique({ where: { loteId } })) {
      throw new ConflictException('O alojamento deste lote já foi registrado');
    }
    const confirmouDensidadePorId = await this.validarAlojamento(
      acesso,
      lote,
      dados,
    );
    if (dados.data > hojeISO()) {
      throw new BadRequestException({
        message: 'A data não pode estar no futuro',
        erros: [{ campo: 'data', mensagem: 'A data não pode estar no futuro' }],
      });
    }

    const alojamento = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.alojamento.create({
        data: {
          fazendaId: acesso.fazendaId,
          loteId,
          data: paraData(dados.data),
          avesRecebidas: dados.avesRecebidas,
          mortasTransporte: dados.mortasTransporte,
          justificativaDivergencia: dados.justificativaDivergencia,
          confirmouDensidadePorId,
          criadoPorId: acesso.usuarioId,
        },
      });
      if (dados.data !== paraISO(lote.dataAlojamento)) {
        await tx.lote.update({
          where: { id: loteId },
          data: { dataAlojamento: paraData(dados.data) },
        });
      }
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'alojamento',
          idEntidade: criado.id,
          depois: criado,
        },
        tx,
      );
      return criado;
    });
    return alojamentoParaResposta(alojamento);
  }

  /** Correção do alojamento pelo Gestor; o saldo não pode ficar abaixo das baixas já lançadas. */
  async corrigirAlojamento(
    acesso: AcessoFazenda,
    loteId: string,
    dados: DadosAlojamento,
  ) {
    if (acesso.perfil !== 'gestor')
      throw new ForbiddenException('Só o Gestor corrige o alojamento');
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    const antes = await this.prisma.alojamento.findUnique({
      where: { loteId },
    });
    if (!antes) throw new NotFoundException('Alojamento ainda não registrado');
    if (dados.data !== paraISO(antes.data)) {
      throw new BadRequestException({
        message: 'A data do alojamento não muda depois do registro',
        erros: [
          {
            campo: 'data',
            mensagem: 'A data do alojamento não muda depois do registro',
          },
        ],
      });
    }
    const confirmouDensidadePorId = await this.validarAlojamento(
      acesso,
      lote,
      dados,
    );

    const totalBaixas = await this.contexto.totalBaixas(
      acesso.fazendaId,
      loteId,
    );
    if (dados.avesRecebidas - dados.mortasTransporte < totalBaixas) {
      throw new ConflictException(
        `Já há ${totalBaixas} baixas lançadas; o alojamento não pode ficar abaixo disso`,
      );
    }

    const depois = await this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.alojamento.update({
        where: { loteId },
        data: {
          avesRecebidas: dados.avesRecebidas,
          mortasTransporte: dados.mortasTransporte,
          justificativaDivergencia: dados.justificativaDivergencia ?? null,
          confirmouDensidadePorId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'editar',
          entidade: 'alojamento',
          idEntidade: atualizado.id,
          antes,
          depois: atualizado,
        },
        tx,
      );
      return atualizado;
    });
    return alojamentoParaResposta(depois);
  }

  /** Devolve quem confirmou a densidade (ou nulo) e valida as regras do UC06. */
  private async validarAlojamento(
    acesso: AcessoFazenda,
    lote: Lote,
    dados: DadosAlojamento,
  ): Promise<string | null> {
    if (
      dados.avesRecebidas !== lote.quantidadePrevista &&
      !dados.justificativaDivergencia
    ) {
      const mensagem = `Recebidas (${dados.avesRecebidas}) diferente do previsto (${lote.quantidadePrevista}): informe a justificativa`;
      throw new BadRequestException({
        message: mensagem,
        erros: [{ campo: 'justificativaDivergencia', mensagem }],
      });
    }
    const galpao = await this.prisma.galpao.findUniqueOrThrow({
      where: { id: lote.galpaoId },
    });
    if (dados.avesRecebidas <= galpao.capacidadeAves) return null;
    if (acesso.perfil !== 'gestor') {
      throw new ForbiddenException(
        `As aves recebidas passam da capacidade do galpão (${galpao.capacidadeAves}). Só o Gestor pode confirmar este alojamento.`,
      );
    }
    if (!dados.confirmarDensidade) {
      throw new ConfirmacaoNecessaria(
        'DENSIDADE',
        `As aves recebidas (${dados.avesRecebidas}) passam da capacidade do galpão (${galpao.capacidadeAves}). Confirme para continuar.`,
      );
    }
    return acesso.usuarioId;
  }
}
