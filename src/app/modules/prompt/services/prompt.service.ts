import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { PROMPT, SUPER_ADMIN } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class PromptService {
  constructor(private http: HttpClient) {}

  listPrompt(params: any) {
    return this.http
      .get(PROMPT.LIST + `/${params.orgId}/${params.sectionId}`)
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  deletePrompt(orgId: string, id: string) {
    return this.http.delete(PROMPT.DELETE + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
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
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  viewPrompt(orgId: string, id: string) {
    return this.http.get(PROMPT.VIEW + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
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
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  configPrompt(promptConfigData: any) {
    const {
      id,
      organisation,
      schema,
      tables,
      promptJoin,
      promptWhere,
      promptValues,
    } = promptConfigData;
    return this.http
      .post(PROMPT.CONFIG, {
        id,
        organisation,
        schema,
        tables,
        promptJoin,
        promptWhere,
        promptValues,
      })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }

  getConfig(orgId: string, id: string) {
    return this.http.get(PROMPT.GET_CONFIG + `${orgId}/${id}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }
}
