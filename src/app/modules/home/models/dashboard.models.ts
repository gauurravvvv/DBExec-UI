/**
 * Response contracts for the landing-dashboard endpoints.
 * Mirror the shapes returned by dbexec-api `home` controllers.
 */

/** A metric with its current value and the pre-window baseline. */
export interface MetricPair {
  current: number;
  previous: number;
}

/** GET /home/summary */
export interface OrgSummary {
  usersActive: MetricPair;
  usersTotal: MetricPair;
  groups: MetricPair;
  datasources: MetricPair;
  datasets: MetricPair;
  analyses: MetricPair;
  dashboards: MetricPair;
  savedQueries: MetricPair;
  rlsRules: MetricPair;
  alerts: MetricPair;
}

/** GET /home/trends/queries */
export interface QueryTrendPoint {
  date: string;
  count: number;
}

/** GET /home/trends/logins */
export interface LoginTrendPoint {
  date: string;
  success: number;
  failed: number;
}

/** GET /home/activity */
export interface ActivityRow {
  id: string;
  actorName: string | null;
  action: string;
  module?: string;
  entityName?: string | null;
  entityType?: string | null;
  responseSuccess?: boolean;
  createdOn: string;
}

/** GET /home/executions-by-module */
export interface ModuleExecution {
  module: string;
  count: number;
}

/* -------- system-admin -------- */

/**
 * GET /home/system-admin/summary — MASTER-DB ONLY.
 * The system admin sees platform-level facts (orgs + system users from the
 * master/.env DB), never any organisation's internal data.
 */
export interface AdminSummary {
  window: { from: string; to: string } | null;
  platform: {
    orgsTotal: number;
    orgsActive: number;
    orgsInactive: number;
    orgsNewInPeriod: number;
  };
  systemUsers: {
    total: number;
    active: number;
  };
}

/** GET /home/system-admin/trends */
export interface AdminTrendPoint {
  date: string;
  queries: number;
  logins: number;
}

/** GET /home/system-admin/orgs-created */
export interface OrgsCreatedPoint {
  date: string;
  count: number;
}

/** GET /home/system-admin/organisations — master-DB org list (no internals). */
export interface AdminOrgRow {
  id: string;
  name: string | null;
  status: number;
  createdOn: string;
}

/** GET /home/system-admin/login-health */
export interface LoginHealthPoint {
  date: string;
  success: number;
  failed: number;
}
export interface LoginHealth {
  series: LoginHealthPoint[];
  summary: {
    total: number;
    success: number;
    failed: number;
    successRate: number;
  };
}

/** The date window every trend widget shares. */
export interface DateWindow {
  from: string; // ISO
  to: string; // ISO
}
