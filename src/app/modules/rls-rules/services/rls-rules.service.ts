import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { RLS_RULE } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class RlsRulesService {
  constructor(private http: HttpClientService) {}

  listRules(orgId: string, datasourceId: string, params?: any) {
    return lastValueFrom(this.http.apiGet(RLS_RULE.LIST, { params: { orgId, datasourceId, ...params } }));
  }

  viewRule(orgId: string, ruleId: string) {
    return lastValueFrom(this.http.apiGet(RLS_RULE.VIEW + `${orgId}/${ruleId}`));
  }

  addRule(payload: any) {
    return lastValueFrom(this.http.apiPost(RLS_RULE.ADD, payload));
  }

  updateRule(payload: any) {
    return lastValueFrom(this.http.apiPut(RLS_RULE.UPDATE, payload));
  }

  deleteRule(orgId: string, ruleId: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(RLS_RULE.DELETE + `${orgId}/${ruleId}`, { body: { justification } }));
  }

  listAssignments(orgId: string, ruleId: string) {
    return lastValueFrom(this.http.apiGet(RLS_RULE.LIST_ASSIGNMENTS + `${orgId}/${ruleId}`));
  }

  addAssignment(payload: any) {
    return lastValueFrom(this.http.apiPost(RLS_RULE.ADD_ASSIGNMENT, payload));
  }

  deleteAssignment(orgId: string, assignmentId: string) {
    return lastValueFrom(this.http.apiDelete(RLS_RULE.DELETE_ASSIGNMENT + `${orgId}/${assignmentId}`, { body: {} }));
  }
}
