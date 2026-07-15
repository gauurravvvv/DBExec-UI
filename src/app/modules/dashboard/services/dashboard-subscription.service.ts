import { Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { DASHBOARD_SUBSCRIPTION } from 'src/app/core/constants/api.constant';
import { HttpClientService } from 'src/app/core/services/http-client.service';

/**
 * The scheduled-delivery format for a dashboard subscription. Server-side
 * rendering produces a PDF (data tables) or PNG snapshot emailed to the
 * recipients on the cron schedule.
 */
export type DashboardDeliveryFormat = 'pdf' | 'png';

/** Recipients shape shared with the alerts module (jsonb on the entity). */
export interface DashboardSubscriptionRecipients {
  userIds: string[];
  emails: string[];
}

/** Create/update payload for a dashboard subscription. */
export interface DashboardSubscriptionPayload {
  dashboardId: string;
  cronExpression: string;
  timezone: string;
  format: DashboardDeliveryFormat;
  recipients: DashboardSubscriptionRecipients;
  enabled?: boolean;
}

/**
 * DashboardSubscriptionService — thin CRUD wrapper over the
 * `/dashboard-subscriptions` API (Dashboard & Analysis v2, Track E4).
 * Drives the "Schedule delivery" dialog on view-dashboard. All calls
 * pass `skipLoader` so the module keeps its own loading state and the
 * legacy global blocker stays out.
 */
@Injectable({ providedIn: 'root' })
export class DashboardSubscriptionService {
  constructor(private http: HttpClientService) {}

  /** GET /dashboard-subscriptions?dashboardId= → the dashboard's schedules. */
  async list(dashboardId: string): Promise<any[]> {
    const res: any = await lastValueFrom(
      this.http.apiGet(DASHBOARD_SUBSCRIPTION.LIST, {
        params: { dashboardId },
        skipLoader: true,
      }),
    );
    return res?.data?.subscriptions ?? res?.data ?? [];
  }

  /** POST /dashboard-subscriptions → create a schedule. */
  async create(payload: DashboardSubscriptionPayload): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(DASHBOARD_SUBSCRIPTION.ADD, payload, {
        skipLoader: true,
      }),
    );
  }

  /** PUT /dashboard-subscriptions/:id → update a schedule. */
  async update(
    id: string,
    payload: Partial<DashboardSubscriptionPayload>,
  ): Promise<any> {
    return lastValueFrom(
      this.http.apiPut(DASHBOARD_SUBSCRIPTION.UPDATE + id, payload, {
        skipLoader: true,
      }),
    );
  }

  /** DELETE /dashboard-subscriptions/:id → remove a schedule. */
  async delete(id: string, justification?: string): Promise<any> {
    return lastValueFrom(
      this.http.apiDelete(DASHBOARD_SUBSCRIPTION.DELETE + id, {
        body: { justification },
        skipLoader: true,
      }),
    );
  }

  /** POST /dashboard-subscriptions/:id/toggle → enable / disable. */
  async toggle(id: string): Promise<any> {
    return lastValueFrom(
      this.http.apiPost(
        DASHBOARD_SUBSCRIPTION.TOGGLE_PREFIX +
          id +
          DASHBOARD_SUBSCRIPTION.TOGGLE_SUFFIX,
        {},
        { skipLoader: true },
      ),
    );
  }
}
