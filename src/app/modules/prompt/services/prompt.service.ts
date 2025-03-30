import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { PROMPT, SUPER_ADMIN } from 'src/app/constants/api';
import { IParams } from 'src/app/core/interfaces/global.interface';

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
      type,
      mandatory,
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
        type,
        mandatory,
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

  updateSuperAdminPassword(id: string, password: string) {
    return this.http
      .put(SUPER_ADMIN.UPDATE_PASSWORD, { id, newPassword: password })
      .pipe(
        map((response: any) => {
          const result = JSON.parse(JSON.stringify(response));
          return result;
        })
      );
  }
}
