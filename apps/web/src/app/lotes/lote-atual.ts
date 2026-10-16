import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FazendaAtual } from '../fazendas/fazenda-atual';
import { LoteDetalhe } from './tipos';

/** Lote aberto, compartilhado entre as abas (fornecido pela página do lote). */
@Injectable()
export class LoteAtual {
  private readonly http = inject(HttpClient);
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
  }

  /** Estorna um lançamento pedindo o motivo ao usuário. */
  async estornar(
    entidade: 'baixa' | 'pesagem' | 'racao' | 'ocorrencia',
    idEvento: string,
  ): Promise<boolean> {
    const motivo = prompt(
      'Motivo da correção (o lançamento continua no histórico como estornado):',
    );
    if (!motivo || motivo.trim().length < 3) return false;
    await firstValueFrom(
      this.http.post(`${this.url()}/estornos`, {
        entidade,
        idEvento,
        motivo: motivo.trim(),
      }),
    );
    await this.recarregar();
    return true;
  }
}
