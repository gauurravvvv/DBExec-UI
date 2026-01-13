import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { PROMPT } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class PromptService {
  constructor(private http: HttpClient) {}

  listPrompt(params: any) {
    return this.http
      .get(PROMPT.LIST + `/${params.orgId}/${params.sectionId}`)
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deletePrompt(orgId: string, id: string) {
    return this.http
      .delete(PROMPT.DELETE + `${orgId}/${id}`)
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addPrompt(promptForm: any) {
    const { organisation, database, tab, prompts } = promptForm;
    return this.http
      .post(PROMPT.ADD, {
        organisation,
        database,
        tab,
        prompts,
      })
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewPrompt(orgId: string, id: string) {
    return this.http
      .get(PROMPT.VIEW + `${orgId}/${id}`)
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updatePrompt(promptForm: FormGroup) {
    const {
      id,
      organisation,
      database,
      tab,
      section,
      name,
      description,
      status,
    } = promptForm.value;
    return this.http
      .put(PROMPT.UPDATE, {
        id,
        organisation,
        database,
        tab,
        section,
        name,
        description,
        status: status ? 1 : 0,
      })
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  configPrompt(promptConfigData: any) {
    const {
      id,
      organisation,
      schema,
      tables,
      columns,
      promptJoin,
      promptWhere,
      promptValues,
      promptSql,
      promptValueSQL,
    } = promptConfigData;
    return this.http
      .post(PROMPT.CONFIG, {
        id,
        organisation,
        schema,
        tables,
        columns,
        promptJoin,
        promptWhere,
        promptValues,
        promptSql,
        promptValueSQL,
      })
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getConfig(orgId: string, id: string) {
    return this.http
      .get(PROMPT.GET_CONFIG + `${orgId}/${id}`)
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getPromptValuesBySQL(params: any) {
    return this.http
      .post(PROMPT.GET_PROMPT_VALUES_BY_SQL, {
        orgId: params.orgId,
        databaseId: params.databaseId,
        query: params.query,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  refreshPromptValuesBySQL(params: any) {
    return this.http
      .put(PROMPT.REFRSH_PROMPT_VALUES_BY_SQL, {
        organisation: params.orgId,
        databaseId: params.databaseId,
        promptId: params.promptId,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
