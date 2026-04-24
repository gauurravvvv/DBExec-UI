import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { SECTION } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class SectionService {
  constructor(private http: HttpClientService) {}

  listSection(params: any) {
    return lastValueFrom(this.http.apiGet(SECTION.LIST, { params }));
  }

  deleteSection(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(SECTION.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  bulkDeleteSection(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(SECTION.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  addSection(formData: any) {
    const { organisation, datasource, sections } = formData;
    return lastValueFrom(this.http.apiPost(SECTION.ADD, { organisation, datasource, sections }));
  }

  viewSection(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(SECTION.VIEW + `${orgId}/${id}`));
  }

  updateSection(sectionForm: FormGroup, justification?: string) {
    const { id, name, description, organisation, datasource, tab, status } = sectionForm.value;
    return lastValueFrom(this.http.apiPut(SECTION.UPDATE, {
      id, name, description, organisation, datasource, tab,
      status: status ? 1 : 0,
      justification,
    }));
  }
}
