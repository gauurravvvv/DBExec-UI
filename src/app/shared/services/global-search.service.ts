import { Injectable, signal } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { Subject } from 'rxjs';
import { GLOBAL_SEARCH } from 'src/app/constants';
import { GlobalService } from 'src/app/core/services/global.service';
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

  constructor(
    private http: HttpClientService,
    private globalService: GlobalService,
  ) {}

  openSearch() {
    this.openSearchSubject.next();
  }

  async globalSearch(param: any) {
    const { key } = param;
    const organisationId = this.globalService.getTokenDetails('organisationId');
    this._loading.set(true);
    try {
      const response = await lastValueFrom(
        this.http.apiPost(GLOBAL_SEARCH.SEARCH, {
          organisation: organisationId,
          key,
        }),
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
