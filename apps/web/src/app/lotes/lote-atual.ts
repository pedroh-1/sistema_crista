import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Dialogos } from '../nucleo/dialogos';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { LoteDetalhe } from './tipos';

type EntidadeEstorno = 'baixa' | 'pesagem' | 'racao' | 'ocorrencia' | 'carga';

const NOME_ENTIDADE: Record<EntidadeEstorno, string> = {
  baixa: 'baixa',
  pesagem: 'pesagem',
  racao: 'lançamento de ração',
  ocorrencia: 'ocorrência',
  carga: 'carga',
};

/** Lote aberto, compartilhado entre as abas (fornecido pela página do lote). */
@Injectable()
export class LoteAtual {
  private readonly http = inject(HttpClient);
  private readonly dialogos = inject(Dialogos);
  private readonly fazenda = inject(FazendaAtual);

  readonly lote = signal<LoteDetalhe | null>(null);
  readonly url = computed(
    () => `${this.fazenda.url()}/lotes/${this.lote()?.id}`,
  );
  readonly emAndamento = computed(
    () => this.lote()?.situacao === 'em_andamento',
  );

  async carregar(id: string): Promise<void> {
    this.lote.set(
      await firstValueFrom(
        this.http.get<LoteDetalhe>(`${this.fazenda.url()}/lotes/${id}`),
      ),
    );
  }

  /** Recarrega os indicadores depois de um lançamento. */
  async recarregar(): Promise<void> {
    const id = this.lote()?.id;
    if (id) await this.carregar(id);
    // Os alertas (UC16) são avaliados pela fila logo depois do lançamento.
    setTimeout(
      () => void this.fazenda.recarregarAlertas().catch(() => undefined),
      2500,
    );
  }

  /** Estorna um lançamento pedindo o motivo ao usuário. */
  async estornar(
    entidade: EntidadeEstorno,
    idEvento: string,
  ): Promise<boolean> {
    const motivo = await this.dialogos.pedirMotivo(
      `Estornar ${NOME_ENTIDADE[entidade]}`,
      'O lançamento continua no histórico, riscado, com o motivo.',
    );
    if (!motivo) return false;
    await firstValueFrom(
      this.http.post(`${this.url()}/estornos`, { entidade, idEvento, motivo }),
    );
    await this.recarregar();
    return true;
  }
}
