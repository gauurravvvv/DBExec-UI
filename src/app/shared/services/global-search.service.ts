import { Injectable, signal } from '@angular/core';
import { lastValueFrom, Subject } from 'rxjs';
import { GLOBAL_SEARCH } from 'src/app/core/constants';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class GlobalSearchService {
  private openSearchSubject = new Subject<void>();
  openSearch$ = this.openSearchSubject.asObservable();

  private readonly _results = signal<any[]>([]);
  private readonly _loading = signal(false);

  readonly results = this._results.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClientService) {}

  openSearch() {
    this.openSearchSubject.next();
  }

  async globalSearch(param: any) {
    const { key } = param;
    // Org id sourced from the signed JWT on the server — no client
    // override needed (and SanitizeOrgInputMiddleware would strip it
    // anyway).
    this._loading.set(true);
    try {
      const response = await lastValueFrom(
        this.http.apiPost(GLOBAL_SEARCH.SEARCH, { key }),
      );
      return response;
    } finally {
      this._loading.set(false);
    }
  }

  setResults(results: any[]) {
    this._results.set(results);
  }

  clearResults() {
    this._results.set([]);
    this._loading.set(false);
  }
}
