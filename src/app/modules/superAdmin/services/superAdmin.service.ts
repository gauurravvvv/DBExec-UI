import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { SUPER_ADMIN } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class SuperAdminService {
  constructor(private http: HttpClientService) {}

  listSuperAdmin(params: any) {
    return lastValueFrom(this.http.apiGet(SUPER_ADMIN.LIST, { params }));
  }

  deleteSuperAdmin(id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(SUPER_ADMIN.DELETE + `${id}`, { body: { justification } }));
  }

  bulkDeleteSuperAdmin(ids: string[], justification?: string) {
    return lastValueFrom(this.http.apiDelete(SUPER_ADMIN.BULK_DELETE, { body: { ids, justification } }));
  }

  addSuperAdmin(superAdminForm: FormGroup) {
    const { firstName, lastName, username, email } = superAdminForm.value;
    return lastValueFrom(this.http.apiPost(SUPER_ADMIN.ADD, {
      firstName, lastName, username, email,
    }));
  }

  viewSuperAdmin(id: string) {
    return lastValueFrom(this.http.apiGet(SUPER_ADMIN.VIEW + `${id}`));
  }

  updateSuperAdmin(superAdminForm: FormGroup, justification?: string) {
    const { id, firstName, lastName, username, email, status } = superAdminForm.getRawValue();
    return lastValueFrom(this.http.apiPut(SUPER_ADMIN.UPDATE, {
      id, firstName, lastName, username, email,
      status: status ? 1 : 0,
      justification,
    }));
  }

  unlockSuperAdmin(id: string) {
    return lastValueFrom(this.http.apiPut(SUPER_ADMIN.UNLOCK + `${id}`, {}));
  }

  updateSuperAdminPassword(id: string, password: string) {
    return lastValueFrom(this.http.apiPut(SUPER_ADMIN.UPDATE_PASSWORD, { id, newPassword: password }));
  }
}
