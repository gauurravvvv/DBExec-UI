import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { QUERY_BUILDER, TAB, SECTION } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

export interface ExecuteQueryBuilderRequest {
  queryBuilderId: string;
  organisation: string;
  prompts: {
    promptId: string;
    type: string;
    value: any;
    isRange: boolean;
    startValue: any;
    endValue: any;
  }[];
}

@Injectable({
  providedIn: 'root',
})
export class QueryBuilderService {
  constructor(private http: HttpClientService) {}

  listQueryBuilder(params: any) {
    return lastValueFrom(this.http.apiGet(QUERY_BUILDER.LIST, { params }));
  }

  deleteQueryBuilder(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(QUERY_BUILDER.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  bulkDeleteQueryBuilder(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(QUERY_BUILDER.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  addQueryBuilder(queryBuilderForm: FormGroup) {
    const { organisation, datasource, name, description } = queryBuilderForm.value;
    return lastValueFrom(this.http.apiPost(QUERY_BUILDER.ADD, {
      organisation, datasource, name, description,
    }));
  }

  viewQueryBuilder(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(QUERY_BUILDER.VIEW + `${orgId}/${id}`));
  }

  updateQueryBuilder(queryBuilderForm: FormGroup, justification?: string) {
    const { id, name, description, organisation, datasource, status } = queryBuilderForm.getRawValue();
    return lastValueFrom(this.http.apiPut(QUERY_BUILDER.UPDATE, {
      id, name, description, organisation, datasource,
      status: status ? 1 : 0,
      justification,
    }));
  }

  saveQueryBuilderConfiguration(
    configuration: any,
    organisation: string,
    datasourceId: string,
    queryBuilderId: string,
  ) {
    return lastValueFrom(this.http.apiPost(QUERY_BUILDER.SAVE_CONFIGURATION, {
      configuration, organisation, datasourceId, queryBuilderId,
    }));
  }

  getQueryBuilderConfiguration(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(QUERY_BUILDER.GET_QUERY_BUILDER_CONFIGURATION + `${orgId}/${id}`));
  }

  getQueryBuilderTabs(orgId: string, queryBuilderId: string) {
    return lastValueFrom(this.http.apiGet(QUERY_BUILDER.GET_TABS + `${orgId}/${queryBuilderId}`));
  }

  getTabSections(orgId: string, queryBuilderId: string, tabId: string) {
    return lastValueFrom(this.http.apiGet(TAB.GET_SECTIONS + `${orgId}/${queryBuilderId}/${tabId}`));
  }

  getSectionPrompts(orgId: string, queryBuilderId: string, tabId: string, sectionId: string) {
    return lastValueFrom(this.http.apiGet(
      SECTION.GET_PROMPTS + `${orgId}/${queryBuilderId}/${tabId}/${sectionId}`,
    ));
  }

  getQueryBuilderStructure(orgId: string, queryBuilderId: string) {
    return lastValueFrom(this.http.apiGet(QUERY_BUILDER.GET_STRUCTURE + `${orgId}/${queryBuilderId}`));
  }

  executeQueryBuilder(payload: ExecuteQueryBuilderRequest) {
    return lastValueFrom(this.http.apiPost(QUERY_BUILDER.EXECUTE, payload));
  }
}
