import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { USER } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class UserService {
  constructor(private http: HttpClientService) {}

  listUser(params: any) {
    return lastValueFrom(this.http.apiGet(USER.LIST, { params }));
  }

  bulkDeleteUser(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(USER.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  deleteUser(id: string, orgId: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(USER.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  addUser(userForm: FormGroup) {
    const { firstName, lastName, username, email, organisation, groupIds } = userForm.value;
    return lastValueFrom(this.http.apiPost(USER.ADD, {
      firstName, lastName, username, email, organisation, groupIds,
    }));
  }

  viewOrgUser(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(USER.VIEW + `${orgId}/${id}`));
  }

  updateUser(userForm: FormGroup, justification?: string) {
    const { id, firstName, lastName, username, email, status, organisation, groupIds } = userForm.getRawValue();
    return lastValueFrom(this.http.apiPut(USER.UPDATE, {
      id, firstName, lastName, username, email, organisation,
      status: status ? 1 : 0,
      groupIds: groupIds || [],
      justification,
    }));
  }

  unlockUser(orgId: string, id: string) {
    return lastValueFrom(this.http.apiPut(USER.UNLOCK + `${orgId}/${id}`, {}));
  }

  updateUserPassword(id: string, password: string) {
    return lastValueFrom(this.http.apiPut(USER.UPDATE_PASSWORD, { id, newPassword: password }));
  }
}
