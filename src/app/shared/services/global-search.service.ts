import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { GLOBAL_SEARCH } from 'src/app/constants';

@Injectable({
  providedIn: 'root',
})
export class GlobalSearchService {
  private openSearchSubject = new Subject<void>();
  openSearch$ = this.openSearchSubject.asObservable();

  constructor(private http: HttpClient) {}

  openSearch() {
    this.openSearchSubject.next();
  }

  globalSearch(param: any) {
    const { organisation, key } = param;
    return this.http
      .post(GLOBAL_SEARCH.SEARCH, {
        organisation: 2,
        key,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
