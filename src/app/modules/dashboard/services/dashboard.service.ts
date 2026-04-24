import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { DASHBOARD } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  constructor(private http: HttpClientService) {}

  addDashboard(payload: any) {
    return lastValueFrom(this.http.apiPost(DASHBOARD.ADD, payload));
  }

  getDashboard(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DASHBOARD.GET + `${orgId}/${id}`));
  }

  listDashboards(params: any) {
    return lastValueFrom(this.http.apiGet(DASHBOARD.LIST, { params }));
  }

  renderDashboard(orgId: string, id: string) {
    return lastValueFrom(this.http.apiGet(DASHBOARD.RENDER + `${orgId}/${id}`));
  }

  deleteDashboard(orgId: string, id: string, justification: string) {
    return lastValueFrom(this.http.apiDelete(DASHBOARD.DELETE + `${orgId}/${id}`, { body: { justification } }));
  }

  bulkDeleteDashboard(ids: string[], justification: string | undefined, orgId: string) {
    return lastValueFrom(this.http.apiDelete(DASHBOARD.BULK_DELETE + orgId, { body: { ids, justification } }));
  }
}
