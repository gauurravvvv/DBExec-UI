import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';
import { DASHBOARD } from 'src/app/constants/api';

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  constructor(private http: HttpClient) {}

  getSuperAdminDashboard(orgId: string) {
    return this.http.get(DASHBOARD.SUPER_ADMIN + `${orgId}`).pipe(
      map((response: any) => {
        const result = JSON.parse(JSON.stringify(response));
        return result;
      })
    );
  }
}
