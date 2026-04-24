import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { FormGroup } from '@angular/forms';
import { GROUP } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  constructor(private http: HttpClientService) {}

  listGroups(params: any) {
    return lastValueFrom(this.http.apiGet(GROUP.LIST, { params }));
  }

  addGroup(categoryForm: FormGroup) {
    const { name, description, organisation, roleId, users } = categoryForm.value;
    return lastValueFrom(this.http.apiPost(GROUP.ADD, {
      name, description, organisation, roleId, users,
    }));
  }

  bulkDeleteGroup(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(GROUP.BULK_DELETE + orgId, { body: { ids, justification } }));
  }

  deleteGroup(orgId: string, id: string, justification?: string) {
    return lastValueFrom(this.http.apiDelete(GROUP.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  viewGroup(orgId: string, categoryId: string) {
    return lastValueFrom(this.http.apiGet(GROUP.VIEW + `${orgId}/${categoryId}`));
  }

  editGroup(groupForm: FormGroup, justification?: string) {
    const { id, name, description, status, users, organisation, roleId } = groupForm.getRawValue();
    return lastValueFrom(this.http.apiPut(GROUP.EDIT, {
      id, name, description,
      status: status ? 1 : 0,
      users, organisation, roleId, justification,
    }));
  }
}
