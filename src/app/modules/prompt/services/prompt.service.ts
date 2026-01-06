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
}
