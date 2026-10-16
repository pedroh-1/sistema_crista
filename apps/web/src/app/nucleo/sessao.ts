import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { FazendaResumo, Usuario } from './tipos';

const CHAVE_TOKEN = 'crista.token';

function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class Sessao {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(lerToken());
  readonly usuario = signal<Usuario | null>(null);
  readonly fazendas = signal<FazendaResumo[]>([]);
  readonly logado = computed(() => this.token() !== null);

  async entrar(email: string, senha: string): Promise<void> {
    const resposta = await firstValueFrom(
      this.http.post<{ accessToken: string; usuario: Usuario }>(
        '/api/auth/login',
        { email, senha },
      ),
    );
    this.guardarToken(resposta.accessToken);
    await this.carregar();
  }

  /** Recarrega o usuário e as fazendas a que ele tem acesso. */
  async carregar(): Promise<void> {
    const eu = await firstValueFrom(
      this.http.get<Usuario & { fazendas: FazendaResumo[] }>('/api/auth/eu'),
    );
    this.usuario.set({ id: eu.id, nome: eu.nome, email: eu.email });
    this.fazendas.set(eu.fazendas);
  }

  sair(): void {
    this.guardarToken(null);
    this.usuario.set(null);
    this.fazendas.set([]);
    void this.router.navigate(['/entrar']);
  }

  private guardarToken(token: string | null): void {
    this.token.set(token);
    try {
      if (token) localStorage.setItem(CHAVE_TOKEN, token);
      else localStorage.removeItem(CHAVE_TOKEN);
    } catch {
      // Sem armazenamento (aba anônima): a sessão dura até fechar a aba.
    }
  }
}
