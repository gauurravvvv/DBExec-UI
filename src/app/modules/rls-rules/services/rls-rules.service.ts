import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { RLS_RULE } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class RlsRulesService {
  constructor(private http: HttpClient) {}

  listRules(orgId: string, datasetId: string) {
    return this.http
      .get(RLS_RULE.LIST + `${orgId}/${datasetId}`)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  viewRule(orgId: string, ruleId: string) {
    return this.http
      .get(RLS_RULE.VIEW + `${orgId}/${ruleId}`)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  addRule(payload: any) {
    return this.http
      .post(RLS_RULE.ADD, payload)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  updateRule(payload: any) {
    return this.http
      .put(RLS_RULE.UPDATE, payload)
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }

  deleteRule(orgId: string, ruleId: string, justification?: string) {
    return this.http
      .request('DELETE', RLS_RULE.DELETE + `${orgId}/${ruleId}`, {
        body: { justification },
      })
      .toPromise()
      .then((response: any) => JSON.parse(JSON.stringify(response)));
  }
}
