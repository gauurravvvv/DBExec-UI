import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { TAB } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class TabService {
  constructor(private http: HttpClientService) {}

  listTab(params: any) {
    return lastValueFrom(this.http.apiGet(TAB.LIST, { params }));
  }

  listAllTabData(params: any) {
    return lastValueFrom(this.http.apiGet(TAB.GET_ALL, { params }));
  }

  deleteTab(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(TAB.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  bulkDeleteTab(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(TAB.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  addTab(tabForm: FormGroup) {
    const { organisation, datasource, tabs } = tabForm.value;
    return lastValueFrom(this.http.apiPost(TAB.ADD, { organisation, datasource, tabs }));
  }

  viewTab(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(TAB.VIEW + `${orgId}/${id}`));
  }

  updateTab(tabForm: FormGroup, justification?: string) {
    const { id, name, description, organisation, datasource, status } = tabForm.getRawValue();
    return lastValueFrom(this.http.apiPut(TAB.UPDATE, {
      id, name, description, organisation, datasource,
      status: status ? 1 : 0,
      justification,
    }));
  }
}
