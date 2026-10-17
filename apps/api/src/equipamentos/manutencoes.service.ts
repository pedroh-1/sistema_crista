import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  antesDaAquisicao,
  avesAlojadas,
  custoManutencao,
  erroRetorno,
  hojeISO,
  horasParado,
  manutencaoSchema,
  NOME_TIPO_MANUTENCAO,
  pode,
} from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { DespesasService } from '../custos/despesas.service';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { FilaService } from '../fila/fila.service';
import { TAREFA_AVALIAR_EQUIPAMENTO } from '../fila/tarefas';
import { Manutencao, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  estornoParaResposta,
  paraData,
  paraISO,
} from '../producao/lote-contexto';
import {
  EquipamentoComGalpao,
  EquipamentosService,
  paradaAberta,
} from './equipamentos.service';

type DadosManutencao = z.output<typeof manutencaoSchema>;

/** Folga para o relógio do navegador adiantado em relação ao servidor. */
const FOLGA_RELOGIO_MS = 5 * 60 * 1000;

@Injectable()
export class ManutencoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly fila: FilaService,
    private readonly despesas: DespesasService,
    private readonly equipamentos: EquipamentosService,
  ) {}

  /**
   * UC19: registra a manutenção. Com custo, gera a despesa de manutenção, que
   * vai para o lote do galpão do equipamento ou, se ele for da fazenda, é
   * rateada entre os lotes ativos (inconsistência #4).
   */
  async registrar(
    acesso: AcessoFazenda,
    equipamentoId: string,
    dados: DadosManutencao,
  ) {
    const equipamento = await this.equipamentos.buscar(acesso, equipamentoId);
    if (equipamento.situacao === 'inativo')
      throw new ConflictException(
        'Equipamento inativo: reative o cadastro antes de registrar manutenção',
      );
    if (dados.data > hojeISO())
      throw this.erroCampo('data', 'A data não pode estar no futuro');
    const aquisicao = equipamento.dataAquisicao
      ? paraISO(equipamento.dataAquisicao)
      : null;
    if (antesDaAquisicao(dados.data, aquisicao))
      throw this.erroCampo(
        'data',
        `A data não pode ser anterior à aquisição do equipamento (${aquisicao})`,
      );
    this.validarNoPassado('paradaInicio', dados.paradaInicio);
    this.validarNoPassado('retornoOperacao', dados.retornoOperacao);
    if (dados.paradaInicio && !dados.retornoOperacao) {
      const aberta = paradaAberta(await this.validas(acesso, equipamentoId));
      if (aberta) {
        throw new ConflictException(
          'O equipamento já está parado: registre o retorno da parada anterior antes de abrir outra',
        );
      }
    }

    const valor = custoManutencao(dados.custoPecas, dados.custoMaoObra);
    const lotes =
      valor > 0 ? await this.lotesDoRateio(equipamento, dados.data) : [];
    const manutencao = await this.prisma.$transaction(async (tx) => {
      const criada = await tx.manutencao.create({
        data: {
          ...dados,
          data: paraData(dados.data),
          paradaInicio: dados.paradaInicio && new Date(dados.paradaInicio),
          retornoOperacao:
            dados.retornoOperacao && new Date(dados.retornoOperacao),
          retornoPorId: dados.retornoOperacao ? acesso.usuarioId : null,
          fazendaId: acesso.fazendaId,
          equipamentoId,
          criadoPorId: acesso.usuarioId,
        },
      });
      if (valor > 0) {
        await this.despesas.gravar(tx, acesso, {
          data: dados.data,
          categoria: 'manutencao',
          descricao: `Manutenção ${NOME_TIPO_MANUTENCAO[dados.tipo].toLowerCase()}: ${equipamento.nome}`,
          valor,
          fornecedor: dados.fornecedor,
          lotes,
          criterioRateio: 'aves_alojadas',
          origem: 'manutencao',
          manutencaoId: criada.id,
          rateioPeloSistema: true,
        });
      }
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'manutencao',
          idEntidade: criada.id,
          depois: criada,
        },
        tx,
      );
      if (criada.paradaInicio) await this.avaliarParada(tx, equipamentoId);
      return criada;
    });
    return this.paraResposta(acesso, manutencao, new Map(), new Map());
  }

  async listar(acesso: AcessoFazenda, equipamentoId: string) {
    await this.equipamentos.buscar(acesso, equipamentoId);
    const manutencoes = await this.prisma.manutencao.findMany({
      where: { equipamentoId },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    const estornos = await this.prisma.estorno.findMany({
      where: { idEvento: { in: manutencoes.map((m) => m.id) } },
    });
    const usuarios = await this.prisma.usuario.findMany({
      where: {
        id: { in: [...new Set(manutencoes.map((m) => m.criadoPorId))] },
      },
      select: { id: true, nome: true },
    });
    const estornoPorId = new Map(estornos.map((e) => [e.idEvento, e]));
    const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
    return manutencoes.map((m) =>
      this.paraResposta(acesso, m, estornoPorId, nomes),
    );
  }

  /** Fecha uma parada que ficou aberta: a única alteração que a manutenção aceita. */
  async registrarRetorno(
    acesso: AcessoFazenda,
    equipamentoId: string,
    manutencaoId: string,
    retornoOperacao: string,
  ) {
    const manutencao = await this.buscar(acesso, equipamentoId, manutencaoId);
    if (!manutencao.paradaInicio)
      throw new ConflictException('Esta manutenção não registrou parada');
    if (manutencao.retornoOperacao)
      throw new ConflictException('O retorno desta parada já foi registrado');
    this.validarNoPassado('retornoOperacao', retornoOperacao);
    const erro = erroRetorno(
      manutencao.paradaInicio.toISOString(),
      retornoOperacao,
    );
    if (erro) throw this.erroCampo('retornoOperacao', erro);

    await this.prisma.$transaction(async (tx) => {
      const depois = await tx.manutencao.update({
        where: { id: manutencaoId },
        data: {
          retornoOperacao: new Date(retornoOperacao),
          retornoPorId: acesso.usuarioId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'registrar_retorno',
          entidade: 'manutencao',
          idEntidade: manutencaoId,
          antes: manutencao,
          depois,
        },
        tx,
      );
      await this.avaliarParada(tx, equipamentoId);
    });
  }

  /** Cancela a manutenção sem apagá-la; a despesa gerada é estornada junto. */
  async estornar(
    acesso: AcessoFazenda,
    equipamentoId: string,
    manutencaoId: string,
    motivo: string,
  ) {
    await this.buscar(acesso, equipamentoId, manutencaoId);
    const despesa = await this.prisma.despesa.findFirst({
      where: { manutencaoId },
    });
    await this.prisma.$transaction(async (tx) => {
      const estorno = await tx.estorno.create({
        data: {
          fazendaId: acesso.fazendaId,
          entidade: 'manutencao',
          idEvento: manutencaoId,
          motivo,
          criadoPorId: acesso.usuarioId,
        },
      });
      if (despesa) {
        await tx.estorno.create({
          data: {
            fazendaId: acesso.fazendaId,
            entidade: 'despesa',
            idEvento: despesa.id,
            motivo: `Estorno da manutenção: ${motivo}`,
            criadoPorId: acesso.usuarioId,
          },
        });
      }
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'estornar',
          entidade: 'manutencao',
          idEntidade: manutencaoId,
          depois: { idEstorno: estorno.id, motivo },
        },
        tx,
      );
      await this.avaliarParada(tx, equipamentoId);
    });
  }

  /** Manutenção do equipamento, ainda não estornada. */
  private async buscar(
    acesso: AcessoFazenda,
    equipamentoId: string,
    manutencaoId: string,
  ) {
    await this.equipamentos.buscar(acesso, equipamentoId);
    const manutencao = z.uuid().safeParse(manutencaoId).success
      ? await this.prisma.manutencao.findFirst({
          where: { id: manutencaoId, equipamentoId },
        })
      : null;
    if (!manutencao) throw new NotFoundException('Manutenção não encontrada');
    if (
      await this.prisma.estorno.findUnique({
        where: { idEvento: manutencaoId },
      })
    )
      throw new ConflictException('Manutenção estornada');
    return manutencao;
  }

  private async validas(acesso: AcessoFazenda, equipamentoId: string) {
    return this.prisma.manutencao.findMany({
      where: {
        equipamentoId,
        id: { notIn: await this.equipamentos.estornadas(acesso.fazendaId) },
      },
    });
  }

  /**
   * Lotes que recebem o custo: o lote em andamento do galpão do equipamento ou,
   * no equipamento da fazenda, os lotes em andamento com aves alojadas, por aves
   * alojadas. Sem lote, a despesa fica como despesa da fazenda.
   */
  private async lotesDoRateio(
    equipamento: EquipamentoComGalpao,
    data: string,
  ): Promise<string[]> {
    const lotes = await this.prisma.lote.findMany({
      where: {
        fazendaId: equipamento.fazendaId,
        situacao: 'em_andamento',
        dataAlojamento: { lte: paraData(data) },
        ...(equipamento.galpaoId && { galpaoId: equipamento.galpaoId }),
      },
      include: { alojamento: true },
    });
    if (equipamento.galpaoId) return lotes.map((l) => l.id);
    return lotes
      .filter(
        (l) =>
          l.alojamento &&
          avesAlojadas(
            l.alojamento.avesRecebidas,
            l.alojamento.mortasTransporte,
          ) > 0,
      )
      .map((l) => l.id);
  }

  private avaliarParada(tx: Prisma.TransactionClient, equipamentoId: string) {
    return this.fila.enfileirar(tx, TAREFA_AVALIAR_EQUIPAMENTO, {
      equipamentoId,
    });
  }

  private paraResposta(
    acesso: AcessoFazenda,
    m: Manutencao,
    estornos: Map<string, Parameters<typeof estornoParaResposta>[0]>,
    nomes: Map<string, string>,
  ) {
    // Custos são informação financeira (docs/02-permissoes.md).
    const verCusto = pode(acesso.perfil, 'financeiro.ver');
    const pecas = Number(m.custoPecas);
    const maoObra = Number(m.custoMaoObra);
    return {
      id: m.id,
      tipo: m.tipo,
      data: paraISO(m.data),
      descricao: m.descricao,
      custoPecas: verCusto ? pecas : null,
      custoMaoObra: verCusto ? maoObra : null,
      custoTotal: verCusto ? custoManutencao(pecas, maoObra) : null,
      fornecedor: m.fornecedor,
      ordemServico: m.ordemServico,
      paradaInicio: m.paradaInicio,
      retornoOperacao: m.retornoOperacao,
      horasParado: m.paradaInicio
        ? horasParado(m.paradaInicio, m.retornoOperacao ?? new Date())
        : null,
      registradoPor: nomes.get(m.criadoPorId) ?? null,
      estorno: estornoParaResposta(estornos.get(m.id)),
    };
  }

  private validarNoPassado(campo: string, dataHora: string | undefined) {
    if (dataHora && Date.parse(dataHora) > Date.now() + FOLGA_RELOGIO_MS)
      throw this.erroCampo(campo, 'A data e hora não podem estar no futuro');
  }

  private erroCampo(campo: string, mensagem: string) {
    return new BadRequestException({
      message: mensagem,
      erros: [{ campo, mensagem }],
    });
  }
}
