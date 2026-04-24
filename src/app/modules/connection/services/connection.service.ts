import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { CONNECTIONS } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class ConnectionService {
  constructor(private http: HttpClientService) {}

  listConnection(params: any) {
    return lastValueFrom(this.http.apiGet(CONNECTIONS.LIST, { params }));
  }

  deleteConnection(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(CONNECTIONS.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  bulkDeleteConnection(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(CONNECTIONS.BULK_DELETE + `${orgId}`, { body: { ids, justification } }));
  }

  addConnection(connectionForm: FormGroup) {
    const { organisation, datasource, name, description, dbUsername, dbPassword } = connectionForm.value;
    return lastValueFrom(this.http.apiPost(CONNECTIONS.ADD, {
      organisation, datasource, name, description, dbUsername, dbPassword,
    }));
  }

  viewConnection(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(CONNECTIONS.VIEW + `${orgId}/${id}`));
  }

  updateConnection(connectionForm: FormGroup, justification?: string) {
    const { id, name, description, organisation, datasource, status, dbUsername, dbPassword } = connectionForm.getRawValue();
    return lastValueFrom(this.http.apiPut(CONNECTIONS.UPDATE, {
      id, name, description, organisation, datasource,
      status: status ? 1 : 0,
      dbUsername, dbPassword, justification,
    }));
  }
}
