import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Acao, pode } from '@crista/domain';
import { firstValueFrom } from 'rxjs';
import { Fazenda, Galpao } from '../nucleo/tipos';

/** Estado da fazenda aberta, compartilhado entre as abas (fornecido pela página da fazenda). */
@Injectable()
export class FazendaAtual {
  private readonly http = inject(HttpClient);

  readonly fazenda = signal<Fazenda | null>(null);
  readonly galpoes = signal<Galpao[]>([]);
  readonly url = computed(() => `/api/fazendas/${this.fazenda()?.id}`);

  /** Link absoluto dentro da fazenda, ex.: link('lotes', id). */
  link(...partes: string[]): string[] {
    return ['/fazendas', this.fazenda()?.id ?? '', ...partes];
  }

  async carregar(id: string): Promise<void> {
    const [fazenda, galpoes] = await Promise.all([
      firstValueFrom(this.http.get<Fazenda>(`/api/fazendas/${id}`)),
      firstValueFrom(this.http.get<Galpao[]>(`/api/fazendas/${id}/galpoes`)),
    ]);
    this.fazenda.set(fazenda);
    this.galpoes.set(galpoes);
  }

  async recarregarGalpoes(): Promise<void> {
    this.galpoes.set(
      await firstValueFrom(this.http.get<Galpao[]>(`${this.url()}/galpoes`)),
    );
  }

  /** Matriz de permissões (docs/02-permissoes.md), a mesma usada pela API. */
  pode(acao: Acao): boolean {
    const fazenda = this.fazenda();
    return fazenda !== null && pode(fazenda.perfil, acao);
  }
}
