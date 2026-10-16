import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { avesAlojadas, cargaSchema, encerramentoSchema } from '@crista/domain';
import { z } from 'zod';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AcessoFazenda } from '../fazendas/acesso-fazenda.guard';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DadosLote } from './dados-lote';
import { ResultadoEncerramento, resultadoDoEncerramento } from './indicadores';
import {
  ConfirmacaoNecessaria,
  estornoParaResposta,
  LoteContexto,
  paraData,
  paraISO,
} from './lote-contexto';
import { carenciaVigenteAte, resumoDoLote } from './resumo';

type DadosCarga = z.output<typeof cargaSchema>;
type DadosEncerramento = z.output<typeof encerramentoSchema>;

@Injectable()
export class EncerramentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly contexto: LoteContexto,
    private readonly dadosLote: DadosLote,
  ) {}

  /**
   * UC17: saída de uma carga. Não passa do saldo e é bloqueada enquanto houver
   * carência vigente (inconsistência #5).
   */
  async registrarCarga(
    acesso: AcessoFazenda,
    loteId: string,
    dados: DadosCarga,
  ) {
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    this.contexto.validarData(lote, dados.data);
    const alojamento = await this.prisma.alojamento.findUnique({
      where: { loteId },
    });
    if (!alojamento)
      throw new ConflictException(
        'Registre o alojamento antes da saída das aves',
      );

    const completo = await this.dadosLote.carregar(lote);
    const carenciaAte = carenciaVigenteAte(
      completo.entrada.ocorrencias,
      dados.data,
    );
    if (carenciaAte) {
      throw new ConflictException(
        `Aves em período de carência até ${paraBR(carenciaAte)}: a saída para abate não é permitida antes disso`,
      );
    }

    const alojadas = avesAlojadas(
      alojamento.avesRecebidas,
      alojamento.mortasTransporte,
    );
    const validos = await this.contexto.filtroValidos(acesso.fazendaId);
    const carga = await this.prisma.$transaction(async (tx) => {
      // Mesmo lock das baixas: saídas e mortes do lote nunca passam juntas do saldo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${loteId}))`;
      const [baixas, saidas] = await Promise.all([
        tx.eventoBaixa.aggregate({
          where: { loteId, ...validos },
          _sum: { mortes: true, descartes: true },
        }),
        tx.saidaCarga.aggregate({
          where: { loteId, ...validos },
          _sum: { aves: true },
        }),
      ]);
      const saldo =
        alojadas -
        (baixas._sum.mortes ?? 0) -
        (baixas._sum.descartes ?? 0) -
        (saidas._sum.aves ?? 0);
      if (dados.aves > saldo)
        throw new ConflictException(
          `A carga (${dados.aves} aves) passa do saldo atual (${saldo})`,
        );

      const criada = await tx.saidaCarga.create({
        data: {
          ...dados,
          data: paraData(dados.data),
          fazendaId: acesso.fazendaId,
          loteId,
          criadoPorId: acesso.usuarioId,
        },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'criar',
          entidade: 'carga',
          idEntidade: criada.id,
          depois: criada,
        },
        tx,
      );
      return { id: criada.id, saldoAves: saldo - dados.aves };
    });
    return carga;
  }

  async listarCargas(acesso: AcessoFazenda, loteId: string) {
    await this.contexto.carregar(acesso, loteId);
    const cargas = await this.prisma.saidaCarga.findMany({
      where: { loteId },
      orderBy: [{ data: 'desc' }, { registradoEm: 'desc' }],
    });
    const estornos = await this.prisma.estorno.findMany({
      where: { idEvento: { in: cargas.map((c) => c.id) } },
    });
    const porId = new Map(estornos.map((e) => [e.idEvento, e]));
    return cargas.map((c) => ({
      id: c.id,
      data: paraISO(c.data),
      aves: c.aves,
      pesoTotalKg: Number(c.pesoTotalKg),
      pesoMedioKg: Number(c.pesoTotalKg) / c.aves,
      precoKg: c.precoKg === null ? null : Number(c.precoKg),
      destino: c.destino,
      numeroGta: c.numeroGta,
      estorno: estornoParaResposta(porId.get(c.id)),
    }));
  }

  /**
   * UC17: consolida o resultado, libera o galpão e deixa o lote só para consulta.
   * Com pendências, só encerra se confirmado, e o relatório sai como parcial.
   */
  async encerrar(
    acesso: AcessoFazenda,
    loteId: string,
    dados: DadosEncerramento,
  ) {
    const lote = await this.contexto.carregar(acesso, loteId, {
      paraLancamento: true,
    });
    this.contexto.validarData(lote, dados.data);
    const completo = await this.dadosLote.carregar(lote, dados.data);
    const ultimaCarga = (completo.entrada.cargas ?? [])
      .map((c) => c.data)
      .sort()
      .at(-1);
    if (ultimaCarga && dados.data < ultimaCarga) {
      throw new BadRequestException({
        message: `O encerramento não pode ser antes da última carga (${paraBR(ultimaCarga)})`,
        erros: [{ campo: 'data', mensagem: 'Data anterior à última carga' }],
      });
    }

    const pendencias = await this.pendencias(lote.id, completo);
    if (pendencias.length > 0 && !dados.confirmarParcial) {
      throw new ConfirmacaoNecessaria(
        'PENDENCIAS',
        `O lote tem pendências:\n- ${pendencias.join('\n- ')}\n\nEncerrar mesmo assim? O relatório sairá como parcial.`,
        { pendencias },
      );
    }

    const resultado = resultadoDoEncerramento(
      this.dadosLote.cortarEm(completo, dados.data),
    );
    await this.prisma.$transaction(async (tx) => {
      const encerramento = await tx.encerramentoLote.create({
        data: {
          fazendaId: acesso.fazendaId,
          loteId,
          dataEncerramento: paraData(dados.data),
          parcial: pendencias.length > 0,
          pendencias,
          resultado: JSON.parse(
            JSON.stringify(resultado),
          ) as Prisma.InputJsonValue,
          encerradoPorId: acesso.usuarioId,
        },
      });
      await tx.lote.update({
        where: { id: loteId },
        data: { situacao: 'encerrado' },
      });
      await tx.galpao.update({
        where: { id: lote.galpaoId },
        data: { situacao: 'disponivel' },
      });
      await this.auditoria.registrar(
        {
          fazendaId: acesso.fazendaId,
          usuarioId: acesso.usuarioId,
          acao: 'encerrar',
          entidade: 'lote',
          idEntidade: loteId,
          depois: {
            idEncerramento: encerramento.id,
            parcial: pendencias.length > 0,
            pendencias,
          },
        },
        tx,
      );
    });
    return this.encerramento(loteId);
  }

  /** Encerramento gravado do lote, ou nulo. */
  async encerramento(loteId: string) {
    const e = await this.prisma.encerramentoLote.findUnique({
      where: { loteId },
    });
    if (!e) return null;
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: e.encerradoPorId },
      select: { nome: true },
    });
    return {
      data: paraISO(e.dataEncerramento),
      parcial: e.parcial,
      pendencias: e.pendencias as string[],
      resultado: e.resultado as unknown as ResultadoEncerramento,
      encerradoPor: usuario?.nome ?? null,
      encerradoEm: e.encerradoEm,
    };
  }

  private async pendencias(
    loteId: string,
    dados: Awaited<ReturnType<DadosLote['carregar']>>,
  ): Promise<string[]> {
    const resumo = resumoDoLote(dados.entrada);
    const lista: string[] = [];
    if (!dados.entrada.alojamento) lista.push('Alojamento não registrado');
    if ((dados.entrada.cargas ?? []).length === 0)
      lista.push('Nenhuma carga de saída registrada');
    if (resumo.saldoAves !== null && resumo.saldoAves > 0) {
      lista.push(
        `${resumo.saldoAves.toLocaleString('pt-BR')} aves ainda no lote, sem carga de saída nem baixa`,
      );
    }
    if (
      resumo.carenciaAte &&
      resumo.saldoAves !== null &&
      resumo.saldoAves > 0
    ) {
      lista.push(`Aves em carência até ${paraBR(resumo.carenciaAte)}`);
    }
    const [alertas, emRevisao] = await Promise.all([
      this.prisma.alerta.count({ where: { loteId, status: 'aberto' } }),
      Promise.all([
        this.prisma.eventoBaixa.count({
          where: { loteId, status: 'pendente_revisao' },
        }),
        this.prisma.pesagem.count({
          where: { loteId, status: 'pendente_revisao' },
        }),
        this.prisma.saidaCarga.count({
          where: { loteId, status: 'pendente_revisao' },
        }),
      ]).then((n) => n.reduce((s, x) => s + x, 0)),
    ]);
    if (alertas > 0) lista.push(`${alertas} alerta(s) de desvio aberto(s)`);
    if (emRevisao > 0)
      lista.push(`${emRevisao} lançamento(s) do app aguardando revisão`);
    if (!dados.entrada.movimentosRacao.some((m) => m.tipo === 'entrada'))
      lista.push('Nenhuma entrada de ração registrada');
    return lista;
  }
}

const paraBR = (iso: string) => iso.split('-').reverse().join('/');
