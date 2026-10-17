import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tratador = (payload: Prisma.JsonObject) => Promise<void>;

const MAXIMO_TENTATIVAS = 5;
const INTERVALO_MS = 1000;

/**
 * Fila de tarefas sobre o PostgreSQL (padrão outbox), no lugar do pg-boss, que
 * passou a ser só ESM (ADR 0001). A tarefa é gravada na mesma transação do
 * lançamento e executada depois por este processo: um pico de alertas não
 * atrasa nem derruba o registro do lote (RNF07).
 */
@Injectable()
export class FilaService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FilaService.name);
  private readonly tratadores = new Map<string, Tratador>();
  private relogio?: NodeJS.Timeout;
  private ocupado = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Grava a tarefa junto com o lançamento (mesma transação). */
  enfileirar(
    tx: Prisma.TransactionClient,
    tipo: string,
    payload: Prisma.JsonObject,
  ) {
    return tx.tarefa.create({ data: { tipo, payload } });
  }

  registrar(tipo: string, tratador: Tratador): void {
    this.tratadores.set(tipo, tratador);
  }

  onApplicationBootstrap(): void {
    // Nos testes a fila é processada sob demanda (FILA_WORKER=desligado).
    if (this.config.get('FILA_WORKER') === 'desligado') return;
    this.relogio = setInterval(
      () => void this.processarPendentes(),
      INTERVALO_MS,
    );
  }

  /** No desligamento, espera (até 10 s) o lote de tarefas em andamento terminar. */
  async onModuleDestroy(): Promise<void> {
    if (this.relogio) clearInterval(this.relogio);
    const limite = Date.now() + 10_000;
    while (this.ocupado && Date.now() < limite)
      await new Promise((r) => setTimeout(r, 100));
  }

  /** Executa até `limite` tarefas disponíveis. Devolve quantas rodaram. */
  async processarPendentes(limite = 20): Promise<number> {
    if (this.ocupado) return 0;
    this.ocupado = true;
    try {
      // SKIP LOCKED: vários processos da API podem rodar a fila sem pegar a mesma tarefa.
      const tarefas = await this.prisma.$queryRaw<
        {
          id: string;
          tipo: string;
          payload: Prisma.JsonObject;
          tentativas: number;
        }[]
      >`
        UPDATE fila.tarefa
        SET status = 'processando', tentativas = tentativas + 1,
            -- Reserva de 5 min: se o processo cair no meio, a tarefa volta a ficar disponível.
            disponivel_em = (now() AT TIME ZONE 'UTC') + interval '5 minutes'
        WHERE id IN (
          SELECT id FROM fila.tarefa
          -- O Prisma grava timestamp sem fuso em UTC; now() viria no fuso da sessão.
          WHERE status IN ('pendente', 'processando') AND disponivel_em <= (now() AT TIME ZONE 'UTC')
          ORDER BY criado_em
          LIMIT ${limite}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, tipo, payload, tentativas`;
      for (const t of tarefas) await this.executar(t);
      return tarefas.length;
    } finally {
      this.ocupado = false;
    }
  }

  /** Processa até a fila esvaziar (inclusive tarefas criadas por outras tarefas). */
  async esvaziar(): Promise<void> {
    while ((await this.processarPendentes()) > 0) {
      // continua
    }
  }

  private async executar(t: {
    id: string;
    tipo: string;
    payload: Prisma.JsonObject;
    tentativas: number;
  }) {
    const tratador = this.tratadores.get(t.tipo);
    try {
      if (!tratador) throw new Error(`Tarefa sem tratador: ${t.tipo}`);
      await tratador(t.payload);
      await this.prisma.tarefa.update({
        where: { id: t.id },
        data: { status: 'concluida', concluidaEm: new Date(), erro: null },
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      const desistir = t.tentativas >= MAXIMO_TENTATIVAS;
      this.logger.warn(
        `Tarefa ${t.tipo} ${t.id} falhou (tentativa ${t.tentativas}): ${mensagem}`,
      );
      await this.prisma.tarefa.update({
        where: { id: t.id },
        data: {
          status: desistir ? 'falhou' : 'pendente',
          erro: mensagem.slice(0, 1000),
          // Espera crescente: 10 s, 20 s, 40 s, 80 s
          disponivelEm: new Date(Date.now() + 10_000 * 2 ** (t.tentativas - 1)),
        },
      });
    }
  }
}
