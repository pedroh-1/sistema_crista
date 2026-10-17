import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  edicaoEquipamentoSchema,
  equipamentoSchema,
  hojeISO,
  pode,
  proximaPreventiva,
  situacaoPreventiva,
} from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AcessoFazenda, podeVerGalpao } from '../fazendas/acesso-fazenda.guard';
import { FilaService } from '../fila/fila.service';
import { TAREFA_AVALIAR_EQUIPAMENTO } from '../fila/tarefas';
import { Equipamento, Manutencao, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paraData, paraISO } from '../producao/lote-contexto';

type DadosEquipamento = z.output<typeof equipamentoSchema>;
type EdicaoEquipamento = z.output<typeof edicaoEquipamentoSchema>;

/** Equipamento com o galpão, para as respostas. */
export type EquipamentoComGalpao = Equipamento & {
  galpao: { identificacao: string } | null;
};

/** Parada sem retorno registrado, desconsiderando manutenções estornadas. */
export const paradaAberta = (manutencoes: Manutencao[]) =>
  manutencoes.find((m) => m.paradaInicio && !m.retornoOperacao) ?? null;

@Injectable()
export class EquipamentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly fila: FilaService,
  ) {}

  /** UC18: cadastra o equipamento, com ou sem galpão. */
  async criar(acesso: AcessoFazenda, dados: DadosEquipamento) {
    await this.validar(acesso, dados);
    const criado = await this.prisma.$transaction(async (tx) => {
      const equipamento = await tx.equipamento.create({
        data: {
          ...dados,
          dataAquisicao: dados.dataAquisicao && paraData(dados.dataAquisicao),
          fazendaId: acesso.fazendaId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'equipamento',
          idEntidade: equipamento.id,
          depois: equipamento,
        },
        tx,
      );
      return equipamento;
    });
    return this.obter(acesso, criado.id);
  }

  /** A edição substitui o cadastro inteiro; as manutenções ficam como estão. */
  async editar(
    acesso: AcessoFazenda,
    equipamentoId: string,
    dados: EdicaoEquipamento,
  ) {
    const antes = await this.buscar(acesso, equipamentoId);
    await this.validar(acesso, dados, antes.id);
    if (dados.dataAquisicao) {
      const anterior = await this.prisma.manutencao.findFirst({
        where: {
          equipamentoId,
          data: { lt: paraData(dados.dataAquisicao) },
          id: { notIn: await this.estornadas(acesso.fazendaId) },
        },
        orderBy: { data: 'asc' },
      });
      if (anterior) {
        throw this.erroCampo(
          'dataAquisicao',
          `Há manutenção registrada em ${paraISO(anterior.data)}, antes desta data de aquisição`,
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const depois = await tx.equipamento.update({
        where: { id: equipamentoId },
        data: {
          nome: dados.nome,
          tipo: dados.tipo,
          galpaoId: dados.galpaoId ?? null,
          numeroSerie: dados.numeroSerie ?? null,
          fabricante: dados.fabricante ?? null,
          modelo: dados.modelo ?? null,
          critico: dados.critico,
          periodicidadeDias: dados.periodicidadeDias ?? null,
          dataAquisicao: dados.dataAquisicao
            ? paraData(dados.dataAquisicao)
            : null,
          situacao: dados.situacao,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'editar',
          entidade: 'equipamento',
          idEntidade: equipamentoId,
          antes,
          depois,
        },
        tx,
      );
      // Mudar o "crítico", a situação ou o galpão pode abrir ou fechar o alerta de parada.
      await this.fila.enfileirar(tx, TAREFA_AVALIAR_EQUIPAMENTO, {
        equipamentoId,
      });
    });
    return this.obter(acesso, equipamentoId);
  }

  async listar(acesso: AcessoFazenda) {
    const equipamentos = await this.prisma.equipamento.findMany({
      where: { fazendaId: acesso.fazendaId, ...this.filtroGalpoes(acesso) },
      include: {
        galpao: { select: { identificacao: true } },
        manutencoes: { orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }] },
      },
      orderBy: [{ situacao: 'asc' }, { nome: 'asc' }],
    });
    const estornadas = new Set(await this.estornadas(acesso.fazendaId));
    return equipamentos.map((e) =>
      this.resumo(
        acesso,
        e,
        e.manutencoes.filter((m) => !estornadas.has(m.id)),
      ),
    );
  }

  async obter(acesso: AcessoFazenda, equipamentoId: string) {
    const equipamento = await this.buscar(acesso, equipamentoId);
    const estornadas = new Set(await this.estornadas(acesso.fazendaId));
    const manutencoes = await this.prisma.manutencao.findMany({
      where: { equipamentoId },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    return this.resumo(
      acesso,
      equipamento,
      manutencoes.filter((m) => !estornadas.has(m.id)),
    );
  }

  /** Busca o equipamento respeitando os galpões permitidos ao vínculo. */
  async buscar(
    acesso: AcessoFazenda,
    equipamentoId: string,
  ): Promise<EquipamentoComGalpao> {
    const equipamento = z.uuid().safeParse(equipamentoId).success
      ? await this.prisma.equipamento.findFirst({
          where: { id: equipamentoId, fazendaId: acesso.fazendaId },
          include: { galpao: { select: { identificacao: true } } },
        })
      : null;
    if (
      !equipamento ||
      (equipamento.galpaoId && !podeVerGalpao(acesso, equipamento.galpaoId))
    )
      throw new NotFoundException('Equipamento não encontrado');
    return equipamento;
  }

  /** Ids das manutenções estornadas da fazenda. */
  async estornadas(fazendaId: string): Promise<string[]> {
    const estornos = await this.prisma.estorno.findMany({
      where: { fazendaId, entidade: 'manutencao' },
      select: { idEvento: true },
    });
    return estornos.map((e) => e.idEvento);
  }

  /** Situação do equipamento a partir das manutenções válidas (mais recente primeiro). */
  private resumo(
    acesso: AcessoFazenda,
    e: EquipamentoComGalpao,
    manutencoes: Manutencao[],
  ) {
    const dataAquisicao = e.dataAquisicao ? paraISO(e.dataAquisicao) : null;
    const ultimaPreventiva = manutencoes.find((m) => m.tipo === 'preventiva');
    const proxima = proximaPreventiva(
      e.periodicidadeDias,
      ultimaPreventiva && paraISO(ultimaPreventiva.data),
      dataAquisicao,
    );
    const parada = paradaAberta(manutencoes);
    const custoTotal = manutencoes.reduce(
      (s, m) =>
        s + Math.round((Number(m.custoPecas) + Number(m.custoMaoObra)) * 100),
      0,
    );
    return {
      id: e.id,
      nome: e.nome,
      tipo: e.tipo,
      galpaoId: e.galpaoId,
      galpao: e.galpao?.identificacao ?? null,
      numeroSerie: e.numeroSerie,
      fabricante: e.fabricante,
      modelo: e.modelo,
      critico: e.critico,
      periodicidadeDias: e.periodicidadeDias,
      dataAquisicao,
      situacao: e.situacao,
      paradoDesde: parada?.paradaInicio ?? null,
      ultimaManutencao: manutencoes[0] ? paraISO(manutencoes[0].data) : null,
      proximaPreventiva: proxima,
      situacaoPreventiva:
        e.situacao === 'inativo'
          ? 'sem_previsao'
          : situacaoPreventiva(proxima, hojeISO()),
      // O custo acumulado é informação financeira (docs/02-permissoes.md).
      custoTotal: pode(acesso.perfil, 'financeiro.ver')
        ? custoTotal / 100
        : null,
    };
  }

  private async validar(
    acesso: AcessoFazenda,
    dados: DadosEquipamento,
    equipamentoId?: string,
  ) {
    if (dados.dataAquisicao && dados.dataAquisicao > hojeISO()) {
      throw this.erroCampo(
        'dataAquisicao',
        'A data de aquisição não pode estar no futuro',
      );
    }
    if (dados.galpaoId) {
      const galpao = await this.prisma.galpao.findFirst({
        where: { id: dados.galpaoId, fazendaId: acesso.fazendaId },
      });
      if (!galpao || !podeVerGalpao(acesso, galpao.id))
        throw this.erroCampo('galpaoId', 'Galpão não encontrado');
    }
    if (dados.numeroSerie) {
      const mesmaSerie = await this.prisma.equipamento.findFirst({
        where: {
          fazendaId: acesso.fazendaId,
          numeroSerie: { equals: dados.numeroSerie, mode: 'insensitive' },
          ...(equipamentoId && { id: { not: equipamentoId } }),
        },
      });
      if (mesmaSerie) {
        throw new ConflictException(
          `O número de série ${dados.numeroSerie} já está no equipamento "${mesmaSerie.nome}"`,
        );
      }
    }
  }

  /** Quem só vê alguns galpões vê os equipamentos deles e os da fazenda inteira. */
  private filtroGalpoes(acesso: AcessoFazenda): Prisma.EquipamentoWhereInput {
    if (acesso.galpoes.length === 0) return {};
    return {
      OR: [{ galpaoId: null }, { galpaoId: { in: acesso.galpoes } }],
    };
  }

  private erroCampo(campo: string, mensagem: string) {
    return new BadRequestException({
      message: mensagem,
      erros: [{ campo, mensagem }],
    });
  }
}
