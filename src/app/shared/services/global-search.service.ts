import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { GLOBAL_SEARCH } from 'src/app/constants';
import { GlobalService } from 'src/app/core/services/global.service';

@Injectable({
  providedIn: 'root',
})
export class GlobalSearchService {
  private openSearchSubject = new Subject<void>();
  openSearch$ = this.openSearchSubject.asObservable();

  constructor(
    private http: HttpClient,
    private globalService: GlobalService,
  ) {}

  openSearch() {
    this.openSearchSubject.next();
  }

  globalSearch(param: any) {
    const { key } = param;
    const organisationId = this.globalService.getTokenDetails('organisationId');
    return this.http
      .post(GLOBAL_SEARCH.SEARCH, {
        organisation: organisationId,
        key,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
