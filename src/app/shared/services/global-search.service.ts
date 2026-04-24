import { Injectable } from '@angular/core';
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

  constructor(
    private http: HttpClientService,
    private globalService: GlobalService,
  ) {}

  openSearch() {
    this.openSearchSubject.next();
  }

  globalSearch(param: any) {
    const { key } = param;
    const organisationId = this.globalService.getTokenDetails('organisationId');
    return lastValueFrom(this.http.apiPost(GLOBAL_SEARCH.SEARCH, {
      organisation: organisationId,
      key,
    }));
  }
}
