import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { SCREEN, TAB, SECTION } from 'src/app/constants/api';

export interface ExecuteScreenRequest {
  screenId: string;
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
export class ScreenService {
  constructor(private http: HttpClient) {}

  listScreen(params: any) {
    return this.http
      .get(SCREEN.LIST, { params })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteScreen(orgId: string, id: string, justification?: string) {
    return this.http
      .request('DELETE', SCREEN.DELETE + `${orgId}/${id}`, {
        body: { justification },
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addScreen(screenForm: FormGroup) {
    const { organisation, database, name, description } = screenForm.value;
    return this.http
      .post(SCREEN.ADD, {
        organisation,
        database,
        name,
        description,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewScreen(orgId: string, id: string) {
    return this.http
      .get(SCREEN.VIEW + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateScreen(screenForm: FormGroup, justification?: string) {
    const { id, name, description, organisation, database, status } =
      screenForm.getRawValue();
    return this.http
      .put(SCREEN.UPDATE, {
        id,
        name,
        description,
        organisation,
        database,
        status: status ? 1 : 0,
        justification,
      })
      .toPromise()
      .then(response => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  saveScreenConfiguration(
    configuration: any,
    organisation: string,
    databaseId: string,
    screenId: string,
  ) {
    return this.http
      .post(SCREEN.SAVE_CONFIGURATION, {
        configuration,
        organisation,
        databaseId,
        screenId,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getScreenConfiguration(orgId: string, id: string) {
    return this.http
      .get(SCREEN.GET_SCREEN_CONFIGURATION + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getScreenTabs(orgId: string, screenId: string) {
    return this.http
      .get(SCREEN.GET_TABS + `${orgId}/${screenId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getTabSections(orgId: string, screenId: string, tabId: string) {
    return this.http
      .get(TAB.GET_SECTIONS + `${orgId}/${screenId}/${tabId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getSectionPrompts(
    orgId: string,
    screenId: string,
    tabId: string,
    sectionId: string,
  ) {
    return this.http
      .get(SECTION.GET_PROMPTS + `${orgId}/${screenId}/${tabId}/${sectionId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  getScreenStructure(orgId: string, screenId: string) {
    return this.http
      .get(SCREEN.GET_STRUCTURE + `${orgId}/${screenId}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  executeScreen(payload: ExecuteScreenRequest) {
    return this.http
      .post(SCREEN.EXECUTE, payload)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
