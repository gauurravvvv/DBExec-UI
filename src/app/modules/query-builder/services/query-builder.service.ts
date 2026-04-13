import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { QUERY_BUILDER, TAB, SECTION } from 'src/app/constants/api';

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
  constructor(private http: HttpClient) {}

  listQueryBuilder(params: any) {
    return this.http
      .get(QUERY_BUILDER.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteQueryBuilder(orgId: string, id: string, justification?: string) {
    return this.http
      .request('DELETE', QUERY_BUILDER.DELETE + `${orgId}/${id}`, {
        body: { justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  bulkDeleteQueryBuilder(ids: string[], justification: string | undefined, orgId: string) {
    return this.http
      .request('DELETE', QUERY_BUILDER.BULK_DELETE + orgId, {
        body: { ids, justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addQueryBuilder(queryBuilderForm: FormGroup) {
    const { organisation, datasource, name, description } =
      queryBuilderForm.value;
    return this.http
      .post(QUERY_BUILDER.ADD, {
        organisation,
        datasource,
        name,
        description,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewQueryBuilder(orgId: string, id: string) {
    return this.http
      .get(QUERY_BUILDER.VIEW + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateQueryBuilder(queryBuilderForm: FormGroup, justification?: string) {
    const { id, name, description, organisation, datasource, status } =
      queryBuilderForm.getRawValue();
    return this.http
      .put(QUERY_BUILDER.UPDATE, {
        id,
        name,
        description,
        organisation,
        datasource,
        status: status ? 1 : 0,
        justification,
      })
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  saveQueryBuilderConfiguration(
    configuration: any,
    organisation: string,
    datasourceId: string,
    queryBuilderId: string,
  ) {
    return this.http
      .post(QUERY_BUILDER.SAVE_CONFIGURATION, {
        configuration,
        organisation,
        datasourceId,
        queryBuilderId,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getQueryBuilderConfiguration(orgId: string, id: string) {
    return this.http
      .get(QUERY_BUILDER.GET_QUERY_BUILDER_CONFIGURATION + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getQueryBuilderTabs(orgId: string, queryBuilderId: string) {
    return this.http
      .get(QUERY_BUILDER.GET_TABS + `${orgId}/${queryBuilderId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getTabSections(orgId: string, queryBuilderId: string, tabId: string) {
    return this.http
      .get(TAB.GET_SECTIONS + `${orgId}/${queryBuilderId}/${tabId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getSectionPrompts(
    orgId: string,
    queryBuilderId: string,
    tabId: string,
    sectionId: string,
  ) {
    return this.http
      .get(
        SECTION.GET_PROMPTS +
          `${orgId}/${queryBuilderId}/${tabId}/${sectionId}`,
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getQueryBuilderStructure(orgId: string, queryBuilderId: string) {
    return this.http
      .get(QUERY_BUILDER.GET_STRUCTURE + `${orgId}/${queryBuilderId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  executeQueryBuilder(payload: ExecuteQueryBuilderRequest) {
    return this.http
      .post(QUERY_BUILDER.EXECUTE, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
