import { Injectable } from '@angular/core';
import { HOME } from 'src/app/constants/api';
import { HttpClientService } from 'src/app/core/services/http-client.service';

@Injectable({
  providedIn: 'root',
})
export class HomeService {
  constructor(private http: HttpClientService) {}

  getSuperAdminDashboard(orgId: string) {
    return this.http.apiGet(HOME.SUPER_ADMIN + `${orgId}`);
  }
}
