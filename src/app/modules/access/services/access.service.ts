import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { ACCESS } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class AccessService {
  constructor(private http: HttpClientService) {}

  listAccessDetails(params: any) {
    return lastValueFrom(this.http.apiGet(ACCESS.GET + `/${params.orgId}/${params.connectionId}`));
  }

  grantAccess(payload: any) {
    const { organisation, datasource, users, groups, connection } = payload;
    return lastValueFrom(this.http.apiPost(ACCESS.GRANT, {
      organisation, datasource, users, groups, connection,
    }));
  }
}
