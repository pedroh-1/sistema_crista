import { HttpClient } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { catchError, map, of } from 'rxjs';

type StatusApi = 'verificando' | 'ok' | 'banco indisponível' | 'fora do ar';

@Component({
  imports: [RouterModule],
  selector: 'crista-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly http = inject(HttpClient);

  protected readonly statusApi = toSignal(
    this.http.get('/api/health').pipe(
      map((): StatusApi => 'ok'),
      catchError((erro) =>
        of<StatusApi>(
          erro.status === 503 ? 'banco indisponível' : 'fora do ar',
        ),
      ),
    ),
    { initialValue: 'verificando' as StatusApi },
  );

  protected readonly apiOk = computed(() => this.statusApi() === 'ok');
}
