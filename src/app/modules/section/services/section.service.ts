import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { map } from 'rxjs';
import { SECTION } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class SectionService {
  constructor(private http: HttpClient) {}

  listSection(params: any) {
    return this.http
      .get(
        SECTION.LIST +
          `/${params.orgId}/${params.tabId}/${params.pageNumber}/${params.limit}`
      )
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  deleteSection(orgId: string, id: string) {
    return this.http
      .delete(SECTION.DELETE + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  addSection(formData: any) {
    const { organisation, database, sections } = formData;
    return this.http
      .post(SECTION.ADD, {
        organisation,
        database,
        sections,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  viewSection(orgId: string, id: string) {
    return this.http
      .get(SECTION.VIEW + `${orgId}/${id}`)
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }

  updateSection(sectionForm: FormGroup) {
    const { id, name, description, organisation, database, tab, status } =
      sectionForm.value;
    return this.http
      .put(SECTION.UPDATE, {
        id,
        name,
        description,
        organisation,
        database,
        tab,
        status: status ? 1 : 0,
      })
      .toPromise()
      .then((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      });
  }
}
