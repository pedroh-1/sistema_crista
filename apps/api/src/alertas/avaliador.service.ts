import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  avaliarLimite,
  CONFIG_INDICADOR,
  Criticidade,
  hojeISO,
  idadeDias,
  INDICADORES_DO_LOTE,
  IndicadorDoLote,
  Indicador,
  Limites,
  limitesEfetivos,
} from '@crista/domain';
import { FilaService } from '../fila/fila.service';
import { TAREFA_AVALIAR_LOTE, TAREFA_NOTIFICAR } from '../fila/tarefas';
import { PrismaService } from '../prisma/prisma.service';
import { DadosLote } from '../producao/dados-lote';
import { metaDoLote } from '../producao/indicadores';
import { paraData } from '../producao/lote-contexto';
import { resumoDoLote } from '../producao/resumo';

const numero = (v: number, casas = 2) =>
  v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/**
 * UC16: compara os indicadores do lote com os limites (configurados ou padrão)
 * e abre ou atualiza o alerta. Alerta crítico gera tarefa de notificação.
 * Roda pela fila, nunca dentro da requisição que lançou o dado.
 */
@Injectable()
export class AvaliadorAlertas implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fila: FilaService,
    private readonly dadosLote: DadosLote,
  ) {}

  onModuleInit(): void {
    this.fila.registrar(TAREFA_AVALIAR_LOTE, (p) =>
      this.avaliarLote(String(p['loteId']), String(p['data'] ?? hojeISO())),
    );
  }

  async avaliarLote(loteId: string, data: string): Promise<void> {
    const lote = await this.prisma.lote.findUnique({ where: { id: loteId } });
    if (!lote || lote.situacao !== 'em_andamento') return;

    const dados = await this.dadosLote.carregar(lote, data);
    const resumo = resumoDoLote(dados.entrada);
    const meta = metaDoLote(dados);
    const idade = idadeDias(
      dados.entrada.dataAlojamento,
      data,
      lote.idadeInicialDias,
    );
    const ultimaPesagem = resumo.ultimaPesagem ?? data;

    const valores: Record<IndicadorDoLote, { valor: Indicador; data: string }> =
      {
        mortalidade_dia: { valor: resumo.mortalidadeHoje.percentual, data },
        desvio_peso: { valor: meta.desvioCurva, data: ultimaPesagem },
        uniformidade: { valor: resumo.uniformidade, data: ultimaPesagem },
      };
    const regras = await this.prisma.regraAlerta.findMany({
      where: { fazendaId: lote.fazendaId },
    });

    for (const indicador of INDICADORES_DO_LOTE) {
      const { valor, data: dataReferencia } = valores[indicador];
      if (!valor.disponivel) continue;
      const regra = regras.find((r) => r.indicador === indicador);
      const configurado: Limites | null = regra
        ? {
            atencao: Number(regra.limiteAtencao),
            critico: Number(regra.limiteCritico),
          }
        : null;
      const limites = limitesEfetivos(indicador, configurado, idade);
      const nivel = avaliarLimite(
        valor.valor,
        limites,
        CONFIG_INDICADOR[indicador].direcao,
      );
      if (nivel === 'normal') continue;
      await this.abrirOuAtualizar({
        lote,
        indicador,
        criticidade: nivel,
        valor: valor.valor,
        limite: nivel === 'critico' ? limites.critico : limites.atencao,
        limitePadrao: configurado === null,
        dataReferencia,
      });
    }
  }

  private async abrirOuAtualizar(a: {
    lote: { id: string; fazendaId: string; galpaoId: string; codigo: string };
    indicador: IndicadorDoLote;
    criticidade: Criticidade;
    valor: number;
    limite: number;
    limitePadrao: boolean;
    dataReferencia: string;
  }) {
    const cfg = CONFIG_INDICADOR[a.indicador];
    const mensagem =
      `${cfg.nome} em ${numero(a.valor)}${cfg.unidade} no lote ${a.lote.codigo} ` +
      `(limite ${a.criticidade === 'critico' ? 'crítico' : 'de atenção'} ${numero(a.limite)}${cfg.unidade}` +
      `${a.limitePadrao ? ', padrão provisório' : ''})`;

    await this.prisma.$transaction(async (tx) => {
      const aberto = await tx.alerta.findFirst({
        where: { loteId: a.lote.id, indicador: a.indicador, status: 'aberto' },
      });
      // Não rebaixa: um alerta crítico aberto continua crítico até alguém fechá-lo.
      const criticidade =
        aberto?.criticidade === 'critico' ? 'critico' : a.criticidade;
      const dados = {
        criticidade,
        valor: a.valor,
        limite: a.limite,
        limitePadrao: a.limitePadrao,
        dataReferencia: paraData(a.dataReferencia),
        mensagem,
      };
      const alerta = aberto
        ? await tx.alerta.update({ where: { id: aberto.id }, data: dados })
        : await tx.alerta.create({
            data: {
              ...dados,
              fazendaId: a.lote.fazendaId,
              loteId: a.lote.id,
              galpaoId: a.lote.galpaoId,
              indicador: a.indicador,
            },
          });
      const ficouCritico =
        criticidade === 'critico' && aberto?.criticidade !== 'critico';
      if (ficouCritico)
        await this.fila.enfileirar(tx, TAREFA_NOTIFICAR, {
          alertaId: alerta.id,
        });
    });
  }
}
