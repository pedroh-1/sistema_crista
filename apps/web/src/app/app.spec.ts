import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { Sessao } from './nucleo/sessao';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('mostra a marca e, sem login, não mostra usuário', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.marca')?.textContent).toContain('CRISTA');
    expect(html.querySelector('.usuario')).toBeNull();
  });

  it('depois do login mostra o nome do usuário', async () => {
    const fixture = TestBed.createComponent(App);
    const sessao = TestBed.inject(Sessao);
    const http = TestBed.inject(HttpTestingController);

    const entrando = sessao.entrar('ana@granja.com', 'galinha123');
    http.expectOne('/api/auth/login').flush({
      accessToken: 'tkn',
      usuario: { id: '1', nome: 'Ana', email: 'ana@granja.com' },
    });
    await Promise.resolve();
    const eu = http.expectOne('/api/auth/eu');
    expect(eu.request.headers.get('Authorization')).toBeNull(); // sem interceptor neste teste
    eu.flush({ id: '1', nome: 'Ana', email: 'ana@granja.com', fazendas: [] });
    await entrando;

    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.usuario')
        ?.textContent,
    ).toContain('Ana');
  });
});
